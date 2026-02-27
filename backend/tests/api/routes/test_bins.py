from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models import Building, BuildingCreate, Condominio, CondominioCreate


def _create_test_condominio_and_building(db: Session) -> Building:
    condominio_in = CondominioCreate(nome="Test Bins Condominio")
    condominio = Condominio.model_validate(condominio_in)
    db.add(condominio)
    db.flush()

    building_in = BuildingCreate(
        nome="Test Bins Building",
        condominio_id=condominio.id,
        reading_types=3,
    )
    building = Building.model_validate(building_in)
    db.add(building)
    db.commit()
    db.refresh(building)
    return building


def test_create_bin_miss_collection(client: TestClient, db: Session) -> None:
    building = _create_test_condominio_and_building(db)

    payload = {
        "building_id": str(building.id),
        "miss_collection": True,
    }
    response = client.post(f"{settings.API_V1_STR}/bins/", json=payload)

    assert response.status_code == 201
    assert response.json() == {"message": "Miss collection recorded"}


def test_read_bin_miss_collections(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    building = _create_test_condominio_and_building(db)
    payload = {"building_id": str(building.id), "miss_collection": True}
    create_response = client.post(f"{settings.API_V1_STR}/bins/", json=payload)
    assert create_response.status_code == 201

    response = client.get(
        f"{settings.API_V1_STR}/bins/",
        headers=superuser_token_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert "data" in body
    assert "count" in body
