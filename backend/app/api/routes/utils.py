import base64
import binascii
from pydantic import TypeAdapter, ValidationError

from fastapi import APIRouter, Depends, Form, HTTPException
from pydantic.networks import EmailStr
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep, get_current_active_superuser
from app.core.db import ensure_notification_history_schema
from app.models import (
    EmailNotificationCreate,
    Message,
    NotificationHistory,
    NotificationHistoryPublic,
    NotificationHistoryPublicList,
    ReportEmailCreate,
    SMSNotificationCreate,
)
from app.utils import (
    generate_test_email,
    send_email,
    send_email_with_attachments,
    send_email_with_attachment,
    send_sms_notification,
    update_notification_history_status,
)

router = APIRouter(prefix="/utils", tags=["utils"])
email_adapter = TypeAdapter(EmailStr)


def _parse_email_recipients(value: str) -> list[str]:
    recipients = [item.strip() for item in value.split(",") if item.strip()]
    if not recipients:
        raise HTTPException(status_code=422, detail="Email is required")
    try:
        return [str(email_adapter.validate_python(email)) for email in recipients]
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="Invalid email address") from exc


@router.post(
    "/test-email/",
    dependencies=[Depends(get_current_active_superuser)],
    status_code=201,
)
def test_email(email_to: EmailStr) -> Message:
    """
    Test emails.
    """
    email_data = generate_test_email(email_to=email_to)
    send_email(
        email_to=email_to,
        subject=email_data.subject,
        html_content=email_data.html_content,
    )
    return Message(message="Test email sent")


@router.post(
    "/test-sms/",
    dependencies=[Depends(get_current_active_superuser)],
    status_code=201,
)
def test_sms(payload: SMSNotificationCreate) -> Message:
    """
    Test SMS notifications using Twilio.
    """
    sid = send_sms_notification(phone_to=payload.phone_to, body=payload.body)
    return Message(message=f"Test SMS sent (sid={sid})")


@router.post(
    "/send-sms/",
    status_code=201,
)
def send_sms(payload: SMSNotificationCreate, current_user: CurrentUser) -> Message:
    """
    Send SMS notifications using Twilio (manager or superuser).
    """
    if not current_user.is_superuser and (current_user.cargo or 0) < 1:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    sid = send_sms_notification(phone_to=payload.phone_to, body=payload.body)
    return Message(message=f"SMS sent (sid={sid})")


@router.post(
    "/send-email/",
    status_code=201,
)
def send_email_notification(
    payload: EmailNotificationCreate, current_user: CurrentUser
) -> Message:
    """
    Send email notifications with optional attachments (manager or superuser).
    """
    if not current_user.is_superuser and (current_user.cargo or 0) < 1:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    attachments: list[dict[str, str | bytes]] = []
    total_size = 0
    for attachment in payload.attachments:
        try:
            file_bytes = base64.b64decode(attachment.file_data_base64, validate=True)
        except (binascii.Error, ValueError):
            raise HTTPException(status_code=422, detail="Invalid attachment file_data_base64")

        if not file_bytes:
            raise HTTPException(status_code=422, detail="Empty attachment file")
        if len(file_bytes) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Attachment file too large")

        total_size += len(file_bytes)
        if total_size > 25 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Total attachments too large")

        attachments.append(
            {
                "file_name": attachment.file_name.strip(),
                "file_bytes": file_bytes,
                "mime_type": attachment.mime_type or "application/octet-stream",
            }
        )

    html_content = payload.html_content.strip() or "<p>Hello,</p><p>Please see the attached files.</p>"
    try:
        send_email_with_attachments(
            email_to=str(payload.email_to),
            subject=payload.subject.strip(),
            html_content=html_content,
            attachments=attachments,
        )
    except AssertionError:
        raise HTTPException(
            status_code=400,
            detail="Email is not configured. Set SMTP_HOST and EMAILS_FROM_EMAIL.",
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return Message(message="Email sent successfully")


@router.post(
    "/send-report-email/",
    status_code=201,
)
def send_report_email(payload: ReportEmailCreate, current_user: CurrentUser) -> Message:
    """
    Send report PDF by email (manager or superuser).
    """
    if not current_user.is_superuser and (current_user.cargo or 0) < 1:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    try:
        file_bytes = base64.b64decode(payload.file_data_base64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=422, detail="Invalid file_data_base64")

    if not file_bytes:
        raise HTTPException(status_code=422, detail="Empty report file")
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Report file too large")
    if not file_bytes.startswith(b"%PDF"):
        raise HTTPException(status_code=422, detail="Attachment must be a PDF file")

    html_content = payload.html_content.strip() or (
        "<p>Hello,</p><p>Your readings report is attached as PDF.</p>"
    )
    recipients = _parse_email_recipients(str(payload.email_to))
    try:
        for recipient in recipients:
            send_email_with_attachment(
                email_to=recipient,
                subject=payload.subject.strip(),
                html_content=html_content,
                file_name=payload.file_name.strip(),
                file_bytes=file_bytes,
            )
    except AssertionError:
        raise HTTPException(
            status_code=400,
            detail="Email is not configured. Set SMTP_HOST and EMAILS_FROM_EMAIL.",
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return Message(message="Report sent successfully")


@router.get(
    "/notification-history/",
    response_model=NotificationHistoryPublicList,
)
def read_notification_history(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
) -> NotificationHistoryPublicList:
    if not current_user.is_superuser and (current_user.cargo or 0) < 1:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    ensure_notification_history_schema(session)

    count = session.exec(
        select(func.count()).select_from(NotificationHistory)
    ).one()
    rows = session.exec(
        select(NotificationHistory)
        .order_by(NotificationHistory.created_at.desc())
        .offset(skip)
        .limit(limit)
    ).all()

    return NotificationHistoryPublicList(
        data=[
            NotificationHistoryPublic(
                id=item.id,
                created_at=item.created_at,
                notification_type=item.notification_type,
                recipient_to=item.recipient_to,
                message=item.message,
                delivery_status=item.delivery_status,
                success=item.success,
                provider_message_id=item.provider_message_id,
                error_message=item.error_message,
            )
            for item in rows
        ],
        count=count,
    )


@router.post("/twilio-status/")
def twilio_status_callback(
    MessageSid: str = Form(...),
    MessageStatus: str = Form(...),
    ErrorCode: str | None = Form(default=None),
) -> Message:
    delivery_status = MessageStatus.strip().lower()
    success = delivery_status in {"delivered", "sent", "read"}
    if delivery_status in {"failed", "undelivered"}:
        success = False

    update_notification_history_status(
        provider_message_id=MessageSid,
        delivery_status=delivery_status,
        success=success,
        error_message=ErrorCode,
    )
    return Message(message="Status received")


@router.get("/health-check/")
async def health_check() -> bool:
    return True
