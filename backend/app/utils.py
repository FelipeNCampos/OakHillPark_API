import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import emails  # type: ignore
import jwt
from jinja2 import Template
from jwt.exceptions import InvalidTokenError
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client

from app.core import security
from app.core.config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
E164_PHONE_REGEX = re.compile(r"^\+[1-9]\d{8,19}$")


@dataclass
class EmailData:
    html_content: str
    subject: str


def render_email_template(*, template_name: str, context: dict[str, Any]) -> str:
    template_str = (
        Path(__file__).parent / "email-templates" / "build" / template_name
    ).read_text()
    html_content = Template(template_str).render(context)
    return html_content


def send_email(
    *,
    email_to: str,
    subject: str = "",
    html_content: str = "",
) -> None:
    assert settings.emails_enabled, "no provided configuration for email variables"
    message = emails.Message(
        subject=subject,
        html=html_content,
        mail_from=(settings.EMAILS_FROM_NAME, settings.EMAILS_FROM_EMAIL),
    )
    smtp_options = {
        "host": settings.SMTP_HOST,
        "port": settings.SMTP_PORT,
        # The emails library defaults to fail_silently=True when omitted.
        # Force explicit failure so callers don't treat silent SMTP errors as success.
        "fail_silently": False,
    }
    if settings.SMTP_TLS:
        smtp_options["tls"] = True
    elif settings.SMTP_SSL:
        smtp_options["ssl"] = True
    if settings.SMTP_USER:
        smtp_options["user"] = settings.SMTP_USER
    if settings.SMTP_PASSWORD:
        # Gmail app passwords are commonly copied with spaces.
        # Normalize by removing whitespace to avoid SMTP auth failures.
        smtp_password = settings.SMTP_PASSWORD
        if settings.SMTP_HOST and "gmail.com" in settings.SMTP_HOST.lower():
            smtp_password = "".join(smtp_password.split())
        smtp_options["password"] = smtp_password
    try:
        response = message.send(to=email_to, smtp=smtp_options)
        if not getattr(response, "success", False):
            error = getattr(response, "error", None)
            status_code = getattr(response, "status_code", None)
            status_text = getattr(response, "status_text", None)
            raise RuntimeError(
                f"SMTP did not accept the message (status={status_code}, detail={status_text}, error={error})"
            )
        logger.info(f"send email result: {response}")
    except Exception as exc:
        logger.exception("send email failed")
        raise RuntimeError("Failed to send email. Check SMTP credentials/settings.") from exc


def send_email_with_attachment(
    *,
    email_to: str,
    subject: str = "",
    html_content: str = "",
    file_name: str,
    file_bytes: bytes,
    mime_type: str = "application/pdf",
) -> None:
    assert settings.emails_enabled, "no provided configuration for email variables"
    message = emails.Message(
        subject=subject,
        html=html_content,
        mail_from=(settings.EMAILS_FROM_NAME, settings.EMAILS_FROM_EMAIL),
    )
    message.attach(
        data=file_bytes,
        filename=file_name,
        content_type=mime_type,
        content_disposition="attachment",
    )
    smtp_options = {
        "host": settings.SMTP_HOST,
        "port": settings.SMTP_PORT,
        # The emails library defaults to fail_silently=True when omitted.
        # Force explicit failure so callers don't treat silent SMTP errors as success.
        "fail_silently": False,
    }
    if settings.SMTP_TLS:
        smtp_options["tls"] = True
    elif settings.SMTP_SSL:
        smtp_options["ssl"] = True
    if settings.SMTP_USER:
        smtp_options["user"] = settings.SMTP_USER
    if settings.SMTP_PASSWORD:
        # Gmail app passwords are commonly copied with spaces.
        # Normalize by removing whitespace to avoid SMTP auth failures.
        smtp_password = settings.SMTP_PASSWORD
        if settings.SMTP_HOST and "gmail.com" in settings.SMTP_HOST.lower():
            smtp_password = "".join(smtp_password.split())
        smtp_options["password"] = smtp_password
    try:
        response = message.send(to=email_to, smtp=smtp_options)
        if not getattr(response, "success", False):
            error = getattr(response, "error", None)
            status_code = getattr(response, "status_code", None)
            status_text = getattr(response, "status_text", None)
            raise RuntimeError(
                f"SMTP did not accept the attachment message (status={status_code}, detail={status_text}, error={error})"
            )
        logger.info(f"send email with attachment result: {response}")
    except Exception as exc:
        logger.exception("send email with attachment failed")
        raise RuntimeError("Failed to send email. Check SMTP credentials/settings.") from exc


def send_email_with_attachments(
    *,
    email_to: str,
    subject: str = "",
    html_content: str = "",
    attachments: list[dict[str, Any]] | None = None,
) -> None:
    assert settings.emails_enabled, "no provided configuration for email variables"
    message = emails.Message(
        subject=subject,
        html=html_content,
        mail_from=(settings.EMAILS_FROM_NAME, settings.EMAILS_FROM_EMAIL),
    )
    for attachment in attachments or []:
        message.attach(
            data=attachment["file_bytes"],
            filename=attachment["file_name"],
            content_type=attachment.get("mime_type") or "application/octet-stream",
            content_disposition="attachment",
        )

    smtp_options = {
        "host": settings.SMTP_HOST,
        "port": settings.SMTP_PORT,
        "fail_silently": False,
    }
    if settings.SMTP_TLS:
        smtp_options["tls"] = True
    elif settings.SMTP_SSL:
        smtp_options["ssl"] = True
    if settings.SMTP_USER:
        smtp_options["user"] = settings.SMTP_USER
    if settings.SMTP_PASSWORD:
        smtp_password = settings.SMTP_PASSWORD
        if settings.SMTP_HOST and "gmail.com" in settings.SMTP_HOST.lower():
            smtp_password = "".join(smtp_password.split())
        smtp_options["password"] = smtp_password
    try:
        response = message.send(to=email_to, smtp=smtp_options)
        if not getattr(response, "success", False):
            error = getattr(response, "error", None)
            status_code = getattr(response, "status_code", None)
            status_text = getattr(response, "status_text", None)
            raise RuntimeError(
                f"SMTP did not accept the attachment message (status={status_code}, detail={status_text}, error={error})"
            )
        logger.info(f"send email with attachments result: {response}")
    except Exception as exc:
        logger.exception("send email with attachments failed")
        raise RuntimeError("Failed to send email. Check SMTP credentials/settings.") from exc


def send_sms_notification(*, phone_to: str, body: str) -> str:
    if not settings.twilio_enabled:
        error_message = "Twilio configuration is missing"
        logger.error(
            f"twilio sms skipped - reason='{error_message}' phone_to='{phone_to}'"
        )
        raise ValueError(error_message)

    if not body.strip():
        error_message = "SMS body cannot be empty"
        logger.error(
            f"twilio sms skipped - reason='{error_message}' phone_to='{phone_to}'"
        )
        raise ValueError(error_message)

    if not E164_PHONE_REGEX.fullmatch(phone_to):
        error_message = "Phone number must be in E.164 format"
        logger.error(
            f"twilio sms skipped - reason='{error_message}' phone_to='{phone_to}'"
        )
        raise ValueError(error_message)

    logger.info(f"twilio sms sending - to='{phone_to}'")
    try:
        client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        message_payload: dict[str, Any] = {
            "body": body,
            "to": phone_to,
        }
        if settings.TWILIO_MESSAGING_SERVICE_SID:
            message_payload["messaging_service_sid"] = (
                settings.TWILIO_MESSAGING_SERVICE_SID
            )
        else:
            message_payload["from_"] = settings.TWILIO_FROM_NUMBER

        if settings.TWILIO_STATUS_CALLBACK_URL:
            message_payload["status_callback"] = str(
                settings.TWILIO_STATUS_CALLBACK_URL
            )
            message_payload["status_callback_method"] = "POST"

        message = client.messages.create(**message_payload)
        logger.info(
            f"twilio sms sent - sid='{message.sid}' status='{message.status}' to='{phone_to}'"
        )
        return message.sid
    except TwilioRestException as exc:
        logger.exception(
            f"twilio sms failed - to='{phone_to}' code='{exc.code}' message='{exc.msg}'"
        )
        raise


def generate_test_email(email_to: str) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Test email"
    html_content = render_email_template(
        template_name="test_email.html",
        context={"project_name": settings.PROJECT_NAME, "email": email_to},
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_reset_password_email(email_to: str, email: str, token: str) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Password recovery for user {email}"
    link = f"{settings.FRONTEND_HOST}/reset-password?token={token}"
    html_content = render_email_template(
        template_name="reset_password.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": email,
            "email": email_to,
            "valid_hours": settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS,
            "link": link,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_new_account_email(
    email_to: str, username: str, password: str
) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - New account for user {username}"
    html_content = render_email_template(
        template_name="new_account.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": username,
            "password": password,
            "email": email_to,
            "link": settings.FRONTEND_HOST,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_password_reset_token(email: str) -> str:
    delta = timedelta(hours=settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS)
    now = datetime.now(timezone.utc)
    expires = now + delta
    exp = expires.timestamp()
    encoded_jwt = jwt.encode(
        {"exp": exp, "nbf": now, "sub": email},
        settings.SECRET_KEY,
        algorithm=security.ALGORITHM,
    )
    return encoded_jwt


def verify_password_reset_token(token: str) -> str | None:
    try:
        decoded_token = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        return str(decoded_token["sub"])
    except InvalidTokenError:
        return None
