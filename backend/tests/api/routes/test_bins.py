from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlmodel import select
from sqlmodel import Session

from app.core.config import settings
from app.models import (
    BinMissCollection,
    Building,
    BuildingCreate,
    Condominio,
    CondominioCreate,
    User,
)


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
    assert response.json() == {"message": "Bins collection record saved"}


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


def test_read_bin_miss_collections_filters(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    condominio = Condominio.model_validate(CondominioCreate(nome="Test Bins Filters"))
    db.add(condominio)
    db.flush()

    building_a = Building.model_validate(
        BuildingCreate(
            nome="Test Bins Building A",
            condominio_id=condominio.id,
            reading_types=3,
        )
    )
    building_b = Building.model_validate(
        BuildingCreate(
            nome="Test Bins Building B",
            condominio_id=condominio.id,
            reading_types=3,
        )
    )
    db.add(building_a)
    db.add(building_b)
    db.commit()
    db.refresh(building_a)
    db.refresh(building_b)

    superuser = db.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    assert superuser is not None
    superuser.condominio_id = condominio.id
    db.add(superuser)
    db.commit()

    payload_a = {"building_id": str(building_a.id), "miss_collection": True}
    payload_b = {"building_id": str(building_b.id), "miss_collection": True}
    response_a = client.post(f"{settings.API_V1_STR}/bins/", json=payload_a)
    response_b = client.post(f"{settings.API_V1_STR}/bins/", json=payload_b)
    assert response_a.status_code == 201
    assert response_b.status_code == 201

    now = datetime.now(timezone.utc)
    older = now - timedelta(days=10)
    newer = now - timedelta(days=1)

    rec_a = db.exec(
        select(BinMissCollection).where(BinMissCollection.building_id == building_a.id)
    ).first()
    rec_b = db.exec(
        select(BinMissCollection).where(BinMissCollection.building_id == building_b.id)
    ).first()
    assert rec_a is not None
    assert rec_b is not None

    rec_a.data = older
    rec_b.data = newer
    db.add(rec_a)
    db.add(rec_b)
    db.commit()

    by_building = client.get(
        f"{settings.API_V1_STR}/bins/",
        params={"building_id": str(building_a.id)},
        headers=superuser_token_headers,
    )
    assert by_building.status_code == 200
    by_building_data = by_building.json()["data"]
    assert len(by_building_data) == 1
    assert by_building_data[0]["building_id"] == str(building_a.id)

    by_date = client.get(
        f"{settings.API_V1_STR}/bins/",
        params={"date_from": now.date().isoformat()},
        headers=superuser_token_headers,
    )
    assert by_date.status_code == 200
    assert by_date.json()["count"] == 0
