import base64
import binascii
import re
import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Building,
    Condominio,
    FireAlarmExternalCertificate,
    FireAlarmExternalCertificateCreate,
    FireAlarmExternalCertificatePublic,
    FireAlarmExternalCertificatesPublic,
    Message,
    User,
)

router = APIRouter(
    prefix="/fire-alarm-external-certificates",
    tags=["fire-alarm-external-certificates"],
)

DATA_URL_PATTERN = re.compile(
    r"^data:(?P<mime>[-\w.+/]+/[-\w.+]+)?;base64,(?P<data>[A-Za-z0-9+/=\s]+)$"
)
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
    *,
    building_name: str | None = None,
) -> FireAlarmExternalCertificatePublic:
    return FireAlarmExternalCertificatePublic(
        id=certificate.id,
        condominio_id=certificate.condominio_id,
        building_id=certificate.building_id,
        building_name=building_name,
        certificate_date=certificate.certificate_date,
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


def _require_building_for_condominio(
    session: SessionDep,
    *,
    condominio_id: uuid.UUID,
    building_id: uuid.UUID,
) -> Building:
    building = session.exec(
        select(Building).where(
            Building.id == building_id,
            Building.condominio_id == condominio_id,
        )
    ).first()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    return building


def _require_certificate_for_condominio(
    session: SessionDep,
    *,
    condominio_id: uuid.UUID,
    certificate_id: uuid.UUID,
) -> FireAlarmExternalCertificate:
    certificate = session.get(FireAlarmExternalCertificate, certificate_id)
    if not certificate or certificate.condominio_id != condominio_id:
        raise HTTPException(status_code=404, detail="Certificate not found")
    return certificate


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
        filters.append(Building.nome.ilike(query))

    if date_from:
        filters.append(FireAlarmExternalCertificate.certificate_date >= date_from)
    if date_to:
        filters.append(FireAlarmExternalCertificate.certificate_date <= date_to)

    count_statement = (
        select(func.count())
        .select_from(FireAlarmExternalCertificate)
        .join(Building, FireAlarmExternalCertificate.building_id == Building.id, isouter=True)
    )
    statement = (
        select(FireAlarmExternalCertificate, Building)
        .join(Building, FireAlarmExternalCertificate.building_id == Building.id, isouter=True)
    )
    for item_filter in filters:
        count_statement = count_statement.where(item_filter)
        statement = statement.where(item_filter)

    count = session.exec(count_statement).one()
    certificates = session.exec(
        statement
        .order_by(
            FireAlarmExternalCertificate.certificate_date.desc(),
            FireAlarmExternalCertificate.created_at.desc(),
        )
        .offset(skip)
        .limit(limit)
    ).all()

    return FireAlarmExternalCertificatesPublic(
        data=[
            _certificate_to_public(
                certificate,
                building_name=building.nome if building else None,
            )
            for certificate, building in certificates
        ],
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

    building = _require_building_for_condominio(
        session,
        condominio_id=condominio_id,
        building_id=payload.building_id,
    )
    media_1_data = _normalise_media_data("media_1_data", payload.media_1_data)
    media_2_data = _normalise_media_data("media_2_data", payload.media_2_data)

    certificate = FireAlarmExternalCertificate(
        condominio_id=condominio_id,
        building_id=building.id,
        certificate_date=payload.certificate_date,
        certificate_time="",
        company="",
        professional="",
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
    return _certificate_to_public(certificate, building_name=building.nome)


@router.patch(
    "/{certificate_id}",
    response_model=FireAlarmExternalCertificatePublic,
)
def update_fire_alarm_external_certificate(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    certificate_id: uuid.UUID,
    payload: FireAlarmExternalCertificateCreate,
) -> FireAlarmExternalCertificatePublic:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    certificate = _require_certificate_for_condominio(
        session,
        condominio_id=condominio_id,
        certificate_id=certificate_id,
    )
    building = _require_building_for_condominio(
        session,
        condominio_id=condominio_id,
        building_id=payload.building_id,
    )
    media_1_data = _normalise_media_data("media_1_data", payload.media_1_data)
    media_2_data = _normalise_media_data("media_2_data", payload.media_2_data)

    certificate.building_id = building.id
    certificate.certificate_date = payload.certificate_date
    certificate.media_1_name = (
        _normalise_media_name(payload.media_1_name) if media_1_data else None
    )
    certificate.media_1_data = media_1_data
    certificate.media_2_name = (
        _normalise_media_name(payload.media_2_name) if media_2_data else None
    )
    certificate.media_2_data = media_2_data

    session.add(certificate)
    session.commit()
    session.refresh(certificate)
    return _certificate_to_public(certificate, building_name=building.nome)


@router.delete(
    "/{certificate_id}",
    response_model=Message,
)
def delete_fire_alarm_external_certificate(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    certificate_id: uuid.UUID,
) -> Message:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    certificate = _require_certificate_for_condominio(
        session,
        condominio_id=condominio_id,
        certificate_id=certificate_id,
    )

    session.delete(certificate)
    session.commit()
    return Message(message="Certificate deleted successfully")
