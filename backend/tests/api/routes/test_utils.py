from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlmodel import Session, delete, text

from app.core.config import settings
from app.models import NotificationHistory


def test_test_sms(client: TestClient, superuser_token_headers: dict[str, str]) -> None:
    payload = {"phone_to": "+15551234567", "body": "Teste de notificacao"}

    with patch("app.api.routes.utils.send_sms_notification", return_value="SM123"):
        response = client.post(
            f"{settings.API_V1_STR}/utils/test-sms/",
            headers=superuser_token_headers,
            json=payload,
        )

    assert response.status_code == 201
    assert response.json() == {"message": "Test SMS sent (sid=SM123)"}


def test_send_sms(client: TestClient, superuser_token_headers: dict[str, str]) -> None:
    payload = {"phone_to": "+15551234567", "body": "Teste de envio real"}

    with patch("app.api.routes.utils.send_sms_notification", return_value="SM456"):
        response = client.post(
            f"{settings.API_V1_STR}/utils/send-sms/",
            headers=superuser_token_headers,
            json=payload,
        )

    assert response.status_code == 201
    assert response.json() == {"message": "SMS sent (sid=SM456)"}


def test_send_email_notification(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    payload = {
        "email_to": "resident@example.com",
        "subject": "Subject",
        "html_content": "<p>Hello</p>",
        "attachments": [
            {
                "file_name": "hello.txt",
                "file_data_base64": "aGVsbG8=",
                "mime_type": "text/plain",
            }
        ],
    }

    with patch("app.api.routes.utils.send_email_with_attachments") as email_mock:
        response = client.post(
            f"{settings.API_V1_STR}/utils/send-email/",
            headers=superuser_token_headers,
            json=payload,
        )

    assert response.status_code == 201
    assert response.json() == {"message": "Email sent successfully"}
    email_mock.assert_called_once()


def test_send_sms_records_notification_history(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
    monkeypatch,
) -> None:
    db.exec(text("DROP TABLE IF EXISTS notificationhistory"))
    db.commit()

    monkeypatch.setattr(settings, "TWILIO_ACCOUNT_SID", "sid")
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "token")
    monkeypatch.setattr(settings, "TWILIO_FROM_NUMBER", "+15550001111")
    monkeypatch.setattr(settings, "TWILIO_MESSAGING_SERVICE_SID", None)

    fake_message = SimpleNamespace(sid="SM789", status="queued")
    fake_client = SimpleNamespace(messages=SimpleNamespace(create=lambda **_: fake_message))

    with patch("app.utils.Client", return_value=fake_client):
        response = client.post(
            f"{settings.API_V1_STR}/utils/send-sms/",
            headers=superuser_token_headers,
            json={"phone_to": "+15551234567", "body": "History SMS"},
        )

    assert response.status_code == 201

    history_response = client.get(
        f"{settings.API_V1_STR}/utils/notification-history/",
        headers=superuser_token_headers,
    )

    assert history_response.status_code == 200
    items = history_response.json()["data"]
    entry = next(item for item in items if item["provider_message_id"] == "SM789")
    assert entry["notification_type"] == "sms"
    assert entry["recipient_to"] == "+15551234567"
    assert entry["delivery_status"] == "queued"
    assert entry["success"] is True


def test_send_email_records_notification_history(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
    monkeypatch,
) -> None:
    db.exec(delete(NotificationHistory))
    db.commit()

    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.test.local")
    monkeypatch.setattr(settings, "EMAILS_FROM_EMAIL", "noreply@test.local")

    fake_response = SimpleNamespace(
        success=True,
        status_code=250,
        status_text="OK",
        error=None,
    )

    with patch("app.utils.emails.Message.send", return_value=fake_response):
        response = client.post(
            f"{settings.API_V1_STR}/utils/send-email/",
            headers=superuser_token_headers,
            json={
                "email_to": "resident@example.com",
                "subject": "History email",
                "html_content": "<p>Hello history</p>",
                "attachments": [],
            },
        )

    assert response.status_code == 201

    history_response = client.get(
        f"{settings.API_V1_STR}/utils/notification-history/",
        headers=superuser_token_headers,
    )

    assert history_response.status_code == 200
    items = history_response.json()["data"]
    entry = next(
        item
        for item in items
        if item["notification_type"] == "email"
        and item["recipient_to"] == "resident@example.com"
    )
    assert entry["delivery_status"] == "sent"
    assert entry["success"] is True
    assert "History email" in entry["message"]
