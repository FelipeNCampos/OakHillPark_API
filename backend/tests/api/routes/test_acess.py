from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlmodel import delete
from sqlmodel import Session

from app.core.config import settings
from app.models import Acess, Building, BuildingCreate, Condominio, CondominioCreate, Funcionario, User


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
