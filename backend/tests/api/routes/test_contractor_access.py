import uuid
from datetime import datetime, timedelta, timezone
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


def test_contractor_access_buildings_returns_the_contractors_location_list_in_order(
    client: TestClient,
    db: Session,
) -> None:
    condominio = _create_test_condominio(db)
    buildings = {
        name: _create_test_building(db, condominio.id, name=name)
        for name in (
            "Northwood",
            "Estate OHP",
            "Oak Lodge",
            "Falcon",
            "Merlin",
            "Martlett",
        )
    }
    _create_test_building(db, condominio.id, name="Office")

    response = client.get(
        f"{settings.API_V1_STR}/contractor-access/buildings",
        params={"condominio_id": str(condominio.id)},
    )

    assert response.status_code == 200
    body = response.json()
    expected_names = [
        "Falcon",
        "Martlett",
        "Merlin",
        "Oak Lodge",
        "Northwood",
        "Estate OHP",
    ]
    assert [item["name"] for item in body["data"]] == expected_names
    assert [item["id"] for item in body["data"]] == [
        str(buildings[name].id) for name in expected_names
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


def test_contractor_maintenance_links_future_matching_contractor_records(
    client: TestClient,
    db: Session,
) -> None:
    condominio = _create_test_condominio(db)
    building = _create_test_building(db, condominio.id, name="Merlin")
    manager_headers = _create_manager_headers(client, db, condominio.id)

    category_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/maintenance/categories",
        headers=manager_headers,
        json={"name": "Safety"},
    )
    assert category_response.status_code == 201

    maintenance_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/maintenance",
        headers=manager_headers,
        json={
            "category_id": category_response.json()["id"],
            "tag": "Annual gas",
            "report": "Gas safety inspection",
            "frequency_value": 365,
            "frequency_unit": "days",
            "notes": "Bring the current certificate",
            "filters": [
                {"field": "company", "value": "Boiler Team"},
                {"field": "job_description", "value": "Gas safety inspection"},
                {"field": "mobile", "value": "07123456789"},
                {"field": "name", "value": "Jamie Cole"},
            ],
            "last_completed_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    assert maintenance_response.status_code == 201
    maintenance = maintenance_response.json()
    assert maintenance["is_overdue"] is False
    assert maintenance["last_completed_at"] is not None
    assert maintenance["status"] == "ok"
    assert {item["field"] for item in maintenance["filters"]} == {
        "company",
        "job_description",
        "mobile",
        "name",
    }

    unmatched_check_in_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/check-in",
        json={
            "condominio_id": str(condominio.id),
            "name": "Jamie Cole",
            "company": "Different Contractor",
            "building_id": str(building.id),
            "job_description": "Gas safety inspection",
            "mobile": "07123456789",
        },
    )
    assert unmatched_check_in_response.status_code == 201

    check_in_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/check-in",
        json={
            "condominio_id": str(condominio.id),
            "name": "Jamie Cole",
            "company": "Boiler Team",
            "building_id": str(building.id),
            "job_description": "Gas safety inspection",
            "mobile": "07123456789",
        },
    )
    assert check_in_response.status_code == 201

    history_response = client.get(
        f"{settings.API_V1_STR}/contractor-access/maintenance/history",
        headers=manager_headers,
    )
    assert history_response.status_code == 200
    assert history_response.json()["count"] == 1
    record = history_response.json()["data"][0]
    assert record["maintenance_id"] == maintenance["id"]
    assert record["contractor_visit_id"] == check_in_response.json()["id"]
    assert record["in_at"] is not None
    assert record["out_at"] is None

    check_out_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/check-out",
        json={
            "condominio_id": str(condominio.id),
            "visit_id": check_in_response.json()["id"],
        },
    )
    assert check_out_response.status_code == 201

    completed_history_response = client.get(
        f"{settings.API_V1_STR}/contractor-access/maintenance/history",
        headers=manager_headers,
    )
    completed_record = completed_history_response.json()["data"][0]
    assert completed_record["out_at"] is not None


def test_contractor_maintenance_accepts_monthly_interval_and_optional_tag(
    client: TestClient,
    db: Session,
) -> None:
    condominio = _create_test_condominio(db)
    manager_headers = _create_manager_headers(client, db, condominio.id)

    category_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/maintenance/categories",
        headers=manager_headers,
        json={"name": "Compliance"},
    )
    assert category_response.status_code == 201

    last_completed_at = datetime(2025, 1, 31, 9, 0, tzinfo=timezone.utc)
    maintenance_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/maintenance",
        headers=manager_headers,
        json={
            "category_id": category_response.json()["id"],
            "report": "Quarterly inspection",
            "frequency_value": 3,
            "frequency_unit": "months",
            "filters": [{"field": "company", "value": "Compliance Ltd"}],
            "last_completed_at": last_completed_at.isoformat(),
        },
    )
    assert maintenance_response.status_code == 201

    maintenance = maintenance_response.json()
    assert maintenance["tag"] == ""
    assert maintenance["frequency_value"] == 3
    assert maintenance["frequency_unit"] == "months"
    assert maintenance["frequency_days"] is None
    assert maintenance["last_completed_at"] is not None
    assert datetime.fromisoformat(maintenance["next_due_at"]).astimezone(
        timezone.utc
    ) == datetime(2025, 4, 30, 9, 0, tzinfo=timezone.utc)
    assert maintenance["is_overdue"] is True


def test_contractor_maintenance_allows_optional_hooks_and_completion_dates(
    client: TestClient,
    db: Session,
) -> None:
    condominio = _create_test_condominio(db)
    manager_headers = _create_manager_headers(client, db, condominio.id)

    category_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/maintenance/categories",
        headers=manager_headers,
        json={"name": "Routine"},
    )
    assert category_response.status_code == 201

    maintenance_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/maintenance",
        headers=manager_headers,
        json={
            "category_id": category_response.json()["id"],
            "report": "Description without a hook or completion date",
            "frequency_value": 30,
            "frequency_unit": "days",
        },
    )
    assert maintenance_response.status_code == 201

    maintenance = maintenance_response.json()
    assert maintenance["filters"] == []
    assert maintenance["last_completed_at"] is None
    assert maintenance["next_due_at"] is None
    assert maintenance["is_overdue"] is False
    assert maintenance["status"] == "pending"


def test_manager_can_update_contractor_maintenance(
    client: TestClient,
    db: Session,
) -> None:
    condominio = _create_test_condominio(db)
    manager_headers = _create_manager_headers(client, db, condominio.id)

    initial_category_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/maintenance/categories",
        headers=manager_headers,
        json={"name": "Initial"},
    )
    updated_category_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/maintenance/categories",
        headers=manager_headers,
        json={"name": "Updated"},
    )
    assert initial_category_response.status_code == 201
    assert updated_category_response.status_code == 201

    maintenance_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/maintenance",
        headers=manager_headers,
        json={
            "category_id": initial_category_response.json()["id"],
            "report": "Initial inspection",
            "frequency_value": 30,
            "frequency_unit": "days",
            "filters": [{"field": "company", "value": "Old contractor"}],
        },
    )
    assert maintenance_response.status_code == 201

    updated_response = client.put(
        f"{settings.API_V1_STR}/contractor-access/maintenance/"
        f"{maintenance_response.json()['id']}",
        headers=manager_headers,
        json={
            "category_id": updated_category_response.json()["id"],
            "tag": "Boiler",
            "report": "Boiler inspection",
            "frequency_value": 6,
            "frequency_unit": "months",
            "notes": "Certificate required",
            "filters": [{"field": "name", "value": "Sam Contractor"}],
            "last_completed_at": "2025-01-31T00:00:00Z",
        },
    )
    assert updated_response.status_code == 200

    updated = updated_response.json()
    assert updated["category_name"] == "Updated"
    assert updated["tag"] == "Boiler"
    assert updated["report"] == "Boiler inspection"
    assert updated["frequency_value"] == 6
    assert updated["frequency_unit"] == "months"
    assert updated["notes"] == "Certificate required"
    assert updated["filters"] == [{"field": "name", "value": "Sam Contractor"}]
    assert datetime.fromisoformat(updated["next_due_at"]).astimezone(
        timezone.utc
    ) == datetime(2025, 7, 31, tzinfo=timezone.utc)


def test_contractor_maintenance_schedule_marks_overdue_after_frequency_days(
    client: TestClient,
    db: Session,
) -> None:
    condominio = _create_test_condominio(db)
    building = _create_test_building(db, condominio.id, name="Merlin")
    manager_headers = _create_manager_headers(client, db, condominio.id)

    category_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/maintenance/categories",
        headers=manager_headers,
        json={"name": "Heating"},
    )
    maintenance_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/maintenance",
        headers=manager_headers,
        json={
            "category_id": category_response.json()["id"],
            "tag": "Boiler",
            "report": "Annual service",
            "frequency_value": 30,
            "frequency_unit": "days",
            "notes": "",
            "filters": [{"field": "company", "value": "Other Company"}],
            "last_completed_at": datetime(2020, 1, 1, tzinfo=timezone.utc).isoformat(),
        },
    )
    assert maintenance_response.status_code == 201

    old_in_at = datetime(2025, 1, 1, 9, 0, tzinfo=timezone.utc)
    old_out_at = datetime(2025, 1, 1, 11, 0, tzinfo=timezone.utc)
    visit_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/check-in",
        json={
            "condominio_id": str(condominio.id),
            "name": "Morgan Hill",
            "company": "Heating Ltd",
            "building_id": str(building.id),
            "job_description": "Annual service",
            "mobile": "07000000000",
            "in_at": old_in_at.isoformat(),
        },
    )
    assert visit_response.status_code == 201

    check_out_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/check-out",
        json={
            "condominio_id": str(condominio.id),
            "visit_id": visit_response.json()["id"],
            "out_at": old_out_at.isoformat(),
        },
    )
    assert check_out_response.status_code == 201

    # Link the first historic maintenance execution manually, then verify that
    # the schedule reports it as overdue after its 30-day frequency.
    record_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/maintenance/records",
        headers=manager_headers,
        json={
            "maintenance_id": maintenance_response.json()["id"],
            "contractor_visit_id": visit_response.json()["id"],
        },
    )
    assert record_response.status_code == 201

    schedule_response = client.get(
        f"{settings.API_V1_STR}/contractor-access/maintenance/schedule",
        headers=manager_headers,
    )
    assert schedule_response.status_code == 200
    assert schedule_response.json()["data"][0]["is_overdue"] is True
    assert schedule_response.json()["data"][0]["status"] == "pending"


def test_contractor_maintenance_schedule_marks_soon_within_seven_days(
    client: TestClient,
    db: Session,
) -> None:
    condominio = _create_test_condominio(db)
    building = _create_test_building(db, condominio.id, name="Merlin")
    manager_headers = _create_manager_headers(client, db, condominio.id)

    category_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/maintenance/categories",
        headers=manager_headers,
        json={"name": "Electrical"},
    )
    maintenance_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/maintenance",
        headers=manager_headers,
        json={
            "category_id": category_response.json()["id"],
            "tag": "Generator",
            "report": "Generator service",
            "frequency_value": 30,
            "frequency_unit": "days",
            "notes": "",
            "filters": [{"field": "company", "value": "Other Company"}],
            "last_completed_at": datetime(2020, 1, 1, tzinfo=timezone.utc).isoformat(),
        },
    )
    assert maintenance_response.status_code == 201

    completed_at = datetime.now(timezone.utc) - timedelta(days=24)
    visit_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/check-in",
        json={
            "condominio_id": str(condominio.id),
            "name": "Morgan Hill",
            "company": "Electrical Ltd",
            "building_id": str(building.id),
            "job_description": "Generator service",
            "mobile": "07000000000",
            "in_at": completed_at.isoformat(),
        },
    )
    assert visit_response.status_code == 201

    check_out_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/check-out",
        json={
            "condominio_id": str(condominio.id),
            "visit_id": visit_response.json()["id"],
            "out_at": (completed_at + timedelta(hours=2)).isoformat(),
        },
    )
    assert check_out_response.status_code == 201

    record_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/maintenance/records",
        headers=manager_headers,
        json={
            "maintenance_id": maintenance_response.json()["id"],
            "contractor_visit_id": visit_response.json()["id"],
        },
    )
    assert record_response.status_code == 201

    schedule_response = client.get(
        f"{settings.API_V1_STR}/contractor-access/maintenance/schedule",
        headers=manager_headers,
    )
    assert schedule_response.status_code == 200
    schedule = schedule_response.json()["data"]
    assert schedule[0]["is_overdue"] is False
    assert schedule[0]["status"] == "soon"


def test_manager_can_edit_a_contractor_record(
    client: TestClient,
    db: Session,
) -> None:
    condominio = _create_test_condominio(db)
    initial_building = _create_test_building(db, condominio.id, name="Merlin")
    updated_building = _create_test_building(db, condominio.id, name="Northwood")
    manager_headers = _create_manager_headers(client, db, condominio.id)

    create_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/check-in",
        json={
            "condominio_id": str(condominio.id),
            "name": "Taylor Stone",
            "company": "Initial Services",
            "building_id": str(initial_building.id),
            "job_description": "Initial inspection",
            "mobile": "07123456789",
        },
    )
    assert create_response.status_code == 201

    updated_in_at = datetime(2026, 7, 20, 9, 0, tzinfo=timezone.utc)
    updated_out_at = datetime(2026, 7, 20, 11, 0, tzinfo=timezone.utc)
    update_response = client.patch(
        f"{settings.API_V1_STR}/contractor-access/{create_response.json()['id']}",
        headers=manager_headers,
        json={
            "name": "Taylor Stone Updated",
            "company": "Updated Services",
            "building_id": str(updated_building.id),
            "job_description": "Updated inspection",
            "mobile": "07999999999",
            "in_at": updated_in_at.isoformat(),
            "out_at": updated_out_at.isoformat(),
        },
    )

    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["name"] == "Taylor Stone Updated"
    assert updated["company"] == "Updated Services"
    assert updated["building_name"] == "Northwood"
    assert updated["job_description"] == "Updated inspection"
    assert updated["mobile"] == "07999999999"
    assert datetime.fromisoformat(updated["in_at"]).astimezone(timezone.utc) == updated_in_at
    assert datetime.fromisoformat(updated["out_at"]).astimezone(timezone.utc) == updated_out_at


def test_manager_can_delete_a_contractor_record(
    client: TestClient,
    db: Session,
) -> None:
    condominio = _create_test_condominio(db)
    building = _create_test_building(db, condominio.id, name="Merlin")
    manager_headers = _create_manager_headers(client, db, condominio.id)
    create_response = client.post(
        f"{settings.API_V1_STR}/contractor-access/check-in",
        json={
            "condominio_id": str(condominio.id),
            "name": "Delete Me",
            "company": "Delete Services",
            "building_id": str(building.id),
            "job_description": "Removal",
            "mobile": "07123456789",
        },
    )
    assert create_response.status_code == 201

    delete_response = client.delete(
        f"{settings.API_V1_STR}/contractor-access/{create_response.json()['id']}",
        headers=manager_headers,
    )

    assert delete_response.status_code == 200
    assert delete_response.json()["message"] == "Contractor record deleted successfully"
