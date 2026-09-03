from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.models import (
    GoogleCalendarConnectPublic,
    GoogleCalendarIntegrationStatusPublic,
    GoogleCalendarResyncPublic,
)
from app.services.google_calendar import (
    GoogleCalendarConfigurationError,
    GoogleCalendarOAuthStateError,
    GoogleCalendarPermanentError,
    GoogleCalendarReconnectRequired,
    GoogleCalendarTransientError,
    begin_google_calendar_oauth,
    consume_google_calendar_oauth_state,
    disconnect_google_calendar,
    finish_google_calendar_oauth,
    google_calendar_status,
    is_google_calendar_manager,
    queue_full_google_calendar_resync,
)

router = APIRouter(
    prefix="/calendar-integrations/google", tags=["calendar-integrations"]
)


def _require_manager(current_user: CurrentUser) -> None:
    if not is_google_calendar_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")


def _configuration_error(exc: GoogleCalendarConfigurationError) -> HTTPException:
    return HTTPException(status_code=503, detail=str(exc))


@router.post("/connect", response_model=GoogleCalendarConnectPublic)
def connect_google_calendar(
    *, session: SessionDep, current_user: CurrentUser
) -> GoogleCalendarConnectPublic:
    _require_manager(current_user)
    try:
        return GoogleCalendarConnectPublic(
            authorization_url=begin_google_calendar_oauth(session, current_user)
        )
    except GoogleCalendarConfigurationError as exc:
        raise _configuration_error(exc) from exc


@router.get("/callback", include_in_schema=False)
def google_calendar_callback(
    *,
    session: SessionDep,
    code: str | None = None,
    state: str = "",
    error: str | None = None,
) -> RedirectResponse:
    if error:
        # The state is not disclosed, logged, or re-used after a denied consent.
        try:
            consume_google_calendar_oauth_state(session, state)
        except GoogleCalendarOAuthStateError:
            pass
        raise HTTPException(
            status_code=400, detail="Google Calendar authorization was cancelled"
        )
    try:
        user = finish_google_calendar_oauth(session, code=code or "", state=state)
    except GoogleCalendarOAuthStateError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except GoogleCalendarConfigurationError as exc:
        raise _configuration_error(exc) from exc
    except (
        GoogleCalendarPermanentError,
        GoogleCalendarReconnectRequired,
        GoogleCalendarTransientError,
    ) as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    destination = "/admin" if user.is_superuser else "/dashboard"
    query = urlencode({"google_calendar": "connected"})
    return RedirectResponse(
        url=f"{settings.FRONTEND_HOST.rstrip('/')}{destination}?{query}",
        status_code=303,
    )


@router.get("/status", response_model=GoogleCalendarIntegrationStatusPublic)
def get_google_calendar_status(
    *, session: SessionDep, current_user: CurrentUser
) -> GoogleCalendarIntegrationStatusPublic:
    _require_manager(current_user)
    connection, pending_jobs = google_calendar_status(session, current_user)
    if not connection:
        return GoogleCalendarIntegrationStatusPublic(
            connected=False,
            status="disconnected",
        )
    return GoogleCalendarIntegrationStatusPublic(
        connected=bool(
            connection.status == "active" and connection.refresh_token_encrypted
        ),
        status=connection.status,
        calendar_name="Oak Hill Park" if connection.calendar_id else None,
        account_email=connection.account_email,
        last_synced_at=connection.last_synced_at,
        pending_jobs=pending_jobs,
        last_error=connection.last_error,
    )


@router.post("/resync", response_model=GoogleCalendarResyncPublic)
def resync_google_calendar(
    *, session: SessionDep, current_user: CurrentUser
) -> GoogleCalendarResyncPublic:
    _require_manager(current_user)
    connection, _ = google_calendar_status(session, current_user)
    if (
        not connection
        or connection.status != "active"
        or not connection.refresh_token_encrypted
    ):
        raise HTTPException(status_code=409, detail="Google Calendar is not connected")
    if not current_user.condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")
    queued = queue_full_google_calendar_resync(
        session, connection, current_user.condominio_id
    )
    session.commit()
    return GoogleCalendarResyncPublic(queued=queued)


@router.delete("/connection")
def delete_google_calendar_connection(
    *, session: SessionDep, current_user: CurrentUser
) -> dict[str, str]:
    _require_manager(current_user)
    disconnect_google_calendar(session, current_user.id)
    return {"message": "Google Calendar disconnected"}
