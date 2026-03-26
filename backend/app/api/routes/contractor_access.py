import base64
import binascii
import re
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import or_
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.core.db import ensure_contractor_visit_schema
from app.models import (
    Building,
    Condominio,
    ContractorAccessBuildingPublic,
    ContractorAccessBuildingsPublic,
    ContractorOpenVisitPublic,
    ContractorOpenVisitsPublic,
    ContractorVisit,
    ContractorVisitAdminPublic,
    ContractorVisitCheckInCreate,
    ContractorVisitCheckOutCreate,
    ContractorVisitMediaUpdate,
    ContractorVisitPublic,
    ContractorVisitsPublic,
    User,
)

router = APIRouter(prefix="/contractor-access", tags=["contractor-access"])
DATA_URL_PATTERN = re.compile(
    r"^data:(?P<mime>[-\w.+/]+/[-\w.+]+)?;base64,(?P<data>[A-Za-z0-9+/=\s]+)$"
)
MAX_MEDIA_BYTES = 10 * 1024 * 1024
TEMPORARY_CONTRACTOR_DOOR_CODES = {
    "Falcon": "FalconCode",
    "Martlett": "MartlettCode",
    "Merlin": "MerlinCode",
    "Northwood": "NorthwoodCode",
    "Oak Lodge": "OakLodgeCode",
    "Office": "OfficeCode",
}


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


def _contractor_visit_to_admin_public(
    item: ContractorVisit,
) -> ContractorVisitAdminPublic:
    return ContractorVisitAdminPublic(
        id=item.id,
        name=item.name,
        company=item.company,
        building_name=item.block,
        job_description=item.job_description,
        mobile=item.mobile,
        extra_media_name=item.extra_media_name,
        extra_media_data=item.extra_media_data,
        in_at=item.in_at,
        out_at=item.out_at,
        condominio_id=item.condominio_id,
    )


def _normalise_building_name(value: str) -> str:
    return " ".join(value.casefold().split())


def _lookup_contractor_door_code(
    codes: dict[str, str], normalised_name: str
) -> str | None:
    for configured_name, configured_code in codes.items():
        if _normalise_building_name(configured_name) != normalised_name:
            continue

        code = configured_code.strip()
        return code or None

    return None


def _get_contractor_door_code(building_name: str) -> str | None:
    normalised_name = _normalise_building_name(building_name)
    configured_code = _lookup_contractor_door_code(
        settings.CONTRACTOR_DOOR_CODES, normalised_name
    )
    if configured_code:
        return configured_code
    return _lookup_contractor_door_code(
        TEMPORARY_CONTRACTOR_DOOR_CODES, normalised_name
    )


def _contractor_visit_to_public(item: ContractorVisit) -> ContractorVisitPublic:
    return ContractorVisitPublic(
        id=item.id,
        name=item.name,
        company=item.company,
        building_name=item.block,
        door_code=_get_contractor_door_code(item.block),
        job_description=item.job_description,
        mobile=item.mobile,
        in_at=item.in_at,
        out_at=item.out_at,
        condominio_id=item.condominio_id,
    )


def _normalise_media_name(value: str | None) -> str | None:
    if not value:
        return None
    stripped = value.strip()
    return stripped or None


def _normalise_media_data(value: str | None) -> str | None:
    if not value:
        return None
    stripped = value.strip()
    if not stripped:
        return None

    match = DATA_URL_PATTERN.fullmatch(stripped)
    if not match:
        raise HTTPException(status_code=422, detail="Invalid extra_media_data")

    try:
        file_bytes = base64.b64decode(match.group("data"), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Invalid extra_media_data") from exc

    if not file_bytes:
        raise HTTPException(status_code=422, detail="Empty extra_media_data")
    if len(file_bytes) > MAX_MEDIA_BYTES:
        raise HTTPException(status_code=413, detail="extra_media_data is too large")
    return stripped


def _require_condominio(session: SessionDep, condominio_id: uuid.UUID) -> Condominio:
    condominio = session.get(Condominio, condominio_id)
    if not condominio:
        raise HTTPException(status_code=404, detail="Condominio not found")
    return condominio


def _require_building(
    session: SessionDep, condominio_id: uuid.UUID, building_id: uuid.UUID
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


@router.get("/", response_model=ContractorVisitsPublic)
def read_contractor_visits(
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
    ensure_contractor_visit_schema(session)

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    filters = [ContractorVisit.condominio_id == condominio_id]

    if search and search.strip():
        query = f"%{search.strip()}%"
        filters.append(
            or_(
                ContractorVisit.name.ilike(query),
                ContractorVisit.company.ilike(query),
                ContractorVisit.block.ilike(query),
                ContractorVisit.job_description.ilike(query),
            )
        )

    if date_from:
        filters.append(
            ContractorVisit.in_at
            >= datetime.combine(date_from, time.min).replace(tzinfo=timezone.utc)
        )
    if date_to:
        filters.append(
            ContractorVisit.in_at
            < datetime.combine(date_to + timedelta(days=1), time.min).replace(
                tzinfo=timezone.utc
            )
        )

    count_statement = select(func.count()).select_from(ContractorVisit)
    statement = select(ContractorVisit)
    for item_filter in filters:
        count_statement = count_statement.where(item_filter)
        statement = statement.where(item_filter)

    count = session.exec(count_statement).one()
    rows = session.exec(
        statement
        .order_by(ContractorVisit.in_at.desc())
        .offset(skip)
        .limit(limit)
    ).all()

    return ContractorVisitsPublic(
        data=[_contractor_visit_to_admin_public(item) for item in rows],
        count=count,
    )


@router.get("/buildings", response_model=ContractorAccessBuildingsPublic)
def read_contractor_access_buildings(
    session: SessionDep,
    condominio_id: uuid.UUID,
) -> Any:
    _require_condominio(session, condominio_id)

    rows = session.exec(
        select(Building)
        .where(Building.condominio_id == condominio_id)
        .order_by(Building.nome.asc())
    ).all()

    return ContractorAccessBuildingsPublic(
        data=[
            ContractorAccessBuildingPublic(
                id=item.id,
                name=item.nome,
            )
            for item in rows
        ],
        count=len(rows),
    )


@router.get("/open", response_model=ContractorOpenVisitsPublic)
def read_open_contractor_visits(
    session: SessionDep,
    condominio_id: uuid.UUID,
) -> Any:
    ensure_contractor_visit_schema(session)
    _require_condominio(session, condominio_id)

    count_statement = (
        select(func.count())
        .select_from(ContractorVisit)
        .where(
            ContractorVisit.condominio_id == condominio_id,
            col(ContractorVisit.out_at).is_(None),
        )
    )
    count = session.exec(count_statement).one()

    statement = (
        select(ContractorVisit)
        .where(
            ContractorVisit.condominio_id == condominio_id,
            col(ContractorVisit.out_at).is_(None),
        )
        .order_by(ContractorVisit.in_at.desc())
    )
    rows = session.exec(statement).all()

    return ContractorOpenVisitsPublic(
        data=[
            ContractorOpenVisitPublic(
                id=item.id,
                name=item.name,
                company=item.company,
                building_name=item.block,
                job_description=item.job_description,
                mobile=item.mobile,
                in_at=item.in_at,
            )
            for item in rows
        ],
        count=count,
    )


@router.post("/check-in", response_model=ContractorVisitPublic, status_code=201)
def create_contractor_visit(
    *,
    session: SessionDep,
    payload: ContractorVisitCheckInCreate,
) -> Any:
    ensure_contractor_visit_schema(session)
    _require_condominio(session, payload.condominio_id)
    building = _require_building(session, payload.condominio_id, payload.building_id)

    item = ContractorVisit(
        name=payload.name.strip(),
        company=payload.company.strip(),
        block=building.nome,
        job_description=payload.job_description.strip(),
        mobile=payload.mobile.strip(),
        condominio_id=payload.condominio_id,
    )
    session.add(item)
    session.commit()
    session.refresh(item)

    return _contractor_visit_to_public(item)


@router.post("/check-out", response_model=ContractorVisitPublic, status_code=201)
def close_contractor_visit(
    *,
    session: SessionDep,
    payload: ContractorVisitCheckOutCreate,
) -> Any:
    ensure_contractor_visit_schema(session)
    _require_condominio(session, payload.condominio_id)

    item = session.get(ContractorVisit, payload.visit_id)
    if not item or item.condominio_id != payload.condominio_id:
        raise HTTPException(status_code=404, detail="Contractor visit not found")

    if item.out_at is not None:
        raise HTTPException(status_code=400, detail="Contractor already checked out")

    item.out_at = datetime.now(timezone.utc)
    session.add(item)
    session.commit()
    session.refresh(item)

    return _contractor_visit_to_public(item)


@router.patch("/{visit_id}/media", response_model=ContractorVisitAdminPublic)
def update_contractor_visit_media(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    visit_id: uuid.UUID,
    payload: ContractorVisitMediaUpdate,
) -> Any:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    ensure_contractor_visit_schema(session)

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    item = session.get(ContractorVisit, visit_id)
    if not item or item.condominio_id != condominio_id:
        raise HTTPException(status_code=404, detail="Contractor visit not found")

    if (
        "extra_media_data" in payload.model_fields_set
        or "extra_media_name" in payload.model_fields_set
    ):
        media_data = _normalise_media_data(payload.extra_media_data)
        item.extra_media_data = media_data
        item.extra_media_name = (
            _normalise_media_name(payload.extra_media_name) if media_data else None
        )

    session.add(item)
    session.commit()
    session.refresh(item)
    return _contractor_visit_to_admin_public(item)
