from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlmodel import delete
from sqlmodel import select
from sqlmodel import Session
import pytest
from unittest.mock import patch

from app import crud
from app.core.config import settings
from app.models import (
    BinMissCollection,
    BinSession,
    Building,
    BuildingCreate,
    Condominio,
    CondominioCreate,
    Funcionario,
    User,
    UserCreate,
)
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string


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


@pytest.fixture
def caretaker_bins_setup(db: Session) -> tuple[Funcionario, Building]:
    building = _create_test_condominio_and_building(db)
    caretaker = Funcionario(
        nome="Test Bins Caretaker",
        cargo=1,
        status=True,
        is_default=True,
        mobile=0,
        email=None,
        condominio_id=building.condominio_id,
    )
    db.add(caretaker)
    db.commit()
    db.refresh(caretaker)

    yield caretaker, building

    linked_users = db.exec(
        select(User).where(User.condominio_id == building.condominio_id)
    ).all()
    for user in linked_users:
        user.condominio_id = None
        db.add(user)
    db.commit()
    db.exec(delete(BinSession).where(BinSession.funcionario_id == caretaker.id))
    db.exec(delete(Funcionario).where(Funcionario.id == caretaker.id))
    db.exec(delete(Building).where(Building.id == building.id))
    db.exec(delete(Condominio).where(Condominio.id == building.condominio_id))
    db.commit()


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


def test_update_bin_miss_collection_record(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    building = _create_test_condominio_and_building(db)

    superuser = db.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    assert superuser is not None
    superuser.condominio_id = building.condominio_id
    db.add(superuser)
    db.commit()

    create_response = client.post(
        f"{settings.API_V1_STR}/bins/",
        json={
            "building_id": str(building.id),
            "miss_collection": True,
            "collection_type": "general",
            "collection_status": "miss",
        },
    )
    assert create_response.status_code == 201

    record = db.exec(
        select(BinMissCollection).where(BinMissCollection.building_id == building.id)
    ).first()
    assert record is not None

    update_response = client.patch(
        f"{settings.API_V1_STR}/bins/{record.id}",
        headers=superuser_token_headers,
        json={
            "data": "2026-03-15T09:30:00Z",
            "collection_type": "recycle",
            "collection_status": "late",
        },
    )

    assert update_response.status_code == 200
    payload = update_response.json()
    assert payload["id"] == str(record.id)
    assert payload["collection_type"] == "recycle"
    assert payload["collection_status"] == "late"
    assert payload["miss_collection"] is False
    updated_at = datetime.fromisoformat(payload["data"])
    assert updated_at.astimezone(timezone.utc) == datetime(
        2026, 3, 15, 9, 30, tzinfo=timezone.utc
    )


def test_delete_bin_miss_collection_record(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    building = _create_test_condominio_and_building(db)

    superuser = db.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    assert superuser is not None
    superuser.condominio_id = building.condominio_id
    db.add(superuser)
    db.commit()

    item = BinMissCollection(
        building_id=building.id,
        miss_collection=True,
        collection_type="general",
        collection_status="miss",
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    item_id = item.id

    response = client.delete(
        f"{settings.API_V1_STR}/bins/{item_id}",
        headers=superuser_token_headers,
    )

    assert response.status_code == 200
    db.expire_all()
    assert db.get(BinMissCollection, item_id) is None


def test_update_caretaker_bin_session_record(
    client: TestClient,
    db: Session,
    caretaker_bins_setup: tuple[Funcionario, Building],
    superuser_token_headers: dict[str, str],
) -> None:
    caretaker, building = caretaker_bins_setup

    superuser = db.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    assert superuser is not None
    superuser.condominio_id = building.condominio_id
    db.add(superuser)
    db.commit()

    with patch("app.api.routes.bins.get_default_caretaker", return_value=caretaker):
        create_response = client.post(
            f"{settings.API_V1_STR}/bins/sessions",
            json={
                "building_id": str(building.id),
                "operacao": 0,
                "data": "2026-03-15T08:00:00Z",
            },
        )

    assert create_response.status_code == 201
    record_id = create_response.json()["id"]

    update_response = client.patch(
        f"{settings.API_V1_STR}/bins/sessions/{record_id}",
        headers=superuser_token_headers,
        json={"data": "2026-03-15T09:30:00Z"},
    )

    assert update_response.status_code == 200
    payload = update_response.json()
    assert payload["id"] == record_id
    updated_at = datetime.fromisoformat(payload["data"])
    assert updated_at.astimezone(timezone.utc) == datetime(
        2026, 3, 15, 9, 30, tzinfo=timezone.utc
    )


def test_update_caretaker_bin_session_requires_manager_permissions(
    client: TestClient,
    db: Session,
    caretaker_bins_setup: tuple[Funcionario, Building],
) -> None:
    caretaker, building = caretaker_bins_setup

    normal_user_password = random_lower_string()
    normal_user_email = random_email()
    crud.create_user(
        session=db,
        user_create=UserCreate(
            email=normal_user_email,
            password=normal_user_password,
            is_active=True,
            is_superuser=False,
            cargo=1,
            condominio_id=building.condominio_id,
        ),
    )
    normal_user_headers = user_authentication_headers(
        client=client,
        email=normal_user_email,
        password=normal_user_password,
    )

    with patch("app.api.routes.bins.get_default_caretaker", return_value=caretaker):
        create_response = client.post(
            f"{settings.API_V1_STR}/bins/sessions",
            json={
                "building_id": str(building.id),
                "operacao": 0,
                "data": "2026-03-15T08:00:00Z",
            },
        )

    assert create_response.status_code == 201
    record_id = create_response.json()["id"]

    update_response = client.patch(
        f"{settings.API_V1_STR}/bins/sessions/{record_id}",
        headers=normal_user_headers,
        json={"data": "2026-03-15T09:30:00Z"},
    )

    assert update_response.status_code == 403
