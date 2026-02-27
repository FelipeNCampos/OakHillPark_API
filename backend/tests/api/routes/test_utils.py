from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.config import settings


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
