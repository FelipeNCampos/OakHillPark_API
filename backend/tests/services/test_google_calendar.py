import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import (
    Condominio,
    CondominioCreate,
    ContractorHistory,
    ContractorHistoryCategory,
    ContractorMaintenance,
    ContractorMaintenanceCategory,
    ContractorVisit,
    GoogleCalendarConnection,
    GoogleCalendarOAuthState,
    GoogleCalendarSyncJob,
    User,
    UserCreate,
)
from app.services.google_calendar import (
    GoogleCalendarOAuthStateError,
    GoogleCalendarTransientError,
    _build_event,
    _build_maintenance_event,
    begin_google_calendar_oauth,
    consume_google_calendar_oauth_state,
    decrypt_google_refresh_token,
    encrypt_google_refresh_token,
    process_google_calendar_job,
    queue_full_google_calendar_resync,
)
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string


@pytest.fixture
def google_calendar_settings(monkeypatch: pytest.MonkeyPatch) -> str:
    monkeypatch.setattr(settings, "GOOGLE_CALENDAR_CLIENT_ID", "calendar-client-id")
    monkeypatch.setattr(
        settings, "GOOGLE_CALENDAR_CLIENT_SECRET", "calendar-client-secret"
    )
    monkeypatch.setattr(
        settings,
        "GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY",
        Fernet.generate_key().decode(),
    )
    return "calendar-client-id"


def _create_condominio(db: Session) -> Condominio:
    item = Condominio.model_validate(
        CondominioCreate(nome=f"Test Google Calendar {uuid.uuid4()}")
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def _create_manager(
    client: TestClient, db: Session, condominio_id: uuid.UUID
) -> tuple[User, dict[str, str]]:
    email = random_email()
    password = random_lower_string()
    user = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=email,
            password=password,
            cargo=2,
            condominio_id=condominio_id,
        ),
    )
    return user, user_authentication_headers(
        client=client, email=email, password=password
    )


def _active_connection(user_id: uuid.UUID) -> GoogleCalendarConnection:
    return GoogleCalendarConnection(
        user_id=user_id,
        calendar_id="oak-hill-private-calendar",
        refresh_token_encrypted="encrypted-token",
        status="active",
    )


def test_google_oauth_state_is_pkce_bound_one_time_and_expires(
    db: Session,
    client: TestClient,
    google_calendar_settings: str,
) -> None:
    assert google_calendar_settings == "calendar-client-id"
    condominio = _create_condominio(db)
    user, _ = _create_manager(client, db, condominio.id)

    authorization_url = begin_google_calendar_oauth(db, user)
    state = parse_qs(urlparse(authorization_url).query)["state"][0]
    saved_state = db.exec(
        select(GoogleCalendarOAuthState).where(
            GoogleCalendarOAuthState.user_id == user.id
        )
    ).first()
    assert saved_state is not None
    assert saved_state.state_hash == hashlib.sha256(state.encode()).hexdigest()
    assert saved_state.code_verifier not in authorization_url
    assert saved_state.expires_at <= datetime.now(timezone.utc) + timedelta(minutes=10)

    consumed = consume_google_calendar_oauth_state(db, state)
    assert consumed.used_at is not None
    with pytest.raises(GoogleCalendarOAuthStateError):
        consume_google_calendar_oauth_state(db, state)

    expired_state = GoogleCalendarOAuthState(
        state_hash=hashlib.sha256(b"expired-google-state").hexdigest(),
        user_id=user.id,
        code_verifier="v" * 48,
        expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
    )
    db.add(expired_state)
    db.commit()
    with pytest.raises(GoogleCalendarOAuthStateError):
        consume_google_calendar_oauth_state(db, "expired-google-state")


def test_google_refresh_tokens_are_encrypted(
    google_calendar_settings: str,
) -> None:
    assert google_calendar_settings == "calendar-client-id"
    encrypted = encrypt_google_refresh_token("refresh-token-secret")
    assert encrypted != "refresh-token-secret"
    assert decrypt_google_refresh_token(encrypted) == "refresh-token-secret"


def test_google_event_mapping_uses_next_service_and_previous_visit_duration() -> None:
    condominio_id = uuid.uuid4()
    visit_id = uuid.uuid4()
    category_id = uuid.uuid4()
    history = ContractorHistory(
        id=uuid.uuid4(),
        condominio_id=condominio_id,
        contractor_visit_id=visit_id,
        category_id=category_id,
        next_enabled=True,
        next_job_at=datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc),
    )
    visit = ContractorVisit(
        id=visit_id,
        condominio_id=condominio_id,
        name="Ava Turner",
        company="Alpha Works",
        block="Merlin",
        job_description="Boiler service",
        mobile="+447700900001",
        in_at=datetime(2026, 9, 1, 8, 0, tzinfo=timezone.utc),
        out_at=datetime(2026, 9, 1, 10, 30, tzinfo=timezone.utc),
    )
    category = ContractorHistoryCategory(
        id=category_id,
        condominio_id=condominio_id,
        name="Heating",
    )

    event = _build_event(history, visit, category)

    assert event["id"] == f"ohp{history.id.hex}"
    assert event["summary"] == "Heating: Boiler service"
    assert event["location"] == "Merlin"
    assert event["start"]["dateTime"] == "2026-10-01T09:00:00+00:00"
    assert event["end"]["dateTime"] == "2026-10-01T11:30:00+00:00"
    assert event["reminders"] == {"useDefault": True}
    assert "Phone: +447700900001" in event["description"]


def test_google_maintenance_event_mapping_uses_next_due_date(db: Session) -> None:
    condominio = _create_condominio(db)
    category = ContractorMaintenanceCategory(
        condominio_id=condominio.id,
        name="Fire safety",
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    maintenance = ContractorMaintenance(
        condominio_id=condominio.id,
        category_id=category.id,
        tag="EXT-01",
        report="Fire extinguisher inspection",
        frequency_days=3,
        frequency_value=3,
        frequency_unit="months",
        notes="Check pressure gauge",
        last_completed_at=datetime(2026, 6, 15, 9, 0, tzinfo=timezone.utc),
    )
    db.add(maintenance)
    db.commit()
    db.refresh(maintenance)

    event = _build_maintenance_event(db, maintenance, category)

    assert event["id"] == f"ohm{maintenance.id.hex}"
    assert event["summary"] == "Fire safety: Fire extinguisher inspection"
    assert event["start"]["dateTime"] == "2026-09-15T09:00:00+00:00"
    assert event["end"]["dateTime"] == "2026-09-15T10:00:00+00:00"
    assert event["location"] == "Oak Hill Park"
    assert "Tag: EXT-01" in event["description"]
    assert "Frequency: 3 months" in event["description"]


def test_first_google_resync_enqueues_existing_overdue_maintenance(
    db: Session,
    client: TestClient,
    google_calendar_settings: str,
) -> None:
    assert google_calendar_settings == "calendar-client-id"
    condominio = _create_condominio(db)
    user, _ = _create_manager(client, db, condominio.id)
    connection = _active_connection(user.id)
    category = ContractorMaintenanceCategory(
        condominio_id=condominio.id,
        name="Elevators",
    )
    db.add(category)
    db.commit()
    db.refresh(category)
    maintenance = ContractorMaintenance(
        condominio_id=condominio.id,
        category_id=category.id,
        report="Quarterly elevator inspection",
        frequency_days=30,
        frequency_value=30,
        frequency_unit="days",
        last_completed_at=datetime.now(timezone.utc) - timedelta(days=31),
    )
    db.add(connection)
    db.add(maintenance)
    db.commit()
    db.refresh(connection)
    db.refresh(maintenance)

    queued = queue_full_google_calendar_resync(db, connection, condominio.id)
    db.commit()

    job = db.exec(
        select(GoogleCalendarSyncJob).where(
            GoogleCalendarSyncJob.connection_id == connection.id,
            GoogleCalendarSyncJob.contractor_maintenance_id == maintenance.id,
        )
    ).first()
    assert queued == 1
    assert job is not None
    assert job.kind == "maintenance"
    assert job.status == "pending"


def test_google_calendar_routes_require_manager(
    client: TestClient,
    db: Session,
) -> None:
    condominio = _create_condominio(db)
    email = random_email()
    password = random_lower_string()
    crud.create_user(
        session=db,
        user_create=UserCreate(
            email=email,
            password=password,
            cargo=1,
            condominio_id=condominio.id,
        ),
    )
    response = client.post(
        "/api/v1/calendar-integrations/google/connect",
        headers=user_authentication_headers(
            client=client, email=email, password=password
        ),
    )
    assert response.status_code == 403


def test_google_calendar_disconnect_forgets_local_credentials(
    db: Session,
    client: TestClient,
    google_calendar_settings: str,
) -> None:
    assert google_calendar_settings == "calendar-client-id"
    condominio = _create_condominio(db)
    user, headers = _create_manager(client, db, condominio.id)
    connection = _active_connection(user.id)
    connection.refresh_token_encrypted = encrypt_google_refresh_token("refresh-token")
    db.add(connection)
    db.commit()
    db.refresh(connection)

    response = client.delete(
        "/api/v1/calendar-integrations/google/connection", headers=headers
    )
    assert response.status_code == 200
    db.expire_all()
    stored = db.get(GoogleCalendarConnection, connection.id)
    assert stored is not None
    assert stored.status == "disconnected"
    assert stored.refresh_token_encrypted is None
    assert stored.calendar_id is None


def test_calendar_worker_completes_and_retries_persistent_jobs(
    db: Session,
    client: TestClient,
    google_calendar_settings: str,
) -> None:
    assert google_calendar_settings == "calendar-client-id"
    condominio = _create_condominio(db)
    user, _ = _create_manager(client, db, condominio.id)
    connection = _active_connection(user.id)
    db.add(connection)
    db.flush()

    completed_job = GoogleCalendarSyncJob(
        connection_id=connection.id,
        contractor_history_id=uuid.uuid4(),
        dedupe_key=f"google-completed-{uuid.uuid4()}",
        status="processing",
        locked_at=datetime.now(timezone.utc),
    )
    db.add(completed_job)
    db.commit()
    with (
        patch(
            "app.services.google_calendar._refresh_google_access_token",
            return_value="access-token",
        ),
        patch(
            "app.services.google_calendar._sync_history_event",
            return_value=False,
        ),
    ):
        process_google_calendar_job(db, completed_job)
    db.refresh(completed_job)
    assert completed_job.status == "completed"
    assert connection.last_synced_at is not None

    maintenance_job = GoogleCalendarSyncJob(
        connection_id=connection.id,
        contractor_maintenance_id=uuid.uuid4(),
        kind="maintenance",
        dedupe_key=f"google-maintenance-{uuid.uuid4()}",
        status="processing",
        locked_at=datetime.now(timezone.utc),
    )
    db.add(maintenance_job)
    db.commit()
    with (
        patch(
            "app.services.google_calendar._refresh_google_access_token",
            return_value="access-token",
        ),
        patch(
            "app.services.google_calendar._sync_maintenance_event",
            return_value=False,
        ) as sync_maintenance,
    ):
        process_google_calendar_job(db, maintenance_job)
    db.refresh(maintenance_job)
    assert maintenance_job.status == "completed"
    sync_maintenance.assert_called_once()

    retry_job = GoogleCalendarSyncJob(
        connection_id=connection.id,
        contractor_history_id=uuid.uuid4(),
        dedupe_key=f"google-retry-{uuid.uuid4()}",
        status="processing",
        locked_at=datetime.now(timezone.utc),
    )
    db.add(retry_job)
    db.commit()
    with patch(
        "app.services.google_calendar._refresh_google_access_token",
        side_effect=GoogleCalendarTransientError("Google request timed out"),
    ):
        process_google_calendar_job(db, retry_job)
    db.refresh(retry_job)
    assert retry_job.status == "pending"
    assert retry_job.attempts == 1
    assert retry_job.next_attempt_at > datetime.now(timezone.utc)


def test_creating_future_history_enqueues_google_sync_for_connected_manager(
    db: Session,
    client: TestClient,
    google_calendar_settings: str,
) -> None:
    assert google_calendar_settings == "calendar-client-id"
    condominio = _create_condominio(db)
    user, headers = _create_manager(client, db, condominio.id)
    connection = _active_connection(user.id)
    db.add(connection)
    visit = ContractorVisit(
        name="Calendar contractor",
        company="Calendar company",
        block="Calendar building",
        job_description="Boiler service",
        mobile="+447700900001",
        in_at=datetime.now(timezone.utc) - timedelta(hours=2),
        out_at=datetime.now(timezone.utc) - timedelta(hours=1),
        condominio_id=condominio.id,
    )
    category = ContractorHistoryCategory(name="Heating", condominio_id=condominio.id)
    db.add(visit)
    db.add(category)
    db.commit()
    db.refresh(visit)
    db.refresh(category)
    db.refresh(connection)

    response = client.post(
        "/api/v1/contractor-access/history",
        headers=headers,
        json={
            "category_id": str(category.id),
            "created_new_visit": False,
            "contractor_visit_id": str(visit.id),
            "next_enabled": True,
            "next_interval_unit": "week",
            "next_interval_value": 1,
        },
    )
    assert response.status_code == 201, response.text
    history_id = response.json()["id"]
    db.expire_all()
    job = db.exec(
        select(GoogleCalendarSyncJob).where(
            GoogleCalendarSyncJob.connection_id == connection.id,
            GoogleCalendarSyncJob.contractor_history_id == uuid.UUID(history_id),
        )
    ).first()
    assert job is not None
    assert job.status == "pending"
