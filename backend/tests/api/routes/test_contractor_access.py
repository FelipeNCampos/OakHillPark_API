import uuid
from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import (
    Building,
    BuildingCreate,
    Condominio,
    CondominioCreate,
    Flat,
    FlatCreate,
    Morador,
    MoradorCreate,
    UserCreate,
)
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string


def _create_test_condominio(db: Session) -> Condominio:
    condominio = Condominio.model_validate(
        CondominioCreate(nome="Test Contractor Condominio")
    )
    db.add(condominio)
    db.commit()
    db.refresh(condominio)
    return condominio


def _create_test_building(
    db: Session, condominio_id: uuid.UUID, *, name: str = "Merlin"
) -> Building:
    building = Building.model_validate(
        BuildingCreate(nome=name, condominio_id=condominio_id)
    )
    db.add(building)
    db.commit()
    db.refresh(building)
    return building


def _create_manager_headers(
    client: TestClient, db: Session, condominio_id: uuid.UUID
) -> dict[str, str]:
    email = random_email()
    password = random_lower_string()
    crud.create_user(
        session=db,
        user_create=UserCreate(
            email=email,
            password=password,
            cargo=2,
            condominio_id=condominio_id,
        ),
    )
    return user_authentication_headers(client=client, email=email, password=password)


def _create_martlett_owner_flat_6(db: Session, condominio_id: uuid.UUID) -> Morador:
    martlett = _create_test_building(db, condominio_id, name="Martlett")
    flat = Flat.model_validate(
        FlatCreate(
            numero=6,
            status=True,
            building_id=martlett.id,
            reading_types=0,
        )
    )
    db.add(flat)
    db.flush()

    owner = Morador.model_validate(
        MoradorCreate(
            cargo=0,
            nome="Martlett Owner 1",
            email=None,
            mobile="07700990000",
            receives_flat_reading_sms=False,
            flat_id=flat.id,
        )
    )
    db.add(owner)
    db.commit()
    db.refresh(owner)
    return owner


def test_contractor_check_in_and_read_open_visits(
    client: TestClient,
    db: Session,
) -> None:
    condominio = _create_test_condominio(db)
    building = _create_test_building(db, condominio.id, name="Merlin")
    previous_codes = dict(settings.CONTRACTOR_DOOR_CODES)
    settings.CONTRACTOR_DOOR_CODES = {"Merlin": "2468"}

    try:
        response = client.post(
            f"{settings.API_V1_STR}/contractor-access/check-in",
            json={
                "condominio_id": str(condominio.id),
                "name": "John Smith",
                "company": "ABC Contractors",
                "building_id": str(building.id),
                "job_description": "Electrical inspection",
                "mobile": "07123456789",
            },
        )

        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "John Smith"
        assert body["company"] == "ABC Contractors"
        assert body["building_name"] == "Merlin"
        assert body["door_code"] == "2468"
        assert body["out_at"] is None

        open_response = client.get(
            f"{settings.API_V1_STR}/contractor-access/open",
            params={"condominio_id": str(condominio.id)},
        )

        assert open_response.status_code == 200
        open_body = open_response.json()
        assert open_body["count"] == 1
        assert open_body["data"][0]["id"] == body["id"]
        assert open_body["data"][0]["mobile"] == "07123456789"
    finally:
        settings.CONTRACTOR_DOOR_CODES = previous_codes


def test_contractor_check_in_uses_temporary_door_code_when_unconfigured(
    client: TestClient,
    db: Session,
) -> None:
    condominio = _create_test_condominio(db)
    building = _create_test_building(db, condominio.id, name="Falcon")
    previous_codes = dict(settings.CONTRACTOR_DOOR_CODES)
    settings.CONTRACTOR_DOOR_CODES = {}

    try:
        response = client.post(
            f"{settings.API_V1_STR}/contractor-access/check-in",
            json={
                "condominio_id": str(condominio.id),
                "name": "Maria Green",
                "company": "Temp Codes Ltd",
                "building_id": str(building.id),
                "job_description": "Boiler inspection",
                "mobile": "07000000111",
            },
        )

        assert response.status_code == 201
        body = response.json()
        assert body["building_name"] == "Falcon"
        assert body["door_code"] == "FalconCode"
    finally:
        settings.CONTRACTOR_DOOR_CODES = previous_codes


def test_contractor_access_buildings_hides_auxiliary_buildings(
    client: TestClient,
    db: Session,
) -> None:
    condominio = _create_test_condominio(db)
    visible_building = _create_test_building(db, condominio.id, name="Merlin")
    _create_test_building(db, condominio.id, name="Cleaner")
    _create_test_building(db, condominio.id, name="Caretaker")
    _create_test_building(db, condominio.id, name="Contractor")

    response = client.get(
        f"{settings.API_V1_STR}/contractor-access/buildings",
        params={"condominio_id": str(condominio.id)},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["data"] == [
        {
            "id": str(visible_building.id),
            "name": "Merlin",
        }
    ]


def test_contractor_check_out_uses_visit_id_with_repeated_phone(
    client: TestClient,
    db: Session,
) -> None:
    condominio = _create_test_condominio(db)
    first_building = _create_test_building(db, condominio.id, name="Oak Lodge")
    second_building = _create_test_building(db, condominio.id, name="Merlin")

    first = client.post(
        f"{settings.API_V1_STR}/contractor-access/check-in",
        json={
            "condominio_id": str(condominio.id),
            "name": "Alex Brown",
            "company": "Same Phone Ltd",
            "building_id": str(first_building.id),
            "job_description": "Lift maintenance",
            "mobile": "07000000000",
        },
    )
    second = client.post(
        f"{settings.API_V1_STR}/contractor-access/check-in",
        json={
            "condominio_id": str(condominio.id),
            "name": "Alex Brown",
            "company": "Same Phone Ltd",
            "building_id": str(second_building.id),
            "job_description": "Painting",
            "mobile": "07000000000",
        },
    )

    assert first.status_code == 201
    assert second.status_code == 201
    first_id = first.json()["id"]
    second_id = second.json()["id"]

    checkout_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/check-out",
        json={
            "condominio_id": str(condominio.id),
            "visit_id": first_id,
        },
    )

    assert checkout_response.status_code == 201
    assert checkout_response.json()["id"] == first_id
    assert checkout_response.json()["out_at"] is not None

    open_response = client.get(
        f"{settings.API_V1_STR}/contractor-access/open",
        params={"condominio_id": str(condominio.id)},
    )
    assert open_response.status_code == 200
    open_body = open_response.json()
    assert open_body["count"] == 1
    assert open_body["data"][0]["id"] == second_id
    assert open_body["data"][0]["mobile"] == "07000000000"


def test_contractor_check_out_requires_open_visit(
    client: TestClient,
    db: Session,
) -> None:
    condominio = _create_test_condominio(db)
    building = _create_test_building(db, condominio.id, name="Northwood")

    check_in = client.post(
        f"{settings.API_V1_STR}/contractor-access/check-in",
        json={
            "condominio_id": str(condominio.id),
            "name": "Taylor Stone",
            "company": "Builders Inc",
            "building_id": str(building.id),
            "job_description": "Window repair",
            "mobile": "07999999999",
        },
    )
    assert check_in.status_code == 201

    first_checkout = client.post(
        f"{settings.API_V1_STR}/contractor-access/check-out",
        json={
            "condominio_id": str(condominio.id),
            "visit_id": check_in.json()["id"],
        },
    )
    assert first_checkout.status_code == 201

    second_checkout = client.post(
        f"{settings.API_V1_STR}/contractor-access/check-out",
        json={
            "condominio_id": str(condominio.id),
            "visit_id": check_in.json()["id"],
        },
    )
    assert second_checkout.status_code == 400
    assert second_checkout.json()["detail"] == "Contractor already checked out"


def test_contractor_history_category_create_and_list(
    client: TestClient,
    db: Session,
) -> None:
    condominio = _create_test_condominio(db)
    manager_headers = _create_manager_headers(client, db, condominio.id)

    create_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/history/categories",
        headers=manager_headers,
        json={"name": "Maintenance"},
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["name"] == "Maintenance"

    list_response = client.get(
        f"{settings.API_V1_STR}/contractor-access/history/categories",
        headers=manager_headers,
    )

    assert list_response.status_code == 200
    payload = list_response.json()
    assert payload["count"] == 1
    assert payload["data"][0]["id"] == created["id"]


def test_contractor_history_create_update_filter_and_delete(
    client: TestClient,
    db: Session,
) -> None:
    condominio = _create_test_condominio(db)
    building = _create_test_building(db, condominio.id, name="Merlin")
    _create_martlett_owner_flat_6(db, condominio.id)
    manager_headers = _create_manager_headers(client, db, condominio.id)

    visit_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/check-in",
        json={
            "condominio_id": str(condominio.id),
            "name": "Ava Turner",
            "company": "Alpha Works",
            "building_id": str(building.id),
            "job_description": "Electrical repair",
            "mobile": "07111111111",
        },
    )
    assert visit_response.status_code == 201
    visit_id = visit_response.json()["id"]

    category_one = client.post(
        f"{settings.API_V1_STR}/contractor-access/history/categories",
        headers=manager_headers,
        json={"name": "Inspection"},
    )
    category_two = client.post(
        f"{settings.API_V1_STR}/contractor-access/history/categories",
        headers=manager_headers,
        json={"name": "Follow up"},
    )

    assert category_one.status_code == 201
    assert category_two.status_code == 201

    history_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/history",
        headers=manager_headers,
        json={
            "category_id": category_one.json()["id"],
            "created_new_visit": False,
            "next_enabled": True,
            "next_interval_unit": "week",
            "next_interval_value": 2,
            "contractor_visit_id": visit_id,
        },
    )

    assert history_response.status_code == 201
    history_payload = history_response.json()
    assert history_payload["contractor_visit_id"] == visit_id
    assert history_payload["category_name"] == "Inspection"
    assert history_payload["created_new_visit"] is False
    assert history_payload["next_enabled"] is True
    assert history_payload["next_interval_unit"] == "week"
    assert history_payload["next_interval_value"] == 2
    assert history_payload["next_job_at"] is not None
    assert history_payload["next_notify_at"] is not None

    list_response = client.get(
        f"{settings.API_V1_STR}/contractor-access/history",
        headers=manager_headers,
        params={
            "search": "Alpha",
            "building_name": "Merlin",
            "category_id": category_one.json()["id"],
        },
    )
    assert list_response.status_code == 200
    listed = list_response.json()
    assert listed["count"] == 1
    assert listed["data"][0]["id"] == history_payload["id"]

    updated_in_at = datetime(2026, 3, 1, 9, 15, tzinfo=timezone.utc)
    updated_out_at = datetime(2026, 3, 1, 13, 45, tzinfo=timezone.utc)
    update_response = client.patch(
        f"{settings.API_V1_STR}/contractor-access/history/{history_payload['id']}",
        headers=manager_headers,
        json={
            "category_id": category_two.json()["id"],
            "created_new_visit": True,
            "next_enabled": True,
            "next_interval_unit": "month",
            "next_interval_value": 1,
            "name": "Ava Turner",
            "company": "Beta Services",
            "building_id": str(building.id),
            "job_description": "Boiler follow-up",
            "mobile": "07222222222",
            "in_at": updated_in_at.isoformat(),
            "out_at": updated_out_at.isoformat(),
        },
    )

    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["created_new_visit"] is True
    assert updated["category_name"] == "Follow up"
    assert updated["company"] == "Beta Services"
    assert updated["job_description"] == "Boiler follow-up"
    assert updated["next_enabled"] is True
    assert updated["next_interval_unit"] == "month"
    assert updated["next_interval_value"] == 1
    assert (
        datetime.fromisoformat(updated["visit_in_at"]).astimezone(timezone.utc)
        == updated_in_at
    )
    assert (
        datetime.fromisoformat(updated["visit_out_at"]).astimezone(timezone.utc)
        == updated_out_at
    )
    assert (
        datetime.fromisoformat(updated["next_job_at"]).astimezone(timezone.utc)
        == datetime(2026, 4, 1, 13, 45, tzinfo=timezone.utc)
    )
    assert (
        datetime.fromisoformat(updated["next_notify_at"]).astimezone(timezone.utc)
        == datetime(2026, 3, 25, 13, 45, tzinfo=timezone.utc)
    )

    filtered_response = client.get(
        f"{settings.API_V1_STR}/contractor-access/history",
        headers=manager_headers,
        params={
            "search": "Boiler",
            "date_from": "2026-03-01",
            "date_to": "2026-03-01",
            "building_name": "Merlin",
            "category_id": category_two.json()["id"],
        },
    )
    assert filtered_response.status_code == 200
    filtered = filtered_response.json()
    assert filtered["count"] == 1
    assert filtered["data"][0]["id"] == history_payload["id"]

    delete_response = client.delete(
        f"{settings.API_V1_STR}/contractor-access/history/{history_payload['id']}",
        headers=manager_headers,
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["message"] == "Contractor history deleted successfully"

    final_response = client.get(
        f"{settings.API_V1_STR}/contractor-access/history",
        headers=manager_headers,
    )
    assert final_response.status_code == 200
    assert final_response.json()["count"] == 0


def test_contractor_history_execute_due_sends_sms_to_martlett_owner_1_flat_6(
    client: TestClient,
    db: Session,
) -> None:
    condominio = _create_test_condominio(db)
    building = _create_test_building(db, condominio.id, name="Merlin")
    _create_martlett_owner_flat_6(db, condominio.id)
    manager_headers = _create_manager_headers(client, db, condominio.id)

    category = client.post(
        f"{settings.API_V1_STR}/contractor-access/history/categories",
        headers=manager_headers,
        json={"name": "Maintenance"},
    )
    assert category.status_code == 201

    old_in_at = datetime(2025, 1, 1, 9, 0, tzinfo=timezone.utc)
    old_out_at = datetime(2025, 1, 1, 11, 0, tzinfo=timezone.utc)
    history_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/history",
        headers=manager_headers,
        json={
            "category_id": category.json()["id"],
            "created_new_visit": True,
            "next_enabled": True,
            "next_interval_unit": "week",
            "next_interval_value": 1,
            "name": "Jamie Cole",
            "company": "Boiler Team",
            "building_id": str(building.id),
            "job_description": "Boiler service",
            "mobile": "07123456789",
            "in_at": old_in_at.isoformat(),
            "out_at": old_out_at.isoformat(),
        },
    )
    assert history_response.status_code == 201
    history_id = history_response.json()["id"]

    with patch(
        "app.api.routes.contractor_access.send_sms_notification",
        return_value="SM999",
    ) as sms_mock:
        execute_response = client.post(
            f"{settings.API_V1_STR}/contractor-access/history/execute-due",
            headers=manager_headers,
        )

    assert execute_response.status_code == 200
    assert execute_response.json()["checked"] == 1
    assert execute_response.json()["triggered"] == 1
    assert execute_response.json()["sms_sent"] == 1
    sms_mock.assert_called_once()
    sms_kwargs = sms_mock.call_args.kwargs
    assert sms_kwargs["phone_to"] == "+447700990000"
    assert "Jamie Cole" in sms_kwargs["body"]
    assert "Boiler Team" in sms_kwargs["body"]
    assert "Boiler service" in sms_kwargs["body"]
    assert "Maintenance" in sms_kwargs["body"]

    stored_response = client.get(
        f"{settings.API_V1_STR}/contractor-access/history",
        headers=manager_headers,
    )
    assert stored_response.status_code == 200
    matching = [
        item
        for item in stored_response.json()["data"]
        if item["id"] == history_id
    ]
    assert len(matching) == 1
    assert matching[0]["next_notification_sent_at"] is not None
