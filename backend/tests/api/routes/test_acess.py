from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import delete
from sqlmodel import Session

from app import crud
from app.core.config import settings
from app.models import (
    Acess,
    Building,
    BuildingCreate,
    Condominio,
    CondominioCreate,
    Funcionario,
    User,
    UserCreate,
)
from app.api.routes.acess import get_last_acess
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string


def _create_cleaner_sms_scenario(db: Session) -> tuple[Funcionario, Building, Building]:
    condominio = Condominio.model_validate(
        CondominioCreate(nome="Test Cleaner SMS Condominio")
    )
    db.add(condominio)
    db.flush()

    building_a = Building.model_validate(
        BuildingCreate(
            nome="Test Cleaner SMS Building A",
            condominio_id=condominio.id,
            reading_types=3,
        )
    )
    building_b = Building.model_validate(
        BuildingCreate(
            nome="Test Cleaner SMS Building B",
            condominio_id=condominio.id,
            reading_types=3,
        )
    )
    cleaner = Funcionario(
        nome="Test Cleaner SMS",
        cargo=0,
        status=True,
        is_default=True,
        mobile=0,
        email=None,
        condominio_id=condominio.id,
    )

    db.add(building_a)
    db.add(building_b)
    db.add(cleaner)
    db.commit()
    db.refresh(building_a)
    db.refresh(building_b)
    db.refresh(cleaner)
    return cleaner, building_a, building_b


def _create_cleaner_sms_scenario_with_office(
    db: Session,
) -> tuple[Funcionario, Building, Building, Building]:
    cleaner, building_a, building_b = _create_cleaner_sms_scenario(db)
    office = Building.model_validate(
        BuildingCreate(
            nome="Office",
            condominio_id=cleaner.condominio_id,
            reading_types=2,
        )
    )
    db.add(office)
    db.commit()
    db.refresh(office)
    return cleaner, building_a, building_b, office


@pytest.fixture
def cleaner_sms_setup(db: Session) -> tuple[Funcionario, Building, Building]:
    cleaner, building_a, building_b = _create_cleaner_sms_scenario(db)
    yield cleaner, building_a, building_b

    db.exec(delete(Acess).where(Acess.funcionario_id == cleaner.id))
    db.exec(delete(Building).where(Building.id.in_([building_a.id, building_b.id])))
    db.exec(delete(Funcionario).where(Funcionario.id == cleaner.id))
    db.exec(delete(User).where(User.condominio_id == cleaner.condominio_id))
    db.exec(delete(Condominio).where(Condominio.id == cleaner.condominio_id))
    db.commit()


def test_create_acess_sends_sms_on_first_cleaner_in(
    client: TestClient,
    cleaner_sms_setup: tuple[Funcionario, Building, Building],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cleaner, building_a, _ = cleaner_sms_setup
    monkeypatch.setattr(settings, "CLEANER_STATUS_SMS_TO", "7952474965")

    with patch("app.api.routes.acess.get_default_funcionario", return_value=cleaner):
        with patch("app.api.routes.acess.send_sms_notification", return_value="SM123") as sms_mock:
            response = client.post(
                f"{settings.API_V1_STR}/acess/",
                json={"building_id": str(building_a.id), "operacao": 0},
            )

    assert response.status_code == 200
    sms_mock.assert_called_once_with(
        phone_to="+447952474965",
        body="Cleaner IN",
    )


def test_create_acess_does_not_resend_sms_on_second_cleaner_in_same_day(
    client: TestClient,
    cleaner_sms_setup: tuple[Funcionario, Building, Building],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cleaner, building_a, building_b = cleaner_sms_setup
    monkeypatch.setattr(settings, "CLEANER_STATUS_SMS_TO", "7952474965")

    with patch("app.api.routes.acess.get_default_funcionario", return_value=cleaner):
        with patch("app.api.routes.acess.send_sms_notification", return_value="SM123") as sms_mock:
            first_response = client.post(
                f"{settings.API_V1_STR}/acess/",
                json={"building_id": str(building_a.id), "operacao": 0},
            )
            assert first_response.status_code == 200

            sms_mock.reset_mock()

            second_response = client.post(
                f"{settings.API_V1_STR}/acess/",
                json={"building_id": str(building_b.id), "operacao": 0},
            )

    assert second_response.status_code == 200
    sms_mock.assert_not_called()


def test_create_acess_sends_sms_on_last_cleaner_out(
    client: TestClient,
    cleaner_sms_setup: tuple[Funcionario, Building, Building],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cleaner, building_a, building_b = cleaner_sms_setup
    monkeypatch.setattr(settings, "CLEANER_STATUS_SMS_TO", "7952474965")

    with patch("app.api.routes.acess.get_default_funcionario", return_value=cleaner):
        with patch("app.api.routes.acess.send_sms_notification", return_value="SM123") as sms_mock:
            client.post(
                f"{settings.API_V1_STR}/acess/",
                json={"building_id": str(building_a.id), "operacao": 0},
            )
            client.post(
                f"{settings.API_V1_STR}/acess/",
                json={"building_id": str(building_a.id), "operacao": 1},
            )
            client.post(
                f"{settings.API_V1_STR}/acess/",
                json={"building_id": str(building_b.id), "operacao": 0},
            )

            sms_mock.reset_mock()

            response = client.post(
                f"{settings.API_V1_STR}/acess/",
                json={"building_id": str(building_b.id), "operacao": 1},
            )

    assert response.status_code == 200
    sms_mock.assert_called_once_with(
        phone_to="+447952474965",
        body="Cleaner OUT",
    )


def test_create_acess_does_not_resend_cleaner_out_after_completion(
    client: TestClient,
    cleaner_sms_setup: tuple[Funcionario, Building, Building],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cleaner, building_a, building_b = cleaner_sms_setup
    monkeypatch.setattr(settings, "CLEANER_STATUS_SMS_TO", "7952474965")

    with patch("app.api.routes.acess.get_default_funcionario", return_value=cleaner):
        with patch("app.api.routes.acess.send_sms_notification", return_value="SM123") as sms_mock:
            client.post(
                f"{settings.API_V1_STR}/acess/",
                json={"building_id": str(building_a.id), "operacao": 0},
            )
            client.post(
                f"{settings.API_V1_STR}/acess/",
                json={"building_id": str(building_a.id), "operacao": 1},
            )
            client.post(
                f"{settings.API_V1_STR}/acess/",
                json={"building_id": str(building_b.id), "operacao": 0},
            )
            client.post(
                f"{settings.API_V1_STR}/acess/",
                json={"building_id": str(building_b.id), "operacao": 1},
            )

            sms_mock.reset_mock()

            follow_up_in = client.post(
                f"{settings.API_V1_STR}/acess/",
                json={"building_id": str(building_a.id), "operacao": 0},
            )
            assert follow_up_in.status_code == 200

            follow_up_out = client.post(
                f"{settings.API_V1_STR}/acess/",
                json={"building_id": str(building_a.id), "operacao": 1},
            )

    assert follow_up_out.status_code == 200
    sms_mock.assert_not_called()


def test_create_acess_sends_cleaner_out_without_requiring_office(
    client: TestClient,
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cleaner, building_a, building_b, office = _create_cleaner_sms_scenario_with_office(db)
    monkeypatch.setattr(settings, "CLEANER_STATUS_SMS_TO", "7952474965")

    with patch("app.api.routes.acess.get_default_funcionario", return_value=cleaner):
        with patch("app.api.routes.acess.send_sms_notification", return_value="SM123") as sms_mock:
            client.post(
                f"{settings.API_V1_STR}/acess/",
                json={"building_id": str(building_a.id), "operacao": 0},
            )
            client.post(
                f"{settings.API_V1_STR}/acess/",
                json={"building_id": str(building_a.id), "operacao": 1},
            )
            client.post(
                f"{settings.API_V1_STR}/acess/",
                json={"building_id": str(building_b.id), "operacao": 0},
            )

            sms_mock.reset_mock()

            response = client.post(
                f"{settings.API_V1_STR}/acess/",
                json={"building_id": str(building_b.id), "operacao": 1},
            )

    assert response.status_code == 200
    sms_mock.assert_called_once_with(
        phone_to="+447952474965",
        body="Cleaner OUT",
    )

    db.exec(delete(Acess).where(Acess.funcionario_id == cleaner.id))
    db.exec(
        delete(Building).where(
            Building.id.in_([building_a.id, building_b.id, office.id])
        )
    )
    db.exec(delete(Funcionario).where(Funcionario.id == cleaner.id))
    db.exec(delete(User).where(User.condominio_id == cleaner.condominio_id))
    db.exec(delete(Condominio).where(Condominio.id == cleaner.condominio_id))
    db.commit()


def test_create_acess_rejects_office_for_cleaner(
    client: TestClient,
    db: Session,
) -> None:
    cleaner, building_a, building_b, office = _create_cleaner_sms_scenario_with_office(db)

    with patch("app.api.routes.acess.get_default_funcionario", return_value=cleaner):
        response = client.post(
            f"{settings.API_V1_STR}/acess/",
            json={"building_id": str(office.id), "operacao": 0},
        )

    assert response.status_code == 400
    assert response.json()["detail"] == "Office is not valid for cleaner access"

    db.exec(delete(Acess).where(Acess.funcionario_id == cleaner.id))
    db.exec(
        delete(Building).where(
            Building.id.in_([building_a.id, building_b.id, office.id])
        )
    )
    db.exec(delete(Funcionario).where(Funcionario.id == cleaner.id))
    db.exec(delete(User).where(User.condominio_id == cleaner.condominio_id))
    db.exec(delete(Condominio).where(Condominio.id == cleaner.condominio_id))
    db.commit()


def test_create_acess_uses_manual_timestamp_without_sending_sms(
    client: TestClient,
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cleaner, building_a, building_b = _create_cleaner_sms_scenario(db)
    manual_time = datetime(2026, 4, 10, 9, 30, tzinfo=timezone.utc)
    monkeypatch.setattr(settings, "CLEANER_STATUS_SMS_TO", "7952474965")

    with patch("app.api.routes.acess.get_default_funcionario", return_value=cleaner):
        with patch("app.api.routes.acess.send_sms_notification", return_value="SM123") as sms_mock:
            response = client.post(
                f"{settings.API_V1_STR}/acess/",
                json={
                    "building_id": str(building_a.id),
                    "operacao": 0,
                    "data": manual_time.isoformat(),
                },
            )

    assert response.status_code == 200
    saved_acess = db.get(Acess, response.json()["id"])
    assert saved_acess is not None
    assert saved_acess.data.astimezone(timezone.utc) == manual_time
    sms_mock.assert_not_called()

    db.exec(delete(Acess).where(Acess.funcionario_id == cleaner.id))
    db.exec(delete(Building).where(Building.id.in_([building_a.id, building_b.id])))
    db.exec(delete(Funcionario).where(Funcionario.id == cleaner.id))
    db.exec(delete(User).where(User.condominio_id == cleaner.condominio_id))
    db.exec(delete(Condominio).where(Condominio.id == cleaner.condominio_id))
    db.commit()


def test_create_acess_allows_manual_cleaner_out_without_open_session(
    client: TestClient,
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cleaner, building_a, building_b = _create_cleaner_sms_scenario(db)
    manual_time = datetime(2026, 4, 10, 17, 45, tzinfo=timezone.utc)
    db.add(
        Acess(
            status=True,
            data=datetime(2026, 4, 10, 8, 0, tzinfo=timezone.utc),
            operacao=0,
            building_id=building_a.id,
            funcionario_id=cleaner.id,
        )
    )
    db.add(
        Acess(
            status=True,
            data=datetime(2026, 4, 10, 10, 0, tzinfo=timezone.utc),
            operacao=0,
            building_id=building_b.id,
            funcionario_id=cleaner.id,
        )
    )
    db.add(
        Acess(
            status=True,
            data=datetime(2026, 4, 10, 11, 0, tzinfo=timezone.utc),
            operacao=1,
            building_id=building_b.id,
            funcionario_id=cleaner.id,
        )
    )
    db.commit()
    monkeypatch.setattr(settings, "CLEANER_STATUS_SMS_TO", "7952474965")

    with patch("app.api.routes.acess.get_default_funcionario", return_value=cleaner):
        with patch("app.api.routes.acess.send_sms_notification", return_value="SM123") as sms_mock:
            response = client.post(
                f"{settings.API_V1_STR}/acess/",
                json={
                    "building_id": str(building_a.id),
                    "operacao": 1,
                    "data": manual_time.isoformat(),
                },
            )

    assert response.status_code == 200
    saved_acess = db.get(Acess, response.json()["id"])
    assert saved_acess is not None
    assert saved_acess.operacao == 1
    assert saved_acess.data.astimezone(timezone.utc) == manual_time
    sms_mock.assert_not_called()

    db.exec(delete(Acess).where(Acess.funcionario_id == cleaner.id))
    db.exec(delete(Building).where(Building.id.in_([building_a.id, building_b.id])))
    db.exec(delete(Funcionario).where(Funcionario.id == cleaner.id))
    db.exec(delete(User).where(User.condominio_id == cleaner.condominio_id))
    db.exec(delete(Condominio).where(Condominio.id == cleaner.condominio_id))
    db.commit()


def test_get_last_acess_prefers_open_session_when_switch_generates_same_timestamp_records(
    db: Session,
) -> None:
    cleaner, building_a, building_b = _create_cleaner_sms_scenario(db)

    shared_time = datetime(2026, 3, 15, 10, 0, tzinfo=timezone.utc)
    db.add(
        Acess(
            status=True,
            data=shared_time,
            operacao=1,
            building_id=building_a.id,
            funcionario_id=cleaner.id,
        )
    )
    expected_open_access = Acess(
        status=True,
        data=shared_time,
        operacao=0,
        building_id=building_b.id,
        funcionario_id=cleaner.id,
    )
    db.add(expected_open_access)
    db.commit()
    db.refresh(expected_open_access)

    last_acess = get_last_acess(db, cleaner.id)

    assert last_acess is not None
    assert last_acess.id == expected_open_access.id
    assert last_acess.operacao == 0

    db.exec(delete(Acess).where(Acess.funcionario_id == cleaner.id))
    db.exec(delete(Building).where(Building.id.in_([building_a.id, building_b.id])))
    db.exec(delete(Funcionario).where(Funcionario.id == cleaner.id))
    db.exec(delete(User).where(User.condominio_id == cleaner.condominio_id))
    db.exec(delete(Condominio).where(Condominio.id == cleaner.condominio_id))
    db.commit()


def _create_caretaker_sms_scenario(db: Session) -> Funcionario:
    condominio = Condominio.model_validate(
        CondominioCreate(nome="Test Caretaker Work Time SMS Condominio")
    )
    db.add(condominio)
    db.flush()

    caretaker = Funcionario(
        nome="Test Caretaker Work Time SMS",
        cargo=1,
        status=True,
        is_default=True,
        mobile=0,
        email=None,
        condominio_id=condominio.id,
    )
    db.add(caretaker)
    db.commit()
    db.refresh(caretaker)
    return caretaker


@pytest.fixture
def caretaker_sms_setup(db: Session) -> Funcionario:
    caretaker = _create_caretaker_sms_scenario(db)
    yield caretaker

    db.exec(delete(Acess))
    db.exec(delete(Funcionario).where(Funcionario.id == caretaker.id))
    db.exec(delete(User).where(User.condominio_id == caretaker.condominio_id))
    db.exec(delete(Condominio).where(Condominio.id == caretaker.condominio_id))
    db.commit()


def test_create_caretaker_work_time_sends_sms_on_first_in(
    client: TestClient,
    caretaker_sms_setup: Funcionario,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "CLEANER_STATUS_SMS_TO", "7952474965")

    with patch("app.api.routes.acess.get_default_funcionario", return_value=caretaker_sms_setup):
        with patch("app.api.routes.acess.send_sms_notification", return_value="SM123") as sms_mock:
            response = client.post(
                f"{settings.API_V1_STR}/acess/caretaker/work-time",
                json={"operacao": 0},
            )

    assert response.status_code == 201
    sms_mock.assert_called_once_with(
        phone_to="+447952474965",
        body="Caretaker IN",
    )


def test_create_caretaker_work_time_does_not_resend_in_same_day(
    client: TestClient,
    caretaker_sms_setup: Funcionario,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "CLEANER_STATUS_SMS_TO", "7952474965")

    with patch("app.api.routes.acess.get_default_funcionario", return_value=caretaker_sms_setup):
        with patch("app.api.routes.acess.send_sms_notification", return_value="SM123") as sms_mock:
            first_in = client.post(
                f"{settings.API_V1_STR}/acess/caretaker/work-time",
                json={"operacao": 0},
            )
            assert first_in.status_code == 201

            first_out = client.post(
                f"{settings.API_V1_STR}/acess/caretaker/work-time",
                json={"operacao": 1},
            )
            assert first_out.status_code == 201

            sms_mock.reset_mock()

            second_in = client.post(
                f"{settings.API_V1_STR}/acess/caretaker/work-time",
                json={"operacao": 0},
            )

    assert second_in.status_code == 201
    sms_mock.assert_not_called()


def test_create_caretaker_work_time_sends_sms_on_out(
    client: TestClient,
    caretaker_sms_setup: Funcionario,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "CLEANER_STATUS_SMS_TO", "7952474965")

    with patch("app.api.routes.acess.get_default_funcionario", return_value=caretaker_sms_setup):
        with patch("app.api.routes.acess.send_sms_notification", return_value="SM123") as sms_mock:
            first_in = client.post(
                f"{settings.API_V1_STR}/acess/caretaker/work-time",
                json={"operacao": 0},
            )
            assert first_in.status_code == 201

            sms_mock.reset_mock()

            response = client.post(
                f"{settings.API_V1_STR}/acess/caretaker/work-time",
                json={"operacao": 1},
            )

    assert response.status_code == 201
    sms_mock.assert_called_once_with(
        phone_to="+447952474965",
        body="Caretaker OUT",
    )


def test_create_caretaker_work_time_does_not_resend_out_same_day(
    client: TestClient,
    caretaker_sms_setup: Funcionario,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "CLEANER_STATUS_SMS_TO", "7952474965")

    with patch("app.api.routes.acess.get_default_funcionario", return_value=caretaker_sms_setup):
        with patch("app.api.routes.acess.send_sms_notification", return_value="SM123") as sms_mock:
            first_in = client.post(
                f"{settings.API_V1_STR}/acess/caretaker/work-time",
                json={"operacao": 0},
            )
            assert first_in.status_code == 201

            first_out = client.post(
                f"{settings.API_V1_STR}/acess/caretaker/work-time",
                json={"operacao": 1},
            )
            assert first_out.status_code == 201

            second_in = client.post(
                f"{settings.API_V1_STR}/acess/caretaker/work-time",
                json={"operacao": 0},
            )
            assert second_in.status_code == 201

            sms_mock.reset_mock()

            second_out = client.post(
                f"{settings.API_V1_STR}/acess/caretaker/work-time",
                json={"operacao": 1},
            )

    assert second_out.status_code == 201
    sms_mock.assert_not_called()


def test_update_caretaker_work_time_record(
    client: TestClient,
    caretaker_sms_setup: Funcionario,
    superuser_token_headers: dict[str, str],
) -> None:
    with patch("app.api.routes.acess.get_default_funcionario", return_value=caretaker_sms_setup):
        create_response = client.post(
            f"{settings.API_V1_STR}/acess/caretaker/work-time",
            json={"operacao": 0, "data": "2026-03-15T08:00:00Z"},
        )

    assert create_response.status_code == 201
    record_id = create_response.json()["id"]

    update_response = client.patch(
        f"{settings.API_V1_STR}/acess/caretaker/work-time/{record_id}",
        headers=superuser_token_headers,
        json={"data": "2026-03-15T09:45:00Z"},
    )

    assert update_response.status_code == 200
    payload = update_response.json()
    assert payload["id"] == record_id
    updated_at = datetime.fromisoformat(payload["data"])
    assert updated_at.astimezone(timezone.utc) == datetime(
        2026, 3, 15, 9, 45, tzinfo=timezone.utc
    )


def test_update_caretaker_work_time_requires_manager_permissions(
    client: TestClient,
    caretaker_sms_setup: Funcionario,
    db: Session,
) -> None:
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
            condominio_id=caretaker_sms_setup.condominio_id,
        ),
    )
    normal_user_headers = user_authentication_headers(
        client=client,
        email=normal_user_email,
        password=normal_user_password,
    )

    with patch("app.api.routes.acess.get_default_funcionario", return_value=caretaker_sms_setup):
        create_response = client.post(
            f"{settings.API_V1_STR}/acess/caretaker/work-time",
            json={"operacao": 0, "data": "2026-03-15T08:00:00Z"},
        )

    assert create_response.status_code == 201
    record_id = create_response.json()["id"]

    update_response = client.patch(
        f"{settings.API_V1_STR}/acess/caretaker/work-time/{record_id}",
        headers=normal_user_headers,
        json={"data": "2026-03-15T09:45:00Z"},
    )

    assert update_response.status_code == 403
