"""Google Calendar OAuth and persistent synchronization support.

This module deliberately talks to the Google REST API with ``httpx`` instead of
using a broad Google client library.  It keeps the OAuth scope and the data we
send to Google small and makes the worker straightforward to exercise in tests.
"""

import base64
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken
from sqlmodel import Session, func, select

from app.core.config import settings
from app.models import (
    ContractorHistory,
    ContractorHistoryCategory,
    ContractorVisit,
    GoogleCalendarConnection,
    GoogleCalendarOAuthState,
    GoogleCalendarSyncJob,
    User,
)

GOOGLE_AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CALENDAR_API_URL = "https://www.googleapis.com/calendar/v3"
GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created"
GOOGLE_CALENDAR_NAME = "Oak Hill Park"
ONE_HOUR = timedelta(hours=1)


class GoogleCalendarConfigurationError(RuntimeError):
    """The integration was requested before its server credentials were set."""


class GoogleCalendarOAuthStateError(ValueError):
    """OAuth state was unknown, expired, or has already been consumed."""


class GoogleCalendarTransientError(RuntimeError):
    """A request can safely be retried later."""


class GoogleCalendarReconnectRequired(RuntimeError):
    """The user must grant the application access again."""


class GoogleCalendarPermanentError(RuntimeError):
    """A request failed for a non-retryable, sanitized reason."""


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def is_google_calendar_manager(user: User) -> bool:
    return bool(user.is_superuser or user.cargo >= 2)


def _require_configuration() -> None:
    if not settings.google_calendar_enabled:
        raise GoogleCalendarConfigurationError(
            "Google Calendar integration is not configured"
        )


def _fernet() -> Fernet:
    _require_configuration()
    key = settings.GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY
    if not key:  # guarded above, retained for static clarity
        raise GoogleCalendarConfigurationError(
            "Google Calendar token encryption is not configured"
        )
    return Fernet(key.encode())


def encrypt_google_refresh_token(token: str) -> str:
    return _fernet().encrypt(token.encode()).decode()


def decrypt_google_refresh_token(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except (InvalidToken, UnicodeDecodeError) as exc:
        raise GoogleCalendarReconnectRequired(
            "Stored Google credentials are no longer valid"
        ) from exc


def _hash_state(state: str) -> str:
    return hashlib.sha256(state.encode()).hexdigest()


def _pkce_challenge(verifier: str) -> str:
    return (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .decode()
        .rstrip("=")
    )


def begin_google_calendar_oauth(session: Session, user: User) -> str:
    """Persist a one-time PKCE state and return the Google consent URL."""
    _require_configuration()
    now = utc_now()
    for stale_state in session.exec(
        select(GoogleCalendarOAuthState).where(
            GoogleCalendarOAuthState.expires_at < now
        )
    ).all():
        session.delete(stale_state)

    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(72)
    session.add(
        GoogleCalendarOAuthState(
            state_hash=_hash_state(state),
            user_id=user.id,
            code_verifier=verifier,
            expires_at=now + timedelta(minutes=10),
        )
    )
    session.commit()

    query = urlencode(
        {
            "client_id": settings.GOOGLE_CALENDAR_CLIENT_ID,
            "redirect_uri": settings.google_calendar_redirect_uri,
            "response_type": "code",
            "scope": GOOGLE_CALENDAR_SCOPE,
            "state": state,
            "code_challenge": _pkce_challenge(verifier),
            "code_challenge_method": "S256",
            "access_type": "offline",
            "prompt": "consent",
        }
    )
    return f"{GOOGLE_AUTHORIZATION_URL}?{query}"


def consume_google_calendar_oauth_state(
    session: Session, state: str
) -> GoogleCalendarOAuthState:
    """Atomically consume a state before exchanging its authorization code."""
    if not state:
        raise GoogleCalendarOAuthStateError("Invalid Google OAuth state")
    record = session.exec(
        select(GoogleCalendarOAuthState)
        .where(GoogleCalendarOAuthState.state_hash == _hash_state(state))
        .with_for_update()
    ).first()
    now = utc_now()
    if not record or record.used_at is not None or record.expires_at <= now:
        raise GoogleCalendarOAuthStateError("Invalid or expired Google OAuth state")
    record.used_at = now
    session.add(record)
    session.commit()
    return record


def _post_form(client: httpx.Client, url: str, data: dict[str, str]) -> dict[str, Any]:
    try:
        response = client.post(url, data=data)
    except httpx.TimeoutException as exc:
        raise GoogleCalendarTransientError("Google request timed out") from exc
    except httpx.HTTPError as exc:
        raise GoogleCalendarTransientError(
            "Google request could not be completed"
        ) from exc

    if response.status_code in {400, 401, 403}:
        raise GoogleCalendarReconnectRequired("Google authorization needs reconnecting")
    if response.status_code == 429 or response.status_code >= 500:
        raise GoogleCalendarTransientError("Google is temporarily unavailable")
    if response.status_code >= 400:
        raise GoogleCalendarPermanentError("Google rejected the authorization request")
    try:
        return response.json()
    except ValueError as exc:
        raise GoogleCalendarPermanentError(
            "Google returned an invalid response"
        ) from exc


def exchange_google_authorization_code(code: str, verifier: str) -> str:
    _require_configuration()
    if not code:
        raise GoogleCalendarPermanentError(
            "Google did not return an authorization code"
        )
    with httpx.Client(timeout=20.0) as client:
        payload = _post_form(
            client,
            GOOGLE_TOKEN_URL,
            {
                "code": code,
                "client_id": settings.GOOGLE_CALENDAR_CLIENT_ID or "",
                "client_secret": settings.GOOGLE_CALENDAR_CLIENT_SECRET or "",
                "redirect_uri": settings.google_calendar_redirect_uri,
                "grant_type": "authorization_code",
                "code_verifier": verifier,
            },
        )
    refresh_token = payload.get("refresh_token")
    if not isinstance(refresh_token, str) or not refresh_token:
        raise GoogleCalendarReconnectRequired(
            "Google did not issue a refresh token; reconnect and grant consent again"
        )
    return refresh_token


def _refresh_google_access_token(connection: GoogleCalendarConnection) -> str:
    encrypted_token = connection.refresh_token_encrypted
    if not encrypted_token:
        raise GoogleCalendarReconnectRequired("Google authorization needs reconnecting")
    refresh_token = decrypt_google_refresh_token(encrypted_token)
    with httpx.Client(timeout=20.0) as client:
        payload = _post_form(
            client,
            GOOGLE_TOKEN_URL,
            {
                "client_id": settings.GOOGLE_CALENDAR_CLIENT_ID or "",
                "client_secret": settings.GOOGLE_CALENDAR_CLIENT_SECRET or "",
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
    access_token = payload.get("access_token")
    if not isinstance(access_token, str) or not access_token:
        raise GoogleCalendarReconnectRequired("Google authorization needs reconnecting")
    return access_token


def _google_request(
    client: httpx.Client,
    method: str,
    path: str,
    access_token: str,
    *,
    json: dict[str, Any] | None = None,
) -> httpx.Response:
    try:
        response = client.request(
            method,
            f"{GOOGLE_CALENDAR_API_URL}{path}",
            headers={"Authorization": f"Bearer {access_token}"},
            json=json,
        )
    except httpx.TimeoutException as exc:
        raise GoogleCalendarTransientError("Google request timed out") from exc
    except httpx.HTTPError as exc:
        raise GoogleCalendarTransientError(
            "Google request could not be completed"
        ) from exc

    if response.status_code in {401, 403}:
        raise GoogleCalendarReconnectRequired("Google authorization needs reconnecting")
    if response.status_code == 429 or response.status_code >= 500:
        raise GoogleCalendarTransientError("Google is temporarily unavailable")
    return response


def _create_google_calendar(access_token: str) -> str:
    with httpx.Client(timeout=20.0) as client:
        response = _google_request(
            client,
            "POST",
            "/calendars",
            access_token,
            json={"summary": GOOGLE_CALENDAR_NAME},
        )
    if response.status_code >= 400:
        raise GoogleCalendarPermanentError(
            "Google could not create the private calendar"
        )
    try:
        calendar_id = response.json().get("id")
    except ValueError as exc:
        raise GoogleCalendarPermanentError(
            "Google returned an invalid calendar"
        ) from exc
    if not isinstance(calendar_id, str) or not calendar_id:
        raise GoogleCalendarPermanentError(
            "Google did not return a calendar identifier"
        )
    return calendar_id


def _event_id(history_id: uuid.UUID) -> str:
    # Google accepts lower-case base32hex characters; UUID hex is a valid subset.
    return f"ohp{history_id.hex}"


def _as_utc(value: datetime) -> datetime:
    return (
        value.replace(tzinfo=timezone.utc)
        if value.tzinfo is None
        else value.astimezone(timezone.utc)
    )


def _build_event(
    history: ContractorHistory,
    visit: ContractorVisit,
    category: ContractorHistoryCategory,
) -> dict[str, Any]:
    if history.next_job_at is None:
        raise GoogleCalendarPermanentError("Scheduled contractor job has no date")
    start = _as_utc(history.next_job_at)
    if visit.out_at and _as_utc(visit.out_at) > _as_utc(visit.in_at):
        duration = _as_utc(visit.out_at) - _as_utc(visit.in_at)
    else:
        duration = ONE_HOUR
    end = start + duration
    category_name = category.name.strip() or "Contractor"
    job_description = visit.job_description.strip() or "Scheduled contractor job"
    building = visit.block.strip() or "Oak Hill Park"
    return {
        "id": _event_id(history.id),
        "summary": f"{category_name}: {job_description}",
        "description": "\n".join(
            [
                f"Contractor: {visit.name}",
                f"Company: {visit.company}",
                f"Service: {job_description}",
                f"Building: {building}",
                f"Phone: {visit.mobile}",
                f"Category: {category_name}",
            ]
        ),
        "location": building,
        "start": {"dateTime": start.isoformat(), "timeZone": "UTC"},
        "end": {"dateTime": end.isoformat(), "timeZone": "UTC"},
        "reminders": {"useDefault": True},
        "extendedProperties": {
            "private": {
                "oakhillpark_managed": "true",
                "oakhillpark_history_id": str(history.id),
            }
        },
    }


def _active_connections_for_condominio(
    session: Session, condominio_id: uuid.UUID
) -> list[GoogleCalendarConnection]:
    return session.exec(
        select(GoogleCalendarConnection)
        .join(User, User.id == GoogleCalendarConnection.user_id)
        .where(
            User.condominio_id == condominio_id,
            GoogleCalendarConnection.status == "active",
            GoogleCalendarConnection.refresh_token_encrypted.is_not(None),
        )
    ).all()


def _queue_history_job(
    session: Session,
    connection_id: uuid.UUID,
    history_id: uuid.UUID,
) -> bool:
    dedupe_key = f"history:{connection_id}:{history_id}"
    existing = session.exec(
        select(GoogleCalendarSyncJob).where(
            GoogleCalendarSyncJob.dedupe_key == dedupe_key
        )
    ).first()
    now = utc_now()
    if existing:
        existing.status = "pending"
        existing.attempts = 0
        existing.next_attempt_at = now
        existing.locked_at = None
        existing.last_error = None
        existing.updated_at = now
        session.add(existing)
        return False
    session.add(
        GoogleCalendarSyncJob(
            connection_id=connection_id,
            contractor_history_id=history_id,
            kind="history",
            dedupe_key=dedupe_key,
        )
    )
    return True


def queue_history_changes_for_condominio(
    session: Session,
    condominio_id: uuid.UUID,
    history_ids: list[uuid.UUID],
) -> int:
    """Queue an idempotent update/deletion for every connected condo manager.

    This intentionally does not commit: callers include it in the transaction
    which changes the source contractor data.
    """
    if not history_ids:
        return 0
    queued = 0
    for connection in _active_connections_for_condominio(session, condominio_id):
        for history_id in set(history_ids):
            queued += int(_queue_history_job(session, connection.id, history_id))
    return queued


def queue_histories_for_contractor_visit(
    session: Session, visit: ContractorVisit
) -> int:
    now = utc_now()
    history_ids = session.exec(
        select(ContractorHistory.id).where(
            ContractorHistory.contractor_visit_id == visit.id,
            ContractorHistory.condominio_id == visit.condominio_id,
            ContractorHistory.next_enabled.is_(True),
            ContractorHistory.next_job_at.is_not(None),
            ContractorHistory.next_job_at >= now,
        )
    ).all()
    return queue_history_changes_for_condominio(
        session, visit.condominio_id, history_ids
    )


def queue_full_google_calendar_resync(
    session: Session, connection: GoogleCalendarConnection, condominio_id: uuid.UUID
) -> int:
    now = utc_now()
    history_ids = session.exec(
        select(ContractorHistory.id).where(
            ContractorHistory.condominio_id == condominio_id,
            ContractorHistory.next_enabled.is_(True),
            ContractorHistory.next_job_at.is_not(None),
            ContractorHistory.next_job_at >= now,
        )
    ).all()
    queued = 0
    for history_id in history_ids:
        queued += int(_queue_history_job(session, connection.id, history_id))
    return queued


def _resolve_user_condominio_id(session: Session, user: User) -> uuid.UUID | None:
    if user.condominio_id:
        return user.condominio_id
    # This preserves the application's existing single-condominium fallback.
    from app.models import Condominio

    condominio = session.exec(select(Condominio).limit(1)).first()
    if not condominio:
        return None
    user.condominio_id = condominio.id
    session.add(user)
    session.commit()
    session.refresh(user)
    return condominio.id


def finish_google_calendar_oauth(session: Session, *, code: str, state: str) -> User:
    """Exchange a valid callback, prepare the app calendar and queue its import."""
    state_record = consume_google_calendar_oauth_state(session, state)
    user = session.get(User, state_record.user_id)
    if not user or not is_google_calendar_manager(user):
        raise GoogleCalendarOAuthStateError(
            "Google Calendar access is no longer allowed"
        )
    condominio_id = _resolve_user_condominio_id(session, user)
    if not condominio_id:
        raise GoogleCalendarPermanentError("No condominio is configured for this user")

    refresh_token = exchange_google_authorization_code(code, state_record.code_verifier)
    # The code exchange also returns an access token, but storing only the refresh
    # token is intentional. Refreshing here avoids persisting a short-lived secret.
    temporary_connection = GoogleCalendarConnection(
        user_id=user.id,
        refresh_token_encrypted=encrypt_google_refresh_token(refresh_token),
    )
    access_token = _refresh_google_access_token(temporary_connection)

    connection = session.exec(
        select(GoogleCalendarConnection).where(
            GoogleCalendarConnection.user_id == user.id
        )
    ).first()
    calendar_id = (
        connection.calendar_id if connection and connection.status == "active" else None
    )
    if not calendar_id:
        calendar_id = _create_google_calendar(access_token)

    now = utc_now()
    if not connection:
        connection = GoogleCalendarConnection(user_id=user.id)
    connection.calendar_id = calendar_id
    connection.refresh_token_encrypted = encrypt_google_refresh_token(refresh_token)
    connection.status = "active"
    connection.last_error = None
    connection.updated_at = now
    session.add(connection)
    session.flush()
    queue_full_google_calendar_resync(session, connection, condominio_id)
    session.commit()
    return user


def google_calendar_status(
    session: Session, user: User
) -> tuple[GoogleCalendarConnection | None, int]:
    connection = session.exec(
        select(GoogleCalendarConnection).where(
            GoogleCalendarConnection.user_id == user.id
        )
    ).first()
    if not connection:
        return None, 0
    pending_jobs = session.exec(
        select(func.count())
        .select_from(GoogleCalendarSyncJob)
        .where(
            GoogleCalendarSyncJob.connection_id == connection.id,
            GoogleCalendarSyncJob.status.in_(["pending", "processing"]),
        )
    ).one()
    return connection, pending_jobs


def disconnect_google_calendar(session: Session, user_id: uuid.UUID) -> bool:
    """Forget local credentials without deleting any Google resource."""
    connection = session.exec(
        select(GoogleCalendarConnection).where(
            GoogleCalendarConnection.user_id == user_id
        )
    ).first()
    if not connection:
        return False
    connection.refresh_token_encrypted = None
    connection.calendar_id = None
    connection.status = "disconnected"
    connection.last_error = None
    connection.updated_at = utc_now()
    session.add(connection)
    for job in session.exec(
        select(GoogleCalendarSyncJob).where(
            GoogleCalendarSyncJob.connection_id == connection.id,
            GoogleCalendarSyncJob.status.in_(["pending", "processing"]),
        )
    ).all():
        job.status = "cancelled"
        job.locked_at = None
        job.updated_at = utc_now()
        session.add(job)
    session.commit()
    return True


def deactivate_google_calendar_for_user(session: Session, user_id: uuid.UUID) -> None:
    """Called when an administrator removes a manager's access role."""
    disconnect_google_calendar(session, user_id)


def _mark_connection_reconnect_required(
    session: Session, connection: GoogleCalendarConnection, message: str
) -> None:
    connection.status = "reconnect_required"
    connection.refresh_token_encrypted = None
    connection.last_error = message
    connection.updated_at = utc_now()
    session.add(connection)


def _replace_deleted_google_calendar(
    session: Session,
    connection: GoogleCalendarConnection,
    condominio_id: uuid.UUID,
    access_token: str,
) -> None:
    connection.calendar_id = _create_google_calendar(access_token)
    connection.last_error = None
    connection.updated_at = utc_now()
    session.add(connection)
    queue_full_google_calendar_resync(session, connection, condominio_id)


def _calendar_exists(client: httpx.Client, calendar_id: str, access_token: str) -> bool:
    response = _google_request(client, "GET", f"/calendars/{calendar_id}", access_token)
    if response.status_code == 404:
        return False
    if response.status_code >= 400:
        raise GoogleCalendarPermanentError(
            "Google could not access the private calendar"
        )
    return True


def _sync_history_event(
    session: Session,
    connection: GoogleCalendarConnection,
    history_id: uuid.UUID,
    access_token: str,
) -> bool:
    """Synchronize one history and report whether a replacement calendar was made."""
    user = session.get(User, connection.user_id)
    if not user or not is_google_calendar_manager(user):
        raise GoogleCalendarReconnectRequired(
            "Google Calendar access is no longer allowed"
        )
    condominio_id = _resolve_user_condominio_id(session, user)
    if not condominio_id:
        raise GoogleCalendarPermanentError("No condominio is configured for this user")
    calendar_id = connection.calendar_id
    if not calendar_id:
        _replace_deleted_google_calendar(
            session, connection, condominio_id, access_token
        )
        return True

    history = session.get(ContractorHistory, history_id)
    should_exist = bool(
        history
        and history.condominio_id == condominio_id
        and history.next_enabled
        and history.next_job_at
        and _as_utc(history.next_job_at) >= utc_now()
    )
    with httpx.Client(timeout=20.0) as client:
        if not should_exist:
            response = _google_request(
                client,
                "DELETE",
                f"/calendars/{calendar_id}/events/{_event_id(history_id)}",
                access_token,
            )
            if response.status_code == 404 and not _calendar_exists(
                client, calendar_id, access_token
            ):
                _replace_deleted_google_calendar(
                    session, connection, condominio_id, access_token
                )
                return True
            if response.status_code not in {204, 404}:
                raise GoogleCalendarPermanentError(
                    "Google could not delete the calendar event"
                )
            return False

        visit = session.get(ContractorVisit, history.contractor_visit_id)
        category = session.get(ContractorHistoryCategory, history.category_id)
        if not visit or not category:
            # A concurrently deleted source record is represented by event deletion.
            response = _google_request(
                client,
                "DELETE",
                f"/calendars/{calendar_id}/events/{_event_id(history_id)}",
                access_token,
            )
            if response.status_code not in {204, 404}:
                raise GoogleCalendarPermanentError(
                    "Google could not delete the calendar event"
                )
            return False
        event = _build_event(history, visit, category)
        response = _google_request(
            client,
            "PUT",
            f"/calendars/{calendar_id}/events/{_event_id(history_id)}",
            access_token,
            json=event,
        )
        if response.status_code == 404:
            # A manually removed event is restored with the same deterministic ID.
            response = _google_request(
                client,
                "POST",
                f"/calendars/{calendar_id}/events",
                access_token,
                json=event,
            )
            if response.status_code == 404:
                _replace_deleted_google_calendar(
                    session, connection, condominio_id, access_token
                )
                return True
        if response.status_code >= 400:
            raise GoogleCalendarPermanentError(
                "Google could not update the calendar event"
            )
    return False


def _retry_delay(attempts: int) -> timedelta:
    # The first retry is one minute, doubling up to one day.
    minutes = min(2 ** max(attempts - 1, 0), 24 * 60)
    return timedelta(minutes=minutes)


def process_google_calendar_job(session: Session, job: GoogleCalendarSyncJob) -> None:
    """Process one already-claimed job and commit its resulting state."""
    connection = session.get(GoogleCalendarConnection, job.connection_id)
    if not connection or connection.status != "active":
        job.status = "cancelled"
        job.locked_at = None
        job.updated_at = utc_now()
        session.add(job)
        session.commit()
        return
    try:
        if not job.contractor_history_id:
            raise GoogleCalendarPermanentError("Google Calendar job is invalid")
        access_token = _refresh_google_access_token(connection)
        calendar_recreated = _sync_history_event(
            session, connection, job.contractor_history_id, access_token
        )
    except GoogleCalendarTransientError as exc:
        now = utc_now()
        job.attempts += 1
        job.status = "pending"
        job.next_attempt_at = now + _retry_delay(job.attempts)
        job.locked_at = None
        job.last_error = str(exc)
        job.updated_at = now
        connection.last_error = str(exc)
        connection.updated_at = now
        session.add(job)
        session.add(connection)
        session.commit()
        return
    except GoogleCalendarReconnectRequired:
        _mark_connection_reconnect_required(
            session,
            connection,
            "Reconnect Google Calendar to continue synchronization.",
        )
        job.status = "blocked"
        job.locked_at = None
        job.last_error = "Reconnect Google Calendar to continue synchronization."
        job.updated_at = utc_now()
        session.add(job)
        session.commit()
        return
    except GoogleCalendarPermanentError as exc:
        job.status = "failed"
        job.locked_at = None
        job.last_error = str(exc)
        job.updated_at = utc_now()
        connection.last_error = str(exc)
        connection.updated_at = utc_now()
        session.add(job)
        session.add(connection)
        session.commit()
        return

    now = utc_now()
    if calendar_recreated:
        # The full import requeues this job too. Keep it pending rather than
        # overwriting that requeue as completed below.
        job.status = "pending"
        job.locked_at = None
        job.next_attempt_at = now
        job.last_error = None
        job.updated_at = now
        session.add(job)
        session.commit()
        return
    job.status = "completed"
    job.locked_at = None
    job.last_error = None
    job.updated_at = now
    connection.last_synced_at = now
    connection.last_error = None
    connection.updated_at = now
    session.add(job)
    session.add(connection)
    session.commit()


def claim_next_google_calendar_job(session: Session) -> GoogleCalendarSyncJob | None:
    now = utc_now()
    stale_lock = now - timedelta(minutes=10)
    stale_jobs = session.exec(
        select(GoogleCalendarSyncJob).where(
            GoogleCalendarSyncJob.status == "processing",
            GoogleCalendarSyncJob.locked_at.is_not(None),
            GoogleCalendarSyncJob.locked_at < stale_lock,
        )
    ).all()
    for job in stale_jobs:
        job.status = "pending"
        job.locked_at = None
        job.next_attempt_at = now
        job.updated_at = now
        session.add(job)
    if stale_jobs:
        session.commit()

    job = session.exec(
        select(GoogleCalendarSyncJob)
        .where(
            GoogleCalendarSyncJob.status == "pending",
            GoogleCalendarSyncJob.next_attempt_at <= now,
        )
        .order_by(
            GoogleCalendarSyncJob.next_attempt_at.asc(),
            GoogleCalendarSyncJob.created_at.asc(),
        )
        .with_for_update(skip_locked=True)
        .limit(1)
    ).first()
    if not job:
        return None
    job.status = "processing"
    job.locked_at = now
    job.updated_at = now
    session.add(job)
    session.commit()
    session.refresh(job)
    return job
