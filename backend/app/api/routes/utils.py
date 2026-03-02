import base64
import binascii

from fastapi import APIRouter, Depends, HTTPException
from pydantic.networks import EmailStr

from app.api.deps import CurrentUser, get_current_active_superuser
from app.models import Message, ReportEmailCreate, SMSNotificationCreate
from app.utils import (
    generate_test_email,
    send_email,
    send_email_with_attachment,
    send_sms_notification,
)

router = APIRouter(prefix="/utils", tags=["utils"])


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
    try:
        send_email_with_attachment(
            email_to=str(payload.email_to),
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


@router.get("/health-check/")
async def health_check() -> bool:
    return True
