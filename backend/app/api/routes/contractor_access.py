import base64
import binascii
import logging
import re
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import or_
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.core.db import ensure_contractor_history_schema, ensure_contractor_visit_schema
from app.models import (
    Building,
    Condominio,
    ContractorHistoryExecutionSummary,
    ContractorHistoriesPublic,
    ContractorHistory,
    ContractorHistoryCategoriesPublic,
    ContractorHistoryCategory,
    ContractorHistoryCategoryCreate,
    ContractorHistoryCategoryPublic,
    ContractorHistoryPublic,
    ContractorHistoryUpsert,
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
    Flat,
    Morador,
    User,
)
from app.utils import send_sms_notification

router = APIRouter(prefix="/contractor-access", tags=["contractor-access"])
logger = logging.getLogger(__name__)
DATA_URL_PATTERN = re.compile(
    r"^data:(?P<mime>[-\w.+/]+/[-\w.+]+)?;base64,(?P<data>[A-Za-z0-9+/=\s]+)$"
)
E164_PHONE_REGEX = re.compile(r"^\+[1-9]\d{8,19}$")
MAX_MEDIA_BYTES = 10 * 1024 * 1024
TEMPORARY_CONTRACTOR_DOOR_CODES = {
    "Merlin": "CZ1247",
    "Northwood": "CX1249",
    "Oak": "Back Door: CY1285\nBoiler: CZ9612YX",
    "Oak Lodge": "Back Door: CY1285\nBoiler: CZ9612YX",
}
NEXT_INTERVAL_UNITS = {"week", "month"}
CONTRACTOR_MEDIA_FIELDS = (
    ("extra_media_name", "extra_media_data"),
    ("extra_media_2_name", "extra_media_2_data"),
    ("extra_media_3_name", "extra_media_3_data"),
    ("extra_media_4_name", "extra_media_4_data"),
)


def _is_manager(user: User) -> bool:
    return bool(user.is_superuser or user.cargo >= 2)


def _require_manager_condominio(
    session: SessionDep, current_user: User
) -> uuid.UUID:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")
    return condominio_id


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
        extra_media_2_name=item.extra_media_2_name,
        extra_media_2_data=item.extra_media_2_data,
        extra_media_3_name=item.extra_media_3_name,
        extra_media_3_data=item.extra_media_3_data,
        extra_media_4_name=item.extra_media_4_name,
        extra_media_4_data=item.extra_media_4_data,
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


def _normalise_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


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


def _apply_contractor_visit_media_updates(
    item: ContractorVisit,
    payload: ContractorVisitMediaUpdate,
) -> None:
    for name_field, data_field in CONTRACTOR_MEDIA_FIELDS:
        if data_field in payload.model_fields_set:
            media_data = _normalise_media_data(data_field, getattr(payload, data_field))
            setattr(item, data_field, media_data)
            if not media_data:
                setattr(item, name_field, None)
        if name_field in payload.model_fields_set:
            media_data = getattr(item, data_field)
            setattr(
                item,
                name_field,
                _normalise_media_name(getattr(payload, name_field))
                if media_data
                else None,
            )


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


def _require_contractor_visit_for_condominio(
    session: SessionDep, condominio_id: uuid.UUID, visit_id: uuid.UUID
) -> ContractorVisit:
    item = session.get(ContractorVisit, visit_id)
    if not item or item.condominio_id != condominio_id:
        raise HTTPException(status_code=404, detail="Contractor visit not found")
    return item


def _require_contractor_history_category(
    session: SessionDep, condominio_id: uuid.UUID, category_id: uuid.UUID
) -> ContractorHistoryCategory:
    item = session.get(ContractorHistoryCategory, category_id)
    if not item or item.condominio_id != condominio_id:
        raise HTTPException(
            status_code=404, detail="Contractor history category not found"
        )
    return item


def _contractor_history_to_public(
    history: ContractorHistory,
    visit: ContractorVisit,
    category: ContractorHistoryCategory,
) -> ContractorHistoryPublic:
    return ContractorHistoryPublic(
        id=history.id,
        category_id=category.id,
        category_name=category.name,
        contractor_visit_id=visit.id,
        created_new_visit=history.created_new_visit,
        next_enabled=history.next_enabled,
        next_interval_unit=history.next_interval_unit,
        next_interval_value=history.next_interval_value,
        next_job_at=history.next_job_at,
        next_notify_at=history.next_notify_at,
        next_notification_sent_at=history.next_notification_sent_at,
        name=visit.name,
        company=visit.company,
        building_name=visit.block,
        job_description=visit.job_description,
        mobile=visit.mobile,
        visit_in_at=visit.in_at,
        visit_out_at=visit.out_at,
        history_created_at=history.created_at,
        history_updated_at=history.updated_at,
        condominio_id=history.condominio_id,
    )


def _normalize_phone_to_e164(
    raw_phone: str | None, default_country_code: str = "+44"
) -> str | None:
    if raw_phone is None:
        return None
    cleaned = str(raw_phone).strip()
    cleaned = re.sub(r"[^\d+]", "", cleaned)
    if not cleaned:
        return None

    normalized = cleaned
    if normalized.startswith("00"):
        normalized = f"+{normalized[2:]}"
    elif not normalized.startswith("+"):
        digits_only = re.sub(r"\D", "", normalized)
        country_digits = re.sub(r"\D", "", default_country_code) or "44"
        if digits_only.startswith(country_digits):
            normalized = f"+{digits_only}"
        else:
            if digits_only.startswith("0"):
                digits_only = digits_only[1:]
            normalized = f"+{country_digits}{digits_only}"

    return normalized if E164_PHONE_REGEX.fullmatch(normalized) else None


def _add_months(value: datetime, months: int) -> datetime:
    total_months = (value.year * 12 + (value.month - 1)) + months
    year = total_months // 12
    month = total_months % 12 + 1
    month_lengths = [
        31,
        29
        if (year % 4 == 0 and year % 100 != 0) or (year % 400 == 0)
        else 28,
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ]
    day = min(value.day, month_lengths[month - 1])
    return value.replace(year=year, month=month, day=day)


def _build_next_schedule(
    *,
    base_at: datetime,
    next_enabled: bool,
    next_interval_unit: str | None,
    next_interval_value: int | None,
) -> tuple[datetime | None, datetime | None]:
    if not next_enabled:
        return None, None

    unit = (next_interval_unit or "").strip().lower()
    if unit not in NEXT_INTERVAL_UNITS:
        raise HTTPException(status_code=422, detail="Invalid next interval unit")
    if next_interval_value is None or next_interval_value < 1:
        raise HTTPException(status_code=422, detail="Invalid next interval value")

    if unit == "week":
        next_job_at = base_at + timedelta(weeks=next_interval_value)
        next_notify_at = next_job_at - timedelta(days=2)
        return next_job_at, next_notify_at

    next_job_at = _add_months(base_at, next_interval_value)
    next_notify_at = next_job_at - timedelta(days=7)
    return next_job_at, next_notify_at


def _resolve_history_notification_recipient_phone(
    session: SessionDep, condominio_id: uuid.UUID
) -> str | None:
    recipient = session.exec(
        select(Morador)
        .join(Flat, Flat.id == Morador.flat_id)
        .join(Building, Building.id == Flat.building_id)
        .where(
            Morador.cargo == 0,
            Building.condominio_id == condominio_id,
            Building.nome == "Martlett",
            or_(Flat.numero == 6, Flat.label == "6"),
        )
        .order_by(Morador.nome.asc())
    ).first()
    if not recipient:
        return None
    return _normalize_phone_to_e164(recipient.mobile)


def _build_history_next_sms_message(
    history: ContractorHistory,
    visit: ContractorVisit,
    category: ContractorHistoryCategory,
) -> str:
    next_date_str = (
        history.next_job_at.astimezone(timezone.utc).strftime("%d/%m/%Y %H:%M")
        if history.next_job_at
        else "unknown date"
    )
    return (
        f"OakHill Park: next contractor job scheduled for {next_date_str}. "
        f"Contractor: {visit.name}. Company: {visit.company}. "
        f"Job: {visit.job_description}. Building: {visit.block}. "
        f"Category: {category.name}."
    )


def _apply_history_next_schedule(
    history: ContractorHistory,
    *,
    visit: ContractorVisit,
    payload: ContractorHistoryUpsert,
) -> ContractorHistory:
    base_at = visit.out_at or visit.in_at
    normalized_unit = (
        payload.next_interval_unit.strip().lower()
        if payload.next_enabled and payload.next_interval_unit
        else None
    )
    normalized_value = payload.next_interval_value if payload.next_enabled else None
    next_job_at, next_notify_at = _build_next_schedule(
        base_at=base_at,
        next_enabled=payload.next_enabled,
        next_interval_unit=normalized_unit,
        next_interval_value=normalized_value,
    )
    should_reset_notification = (
        not payload.next_enabled
        or history.next_enabled != payload.next_enabled
        or history.next_interval_unit != normalized_unit
        or history.next_interval_value != normalized_value
        or history.next_job_at != next_job_at
        or history.next_notify_at != next_notify_at
    )

    history.next_enabled = payload.next_enabled
    history.next_interval_unit = normalized_unit
    history.next_interval_value = normalized_value
    history.next_job_at = next_job_at
    history.next_notify_at = next_notify_at
    if should_reset_notification:
        history.next_notification_sent_at = None
    return history


def _validate_history_visit_window(
    in_at: datetime | None, out_at: datetime | None
) -> tuple[datetime, datetime]:
    if in_at is None or out_at is None:
        raise HTTPException(
            status_code=422,
            detail="Contractor history with new visit requires in_at and out_at",
        )

    normalized_in_at = (
        in_at.replace(tzinfo=timezone.utc) if in_at.tzinfo is None else in_at
    ).astimezone(timezone.utc)
    normalized_out_at = (
        out_at.replace(tzinfo=timezone.utc) if out_at.tzinfo is None else out_at
    ).astimezone(timezone.utc)

    if normalized_out_at < normalized_in_at:
        raise HTTPException(
            status_code=422,
            detail="Contractor history out_at must be after in_at",
        )
    return normalized_in_at, normalized_out_at


def _create_manual_contractor_visit_from_history(
    session: SessionDep,
    condominio_id: uuid.UUID,
    payload: ContractorHistoryUpsert,
) -> ContractorVisit:
    name = _normalise_text(payload.name)
    company = _normalise_text(payload.company)
    job_description = _normalise_text(payload.job_description)
    mobile = _normalise_text(payload.mobile)

    if not all([name, company, payload.building_id, job_description, mobile]):
        raise HTTPException(
            status_code=422,
            detail=(
                "Contractor history with new visit requires name, company, "
                "building_id, job_description and mobile"
            ),
        )

    in_at, out_at = _validate_history_visit_window(payload.in_at, payload.out_at)
    building = _require_building(session, condominio_id, payload.building_id)

    visit = ContractorVisit(
        name=name,
        company=company,
        block=building.nome,
        job_description=job_description,
        mobile=mobile,
        in_at=in_at,
        out_at=out_at,
        condominio_id=condominio_id,
    )
    session.add(visit)
    session.flush()
    return visit


def _update_manual_contractor_visit_from_history(
    session: SessionDep,
    condominio_id: uuid.UUID,
    visit: ContractorVisit,
    payload: ContractorHistoryUpsert,
) -> ContractorVisit:
    name = _normalise_text(payload.name)
    company = _normalise_text(payload.company)
    job_description = _normalise_text(payload.job_description)
    mobile = _normalise_text(payload.mobile)

    if not all([name, company, payload.building_id, job_description, mobile]):
        raise HTTPException(
            status_code=422,
            detail=(
                "Contractor history with new visit requires name, company, "
                "building_id, job_description and mobile"
            ),
        )

    in_at, out_at = _validate_history_visit_window(payload.in_at, payload.out_at)
    building = _require_building(session, condominio_id, payload.building_id)

    visit.name = name
    visit.company = company
    visit.block = building.nome
    visit.job_description = job_description
    visit.mobile = mobile
    visit.in_at = in_at
    visit.out_at = out_at
    session.add(visit)
    session.flush()
    return visit


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


@router.get("/history/categories", response_model=ContractorHistoryCategoriesPublic)
def read_contractor_history_categories(
    session: SessionDep,
    current_user: CurrentUser,
) -> ContractorHistoryCategoriesPublic:
    ensure_contractor_visit_schema(session)
    ensure_contractor_history_schema(session)
    condominio_id = _require_manager_condominio(session, current_user)

    rows = session.exec(
        select(ContractorHistoryCategory)
        .where(ContractorHistoryCategory.condominio_id == condominio_id)
        .order_by(ContractorHistoryCategory.name.asc())
    ).all()

    return ContractorHistoryCategoriesPublic(
        data=[
            ContractorHistoryCategoryPublic(
                id=item.id,
                name=item.name,
                created_at=item.created_at,
                updated_at=item.updated_at,
            )
            for item in rows
        ],
        count=len(rows),
    )


@router.post(
    "/history/categories",
    response_model=ContractorHistoryCategoryPublic,
    status_code=201,
)
def create_contractor_history_category(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: ContractorHistoryCategoryCreate,
) -> ContractorHistoryCategoryPublic:
    ensure_contractor_visit_schema(session)
    ensure_contractor_history_schema(session)
    condominio_id = _require_manager_condominio(session, current_user)

    category_name = _normalise_text(payload.name)
    if not category_name:
        raise HTTPException(status_code=422, detail="Category name is required")

    normalized_name = _normalise_building_name(category_name)
    existing = session.exec(
        select(ContractorHistoryCategory).where(
            ContractorHistoryCategory.condominio_id == condominio_id
        )
    ).all()
    if any(_normalise_building_name(item.name) == normalized_name for item in existing):
        raise HTTPException(
            status_code=400,
            detail="Contractor history category already exists",
        )

    item = ContractorHistoryCategory(
        name=category_name,
        condominio_id=condominio_id,
    )
    session.add(item)
    session.commit()
    session.refresh(item)

    return ContractorHistoryCategoryPublic(
        id=item.id,
        name=item.name,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.get("/history", response_model=ContractorHistoriesPublic)
def read_contractor_histories(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    search: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    building_name: str | None = None,
    category_id: uuid.UUID | None = None,
) -> ContractorHistoriesPublic:
    ensure_contractor_visit_schema(session)
    ensure_contractor_history_schema(session)
    condominio_id = _require_manager_condominio(session, current_user)

    filters = [ContractorHistory.condominio_id == condominio_id]

    trimmed_search = _normalise_text(search)
    if trimmed_search:
        query = f"%{trimmed_search}%"
        filters.append(
            or_(
                ContractorVisit.name.ilike(query),
                ContractorVisit.company.ilike(query),
                ContractorVisit.job_description.ilike(query),
            )
        )

    trimmed_building_name = _normalise_text(building_name)
    if trimmed_building_name:
        filters.append(ContractorVisit.block == trimmed_building_name)

    if category_id:
        filters.append(ContractorHistory.category_id == category_id)

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

    count_statement = (
        select(func.count())
        .select_from(ContractorHistory)
        .join(
            ContractorVisit,
            ContractorVisit.id == ContractorHistory.contractor_visit_id,
        )
        .join(
            ContractorHistoryCategory,
            ContractorHistoryCategory.id == ContractorHistory.category_id,
        )
    )
    statement = (
        select(ContractorHistory, ContractorVisit, ContractorHistoryCategory)
        .join(
            ContractorVisit,
            ContractorVisit.id == ContractorHistory.contractor_visit_id,
        )
        .join(
            ContractorHistoryCategory,
            ContractorHistoryCategory.id == ContractorHistory.category_id,
        )
    )
    for item_filter in filters:
        count_statement = count_statement.where(item_filter)
        statement = statement.where(item_filter)

    count = session.exec(count_statement).one()
    rows = session.exec(
        statement.order_by(ContractorHistory.created_at.desc()).offset(skip).limit(limit)
    ).all()

    return ContractorHistoriesPublic(
        data=[
            _contractor_history_to_public(history, visit, category)
            for history, visit, category in rows
        ],
        count=count,
    )


@router.post("/history", response_model=ContractorHistoryPublic, status_code=201)
def create_contractor_history(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: ContractorHistoryUpsert,
) -> ContractorHistoryPublic:
    ensure_contractor_visit_schema(session)
    ensure_contractor_history_schema(session)
    condominio_id = _require_manager_condominio(session, current_user)

    category = _require_contractor_history_category(
        session, condominio_id, payload.category_id
    )

    if payload.created_new_visit:
        visit = _create_manual_contractor_visit_from_history(
            session, condominio_id, payload
        )
    else:
        if payload.contractor_visit_id is None:
            raise HTTPException(
                status_code=422,
                detail="contractor_visit_id is required when new visit is disabled",
            )
        visit = _require_contractor_visit_for_condominio(
            session, condominio_id, payload.contractor_visit_id
        )

    history = ContractorHistory(
        condominio_id=condominio_id,
        contractor_visit_id=visit.id,
        category_id=category.id,
        created_new_visit=payload.created_new_visit,
    )
    history = _apply_history_next_schedule(history, visit=visit, payload=payload)
    session.add(history)
    session.commit()
    session.refresh(history)
    session.refresh(visit)
    session.refresh(category)

    return _contractor_history_to_public(history, visit, category)


@router.patch("/history/{history_id}", response_model=ContractorHistoryPublic)
def update_contractor_history(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    history_id: uuid.UUID,
    payload: ContractorHistoryUpsert,
) -> ContractorHistoryPublic:
    ensure_contractor_visit_schema(session)
    ensure_contractor_history_schema(session)
    condominio_id = _require_manager_condominio(session, current_user)

    history = session.get(ContractorHistory, history_id)
    if not history or history.condominio_id != condominio_id:
        raise HTTPException(status_code=404, detail="Contractor history not found")

    category = _require_contractor_history_category(
        session, condominio_id, payload.category_id
    )

    if payload.created_new_visit:
        if history.created_new_visit:
            visit = _require_contractor_visit_for_condominio(
                session, condominio_id, history.contractor_visit_id
            )
            visit = _update_manual_contractor_visit_from_history(
                session, condominio_id, visit, payload
            )
        else:
            visit = _create_manual_contractor_visit_from_history(
                session, condominio_id, payload
            )
            history.contractor_visit_id = visit.id
        history.created_new_visit = True
    else:
        if payload.contractor_visit_id is None:
            raise HTTPException(
                status_code=422,
                detail="contractor_visit_id is required when new visit is disabled",
            )
        visit = _require_contractor_visit_for_condominio(
            session, condominio_id, payload.contractor_visit_id
        )
        history.contractor_visit_id = visit.id
        history.created_new_visit = False

    history.category_id = category.id
    history = _apply_history_next_schedule(history, visit=visit, payload=payload)
    history.updated_at = datetime.now(timezone.utc)
    session.add(history)
    session.commit()
    session.refresh(history)
    session.refresh(visit)
    session.refresh(category)

    return _contractor_history_to_public(history, visit, category)


@router.delete("/history/{history_id}")
def delete_contractor_history(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    history_id: uuid.UUID,
) -> dict[str, str]:
    ensure_contractor_visit_schema(session)
    ensure_contractor_history_schema(session)
    condominio_id = _require_manager_condominio(session, current_user)

    history = session.get(ContractorHistory, history_id)
    if not history or history.condominio_id != condominio_id:
        raise HTTPException(status_code=404, detail="Contractor history not found")

    session.delete(history)
    session.commit()
    return {"message": "Contractor history deleted successfully"}


@router.post(
    "/history/execute-due",
    response_model=ContractorHistoryExecutionSummary,
)
def execute_due_contractor_history_notifications(
    *,
    session: SessionDep,
    current_user: CurrentUser,
) -> ContractorHistoryExecutionSummary:
    ensure_contractor_visit_schema(session)
    ensure_contractor_history_schema(session)
    condominio_id = _require_manager_condominio(session, current_user)

    now = datetime.now(timezone.utc)
    due_rows = session.exec(
        select(ContractorHistory, ContractorVisit, ContractorHistoryCategory)
        .join(
            ContractorVisit,
            ContractorVisit.id == ContractorHistory.contractor_visit_id,
        )
        .join(
            ContractorHistoryCategory,
            ContractorHistoryCategory.id == ContractorHistory.category_id,
        )
        .where(
            ContractorHistory.condominio_id == condominio_id,
            ContractorHistory.next_enabled,
            ContractorHistory.next_notify_at.is_not(None),
            ContractorHistory.next_notify_at <= now,
            ContractorHistory.next_notification_sent_at.is_(None),
        )
        .order_by(ContractorHistory.next_notify_at.asc())
    ).all()

    checked = len(due_rows)
    triggered = 0
    sms_sent = 0
    recipient_phone = _resolve_history_notification_recipient_phone(session, condominio_id)

    for history, visit, category in due_rows:
        if not recipient_phone:
            continue

        try:
            send_sms_notification(
                phone_to=recipient_phone,
                body=_build_history_next_sms_message(history, visit, category),
            )
        except Exception:
            logger.exception(
                "Failed to send contractor history next-job SMS",
                extra={
                    "history_id": str(history.id),
                    "contractor_visit_id": str(visit.id),
                },
            )
            continue

        history.next_notification_sent_at = now
        history.updated_at = now
        session.add(history)
        sms_sent += 1
        triggered += 1

    if triggered > 0:
        session.commit()

    return ContractorHistoryExecutionSummary(
        checked=checked,
        triggered=triggered,
        sms_sent=sms_sent,
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

    _apply_contractor_visit_media_updates(item, payload)

    session.add(item)
    session.commit()
    session.refresh(item)
    return _contractor_visit_to_admin_public(item)
