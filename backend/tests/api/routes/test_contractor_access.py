from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models import Condominio, CondominioCreate


def _create_test_condominio(db: Session) -> Condominio:
    condominio = Condominio.model_validate(
        CondominioCreate(nome="Test Contractor Condominio")
    )
    db.add(condominio)
    db.commit()
    db.refresh(condominio)
    return condominio


def test_contractor_check_in_and_read_open_visits(
    client: TestClient,
    db: Session,
) -> None:
    condominio = _create_test_condominio(db)

    response = client.post(
        f"{settings.API_V1_STR}/contractor-access/check-in",
        json={
            "condominio_id": str(condominio.id),
            "name": "John Smith",
            "company": "ABC Contractors",
            "car_reg": "AB12 CDE",
            "block": "Merlin",
            "mobile": "07123456789",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "John Smith"
    assert body["company"] == "ABC Contractors"
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


def test_contractor_check_out_uses_visit_id_with_repeated_phone(
    client: TestClient,
    db: Session,
) -> None:
    condominio = _create_test_condominio(db)

    first = client.post(
        f"{settings.API_V1_STR}/contractor-access/check-in",
        json={
            "condominio_id": str(condominio.id),
            "name": "Alex Brown",
            "company": "Same Phone Ltd",
            "car_reg": "CAR-001",
            "block": "Oak Lodge",
            "mobile": "07000000000",
        },
    )
    second = client.post(
        f"{settings.API_V1_STR}/contractor-access/check-in",
        json={
            "condominio_id": str(condominio.id),
            "name": "Alex Brown",
            "company": "Same Phone Ltd",
            "car_reg": "CAR-002",
            "block": "Merlin",
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

    check_in = client.post(
        f"{settings.API_V1_STR}/contractor-access/check-in",
        json={
            "condominio_id": str(condominio.id),
            "name": "Taylor Stone",
            "company": "Builders Inc",
            "car_reg": "ZX90 YTR",
            "block": "Northwood",
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
