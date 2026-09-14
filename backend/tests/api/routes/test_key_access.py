from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models import Building, BuildingCreate, Condominio, CondominioCreate, Flat


def _create_flat(db: Session) -> Flat:
    condominio = Condominio.model_validate(CondominioCreate(nome="Test Keys Condominio"))
    db.add(condominio)
    db.flush()
    building = Building.model_validate(
        BuildingCreate(
            nome="Martlett",
            condominio_id=condominio.id,
            reading_types=3,
        )
    )
    db.add(building)
    db.flush()
    flat = Flat(numero=12, building_id=building.id)
    db.add(flat)
    db.commit()
    db.refresh(flat)
    return flat


def test_public_key_checkout_and_checkin(client: TestClient, db: Session) -> None:
    flat = _create_flat(db)
    base_url = f"{settings.API_V1_STR}/key-access/public/{flat.id}"

    initial_response = client.get(base_url)
    assert initial_response.status_code == 200
    assert initial_response.json()["key_code"] == "MA-12"
    assert initial_response.json()["is_checked_out"] is False

    checkout_response = client.post(
        f"{base_url}/checkout",
        json={"holder_name": "Ana Silva", "holder_mobile": "+5511999999999"},
    )
    assert checkout_response.status_code == 201
    assert checkout_response.json()["holder_name"] == "Ana Silva"
    assert checkout_response.json()["checked_in_at"] is None

    duplicate_response = client.post(
        f"{base_url}/checkout",
        json={"holder_name": "Bruno Lima", "holder_mobile": "+5511888888888"},
    )
    assert duplicate_response.status_code == 409

    checked_out_response = client.get(base_url)
    assert checked_out_response.status_code == 200
    assert checked_out_response.json()["is_checked_out"] is True
    assert "holder_name" not in checked_out_response.json()

    checkin_response = client.post(
        f"{base_url}/checkin",
        json={
            "returned_by_name": "Ana Silva",
            "returned_by_mobile": "+5511999999999",
        },
    )
    assert checkin_response.status_code == 200
    assert checkin_response.json()["returned_by_name"] == "Ana Silva"
    assert checkin_response.json()["checked_in_at"] is not None


def test_manager_reads_key_status_and_history(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    flat = _create_flat(db)
    base_url = f"{settings.API_V1_STR}/key-access/public/{flat.id}"
    checkout_response = client.post(
        f"{base_url}/checkout",
        json={"holder_name": "Carlos Souza", "holder_mobile": "07123456789"},
    )
    assert checkout_response.status_code == 201

    keys_response = client.get(
        f"{settings.API_V1_STR}/key-access/keys",
        headers=superuser_token_headers,
    )
    assert keys_response.status_code == 200
    key = next(item for item in keys_response.json()["data"] if item["flat_id"] == str(flat.id))
    assert key["key_code"] == "MA-12"
    assert key["holder_name"] == "Carlos Souza"

    history_response = client.get(
        f"{settings.API_V1_STR}/key-access/handovers",
        headers=superuser_token_headers,
    )
    assert history_response.status_code == 200
    history = next(
        item
        for item in history_response.json()["data"]
        if item["flat_id"] == str(flat.id)
    )
    assert history["holder_mobile"] == "07123456789"
