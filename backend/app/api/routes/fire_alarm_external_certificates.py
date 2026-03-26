import base64
import binascii
import re
from datetime import date, datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import or_
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Condominio,
    FireAlarmExternalCertificate,
    FireAlarmExternalCertificateCreate,
    FireAlarmExternalCertificatePublic,
    FireAlarmExternalCertificatesPublic,
    User,
)

router = APIRouter(
    prefix="/fire-alarm-external-certificates",
    tags=["fire-alarm-external-certificates"],
)

DATA_URL_PATTERN = re.compile(
    r"^data:(?P<mime>[-\w.+/]+/[-\w.+]+)?;base64,(?P<data>[A-Za-z0-9+/=\s]+)$"
)
TIME_PATTERN = re.compile(r"^\d{2}:\d{2}$")
MAX_MEDIA_BYTES = 10 * 1024 * 1024


def _is_manager(user: User) -> bool:
    return bool(user.is_superuser or user.cargo >= 2)


def _resolve_user_condominio_id(session: SessionDep, user: User):
    if user.condominio_id:
        return user.condominio_id
    condominio = session.exec(select(Condominio).limit(1)).first()
    if condominio:
        user.condominio_id = condominio.id
        session.add(user)
        session.commit()
        session.refresh(user)
        return condominio.id
    return None


def _certificate_to_public(
    certificate: FireAlarmExternalCertificate,
) -> FireAlarmExternalCertificatePublic:
    return FireAlarmExternalCertificatePublic(
        id=certificate.id,
        condominio_id=certificate.condominio_id,
        certificate_date=certificate.certificate_date,
        certificate_time=certificate.certificate_time,
        company=certificate.company,
        professional=certificate.professional,
        media_1_name=certificate.media_1_name,
        media_1_data=certificate.media_1_data,
        media_2_name=certificate.media_2_name,
        media_2_data=certificate.media_2_data,
        created_by_user_id=certificate.created_by_user_id,
        created_at=certificate.created_at,
    )


def _normalise_media_name(value: str | None) -> str | None:
    if not value:
        return None
    stripped = value.strip()
    return stripped or None


def _normalise_media_data(field_name: str, value: str | None) -> str | None:
    if not value:
        return None
    stripped = value.strip()
    if not stripped:
        return None

    match = DATA_URL_PATTERN.fullmatch(stripped)
    if not match:
        raise HTTPException(status_code=422, detail=f"Invalid {field_name}")

    try:
        file_bytes = base64.b64decode(match.group("data"), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid {field_name}") from exc

    if not file_bytes:
        raise HTTPException(status_code=422, detail=f"Empty {field_name}")
    if len(file_bytes) > MAX_MEDIA_BYTES:
        raise HTTPException(status_code=413, detail=f"{field_name} is too large")
    return stripped


def _normalise_time(value: str) -> str:
    stripped = value.strip()
    if not TIME_PATTERN.fullmatch(stripped):
        raise HTTPException(status_code=400, detail="Time must be in HH:MM format")
    try:
        datetime.strptime(stripped, "%H:%M")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid time value") from exc
    return stripped


@router.get("/", response_model=FireAlarmExternalCertificatesPublic)
def read_fire_alarm_external_certificates(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> Any:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    filters = [FireAlarmExternalCertificate.condominio_id == condominio_id]

    if search and search.strip():
        query = f"%{search.strip()}%"
        filters.append(
            or_(
                FireAlarmExternalCertificate.company.ilike(query),
                FireAlarmExternalCertificate.professional.ilike(query),
            )
        )

    if date_from:
        filters.append(FireAlarmExternalCertificate.certificate_date >= date_from)
    if date_to:
        filters.append(FireAlarmExternalCertificate.certificate_date <= date_to)

    count_statement = select(func.count()).select_from(FireAlarmExternalCertificate)
    statement = select(FireAlarmExternalCertificate)
    for item_filter in filters:
        count_statement = count_statement.where(item_filter)
        statement = statement.where(item_filter)

    count = session.exec(count_statement).one()
    certificates = session.exec(
        statement
        .order_by(
            FireAlarmExternalCertificate.certificate_date.desc(),
            FireAlarmExternalCertificate.certificate_time.desc(),
            FireAlarmExternalCertificate.created_at.desc(),
        )
        .offset(skip)
        .limit(limit)
    ).all()

    return FireAlarmExternalCertificatesPublic(
        data=[_certificate_to_public(item) for item in certificates],
        count=count,
    )


@router.post("/", response_model=FireAlarmExternalCertificatePublic, status_code=201)
def create_fire_alarm_external_certificate(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: FireAlarmExternalCertificateCreate,
) -> FireAlarmExternalCertificatePublic:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    media_1_data = _normalise_media_data("media_1_data", payload.media_1_data)
    media_2_data = _normalise_media_data("media_2_data", payload.media_2_data)

    certificate = FireAlarmExternalCertificate(
        condominio_id=condominio_id,
        certificate_date=payload.certificate_date,
        certificate_time=_normalise_time(payload.certificate_time),
        company=payload.company.strip(),
        professional=payload.professional.strip(),
        media_1_name=_normalise_media_name(payload.media_1_name)
        if media_1_data
        else None,
        media_1_data=media_1_data,
        media_2_name=_normalise_media_name(payload.media_2_name)
        if media_2_data
        else None,
        media_2_data=media_2_data,
        created_by_user_id=current_user.id,
    )
    session.add(certificate)
    session.commit()
    session.refresh(certificate)
    return _certificate_to_public(certificate)
