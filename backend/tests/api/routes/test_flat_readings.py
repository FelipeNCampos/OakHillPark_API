from datetime import datetime, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlmodel import Session

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
)


def _create_flat_reading_sms_scenario(
    db: Session,
) -> tuple[Condominio, Building, Flat, Morador, Morador]:
    condominio = Condominio.model_validate(CondominioCreate(nome="Test Flat SMS"))
    db.add(condominio)
    db.flush()

    building = Building.model_validate(
        BuildingCreate(
            nome="Test Flat SMS Building",
            condominio_id=condominio.id,
            reading_types=0,
        )
    )
    db.add(building)
    db.flush()

    flat = Flat.model_validate(
        FlatCreate(
            numero=101,
            status=True,
            building_id=building.id,
            reading_types=2,
        )
    )
    db.add(flat)
    db.flush()

    owner_1 = Morador.model_validate(
        MoradorCreate(
            cargo=0,
            nome="Owner 1",
            email=None,
            mobile="07700990000",
            receives_flat_reading_sms=False,
            flat_id=flat.id,
        )
    )
    tenant = Morador.model_validate(
        MoradorCreate(
            cargo=2,
            nome="Tenant",
            email=None,
            mobile="07700991111",
            receives_flat_reading_sms=True,
            flat_id=flat.id,
        )
    )
    db.add(owner_1)
    db.add(tenant)
    db.commit()
    db.refresh(flat)
    db.refresh(owner_1)
    db.refresh(tenant)
    return condominio, building, flat, owner_1, tenant


def test_create_flat_reading_sends_sms_to_opted_contacts_only(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    _, _, flat, _, tenant = _create_flat_reading_sms_scenario(db)

    with patch(
        "app.api.routes.flat_readings.send_sms_notification",
        return_value="SM123",
    ) as sms_mock:
        response = client.post(
            f"{settings.API_V1_STR}/flat_readings/",
            headers=superuser_token_headers,
            json={
                "flat_id": str(flat.id),
                "tipo": 2,
                "valor": 345,
                "data": datetime(2026, 3, 15, 8, 0, tzinfo=timezone.utc).isoformat(),
            },
        )

    assert response.status_code == 200
    sms_mock.assert_called_once()
    kwargs = sms_mock.call_args.kwargs
    assert kwargs["phone_to"] == "+447700991111"
    assert "Normal: 345" in kwargs["body"]
    assert "flat 101" in kwargs["body"]


def test_create_flat_reading_skips_sms_when_no_contact_opted_in(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    _, _, flat, owner_1, tenant = _create_flat_reading_sms_scenario(db)
    owner_1.receives_flat_reading_sms = False
    tenant.receives_flat_reading_sms = False
    db.add(owner_1)
    db.add(tenant)
    db.commit()

    with patch(
        "app.api.routes.flat_readings.send_sms_notification",
        return_value="SM123",
    ) as sms_mock:
        response = client.post(
            f"{settings.API_V1_STR}/flat_readings/",
            headers=superuser_token_headers,
            json={
                "flat_id": str(flat.id),
                "tipo": 2,
                "valor": 345,
                "data": datetime(2026, 3, 15, 8, 0, tzinfo=timezone.utc).isoformat(),
            },
        )

    assert response.status_code == 200
    sms_mock.assert_not_called()


def test_create_garage_flat_reading_sends_sms_for_northwood_flat_1(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    condominio = Condominio.model_validate(CondominioCreate(nome="Northwood SMS"))
    db.add(condominio)
    db.flush()

    building = Building.model_validate(
        BuildingCreate(
            nome="Northwood",
            condominio_id=condominio.id,
            reading_types=0,
        )
    )
    db.add(building)
    db.flush()

    flat = Flat.model_validate(
        FlatCreate(
            numero=1,
            status=True,
            building_id=building.id,
            reading_types=8,
        )
    )
    db.add(flat)
    db.flush()

    tenant = Morador.model_validate(
        MoradorCreate(
            cargo=2,
            nome="Northwood Tenant",
            email=None,
            mobile="07700992222",
            receives_flat_reading_sms=True,
            flat_id=flat.id,
        )
    )
    db.add(tenant)
    db.commit()
    db.refresh(flat)

    with patch(
        "app.api.routes.flat_readings.send_sms_notification",
        return_value="SM123",
    ) as sms_mock:
        response = client.post(
            f"{settings.API_V1_STR}/flat_readings/",
            headers=superuser_token_headers,
            json={
                "flat_id": str(flat.id),
                "tipo": 8,
                "valor": 55,
                "data": datetime(2026, 3, 15, 8, 0, tzinfo=timezone.utc).isoformat(),
            },
        )

    assert response.status_code == 200
    sms_mock.assert_called_once()
    kwargs = sms_mock.call_args.kwargs
    assert kwargs["phone_to"] == "+447700992222"
    assert "Garage: 55" in kwargs["body"]
    assert "flat 1" in kwargs["body"]


def test_create_garage_flat_reading_rejects_non_northwood_flat_1(
    client: TestClient,
    superuser_token_headers: dict[str, str],
    db: Session,
) -> None:
    _, _, flat, _, _ = _create_flat_reading_sms_scenario(db)

    response = client.post(
        f"{settings.API_V1_STR}/flat_readings/",
        headers=superuser_token_headers,
        json={
            "flat_id": str(flat.id),
            "tipo": 8,
            "valor": 55,
            "data": datetime(2026, 3, 15, 8, 0, tzinfo=timezone.utc).isoformat(),
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Garage readings are only available for Northwood flat 1"
    )
