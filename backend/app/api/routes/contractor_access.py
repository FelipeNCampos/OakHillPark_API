import base64
import binascii
import logging
import re
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from sqlalchemy import or_
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.core.db import (
    ensure_contractor_history_schema,
    ensure_contractor_maintenance_schema,
    ensure_contractor_visit_schema,
)
from app.models import (
    Building,
    Condominio,
    ContractorAccessBuildingPublic,
    ContractorAccessBuildingsPublic,
    ContractorHistoriesPublic,
    ContractorHistory,
    ContractorHistoryCategoriesPublic,
    ContractorHistoryCategory,
    ContractorHistoryCategoryCreate,
    ContractorHistoryCategoryPublic,
    ContractorHistoryExecutionSummary,
    ContractorHistoryPublic,
    ContractorHistoryUpsert,
    ContractorMaintenance,
    ContractorMaintenanceCategoriesPublic,
    ContractorMaintenanceCategory,
    ContractorMaintenanceCategoryCreate,
    ContractorMaintenanceCategoryPublic,
    ContractorMaintenanceCreate,
    ContractorMaintenanceFilter,
    ContractorMaintenanceFilterCreate,
    ContractorMaintenanceFilterPublic,
    ContractorMaintenancePublic,
    ContractorMaintenanceRecord,
    ContractorMaintenanceRecordCreate,
    ContractorMaintenanceRecordPublic,
    ContractorMaintenanceRecordsPublic,
    ContractorMaintenancesPublic,
    ContractorMaintenanceUpdate,
    ContractorOpenVisitPublic,
    ContractorOpenVisitsPublic,
    ContractorVisit,
    ContractorVisitAdminPublic,
    ContractorVisitCheckInCreate,
    ContractorVisitCheckOutCreate,
    ContractorVisitMediaUpdate,
    ContractorVisitPublic,
    ContractorVisitsPublic,
    ContractorVisitUpdate,
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
CONTRACTOR_ACCESS_BUILDING_ORDER = (
    "Falcon",
    "Martlett",
    "Merlin",
    "Oak Lodge",
    "Northwood",
    "Estate OHP",
)
CONTRACTOR_ACCESS_BUILDING_ORDER_BY_NORMALISED_NAME = {
    " ".join(name.casefold().split()): position
    for position, name in enumerate(CONTRACTOR_ACCESS_BUILDING_ORDER)
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


def _is_visible_contractor_access_building(building_name: str) -> bool:
    return (
        _normalise_building_name(building_name)
        in CONTRACTOR_ACCESS_BUILDING_ORDER_BY_NORMALISED_NAME
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


def _require_contractor_maintenance_category(
    session: SessionDep, condominio_id: uuid.UUID, category_id: uuid.UUID
) -> ContractorMaintenanceCategory:
    item = session.get(ContractorMaintenanceCategory, category_id)
    if not item or item.condominio_id != condominio_id:
        raise HTTPException(
            status_code=404, detail="Contractor maintenance category not found"
        )
    return item


def _require_contractor_maintenance(
    session: SessionDep, condominio_id: uuid.UUID, maintenance_id: uuid.UUID
) -> ContractorMaintenance:
    item = session.get(ContractorMaintenance, maintenance_id)
    if not item or item.condominio_id != condominio_id:
        raise HTTPException(status_code=404, detail="Contractor maintenance not found")
    return item


def _normalise_maintenance_filter_value(field: str, value: str | None) -> str | None:
    normalised_value = _normalise_text(value)
    if not normalised_value:
        return None
    if field == "mobile":
        return _normalize_phone_to_e164(normalised_value)
    return " ".join(normalised_value.casefold().split())


def _get_contractor_maintenance_filters(
    session: SessionDep, maintenance_id: uuid.UUID
) -> list[ContractorMaintenanceFilter]:
    return session.exec(
        select(ContractorMaintenanceFilter)
        .where(ContractorMaintenanceFilter.maintenance_id == maintenance_id)
        .order_by(ContractorMaintenanceFilter.field.asc())
    ).all()


def _contractor_maintenance_matches_visit(
    maintenance: ContractorMaintenance,
    filters: list[ContractorMaintenanceFilter],
    visit: ContractorVisit,
) -> bool:
    if not filters:
        return bool(
            maintenance.mobile
            and _normalise_maintenance_filter_value("mobile", maintenance.mobile)
            == _normalise_maintenance_filter_value("mobile", visit.mobile)
        )

    visit_values = {
        "company": visit.company,
        "job_description": visit.job_description,
        "mobile": visit.mobile,
        "name": visit.name,
    }
    for maintenance_filter in filters:
        visit_value = visit_values.get(maintenance_filter.field)
        expected_value = _normalise_maintenance_filter_value(
            maintenance_filter.field, maintenance_filter.value
        )
        if (
            not visit_value
            or not expected_value
            or _normalise_maintenance_filter_value(
                maintenance_filter.field, visit_value
            )
            != expected_value
        ):
            return False
    return True


def _validated_contractor_maintenance_filters(
    payload_filters: list[ContractorMaintenanceFilterCreate],
    legacy_mobile: str | None,
) -> list[tuple[str, str]]:
    filters: list[tuple[str, str]] = []
    fields: set[str] = set()
    for maintenance_filter in payload_filters:
        field = maintenance_filter.field
        value = _normalise_text(maintenance_filter.value)
        if not value:
            raise HTTPException(status_code=422, detail="Maintenance filter value is required")
        if not _normalise_maintenance_filter_value(field, value):
            raise HTTPException(
                status_code=422,
                detail=f"Invalid maintenance filter value for {field}",
            )
        if field in fields:
            raise HTTPException(
                status_code=422,
                detail=f"Only one {field} maintenance filter is allowed",
            )
        fields.add(field)
        filters.append((field, value))

    if legacy_mobile:
        if not _normalise_maintenance_filter_value("mobile", legacy_mobile):
            raise HTTPException(
                status_code=422,
                detail="Invalid maintenance filter value for mobile",
            )
        if "mobile" in fields:
            raise HTTPException(
                status_code=422,
                detail="Use either mobile or a mobile maintenance filter, not both",
            )
        filters.append(("mobile", legacy_mobile))

    return filters


def _validated_contractor_maintenance_frequency(
    payload: ContractorMaintenanceCreate,
) -> tuple[int, Literal["days", "months"]]:
    if payload.frequency_value is None:
        if payload.frequency_unit is not None or payload.frequency_days is None:
            raise HTTPException(
                status_code=422,
                detail="Frequency value and unit are required",
            )
        return payload.frequency_days, "days"

    if payload.frequency_unit is None:
        raise HTTPException(
            status_code=422,
            detail="Frequency value and unit are required",
        )
    return payload.frequency_value, payload.frequency_unit


def _as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def _maintenance_due_at(
    last_completed_at: datetime, frequency_value: int, frequency_unit: str
) -> datetime:
    completed_at = _as_utc(last_completed_at)
    if frequency_unit == "days":
        return completed_at + timedelta(days=frequency_value)
    return _add_months(completed_at, frequency_value)


def _is_contractor_maintenance_overdue(
    last_completed_at: datetime | None, frequency_value: int, frequency_unit: str
) -> bool:
    if last_completed_at is None:
        return False
    return _maintenance_due_at(
        last_completed_at, frequency_value, frequency_unit
    ) < datetime.now(timezone.utc)


def _contractor_maintenance_status(
    last_completed_at: datetime | None, frequency_value: int, frequency_unit: str
) -> Literal["pending", "soon", "ok"]:
    if last_completed_at is None:
        return "pending"
    due_at = _maintenance_due_at(
        last_completed_at, frequency_value, frequency_unit
    )
    now = datetime.now(timezone.utc)
    if due_at < now:
        return "pending"
    if due_at <= now + timedelta(days=7):
        return "soon"
    return "ok"


def _contractor_maintenance_to_public(
    session: SessionDep,
    maintenance: ContractorMaintenance,
    category: ContractorMaintenanceCategory,
) -> ContractorMaintenancePublic:
    filters = _get_contractor_maintenance_filters(session, maintenance.id)
    record_last_completed_at = session.exec(
        select(ContractorMaintenanceRecord.out_at)
        .where(
            ContractorMaintenanceRecord.maintenance_id == maintenance.id,
            ContractorMaintenanceRecord.out_at.is_not(None),
        )
        .order_by(ContractorMaintenanceRecord.out_at.desc())
        .limit(1)
    ).first()
    last_completed_at = maintenance.last_completed_at
    if record_last_completed_at and (
        last_completed_at is None
        or _as_utc(record_last_completed_at) > _as_utc(last_completed_at)
    ):
        last_completed_at = record_last_completed_at
    frequency_unit: Literal["days", "months"] = (
        maintenance.frequency_unit
        if maintenance.frequency_unit in {"days", "months"}
        else "days"
    )
    next_due_at = (
        _maintenance_due_at(
            last_completed_at,
            maintenance.frequency_value,
            frequency_unit,
        )
        if last_completed_at
        else None
    )
    return ContractorMaintenancePublic(
        id=maintenance.id,
        category_id=category.id,
        category_name=category.name,
        tag=maintenance.tag,
        report=maintenance.report,
        frequency_value=maintenance.frequency_value,
        frequency_unit=frequency_unit,
        frequency_days=(
            maintenance.frequency_value
            if maintenance.frequency_unit == "days"
            else None
        ),
        notes=maintenance.notes,
        filters=[
            ContractorMaintenanceFilterPublic(
                field=item.field,
                value=item.value,
            )
            for item in filters
        ],
        mobile=maintenance.mobile,
        last_completed_at=last_completed_at,
        next_due_at=next_due_at,
        is_overdue=_is_contractor_maintenance_overdue(
            last_completed_at,
            maintenance.frequency_value,
            frequency_unit,
        ),
        status=_contractor_maintenance_status(
            last_completed_at,
            maintenance.frequency_value,
            frequency_unit,
        ),
        created_at=maintenance.created_at,
        updated_at=maintenance.updated_at,
    )


def _contractor_maintenance_record_to_public(
    record: ContractorMaintenanceRecord,
    maintenance: ContractorMaintenance,
    category: ContractorMaintenanceCategory,
    visit: ContractorVisit,
) -> ContractorMaintenanceRecordPublic:
    return ContractorMaintenanceRecordPublic(
        id=record.id,
        maintenance_id=maintenance.id,
        category_name=category.name,
        tag=maintenance.tag,
        report=maintenance.report,
        contractor_visit_id=visit.id,
        contractor_name=visit.name,
        contractor_mobile=visit.mobile,
        in_at=record.in_at,
        out_at=record.out_at,
    )


def _create_maintenance_records_for_contractor_visit(
    session: SessionDep, visit: ContractorVisit
) -> None:
    maintenances = session.exec(
        select(ContractorMaintenance).where(
            ContractorMaintenance.condominio_id == visit.condominio_id,
        )
    ).all()
    for maintenance in maintenances:
        filters = _get_contractor_maintenance_filters(session, maintenance.id)
        if not _contractor_maintenance_matches_visit(maintenance, filters, visit):
            continue
        existing = session.exec(
            select(ContractorMaintenanceRecord).where(
                ContractorMaintenanceRecord.maintenance_id == maintenance.id,
                ContractorMaintenanceRecord.contractor_visit_id == visit.id,
            )
        ).first()
        if existing:
            continue
        session.add(
            ContractorMaintenanceRecord(
                condominio_id=visit.condominio_id,
                maintenance_id=maintenance.id,
                contractor_visit_id=visit.id,
                in_at=visit.in_at,
                out_at=visit.out_at,
            )
        )


def _complete_maintenance_records_for_contractor_visit(
    session: SessionDep, visit: ContractorVisit
) -> None:
    records = session.exec(
        select(ContractorMaintenanceRecord).where(
            ContractorMaintenanceRecord.contractor_visit_id == visit.id,
            ContractorMaintenanceRecord.out_at.is_(None),
        )
    ).all()
    for record in records:
        record.out_at = visit.out_at
        session.add(record)


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


@router.get(
    "/maintenance/categories", response_model=ContractorMaintenanceCategoriesPublic
)
def read_contractor_maintenance_categories(
    session: SessionDep,
    current_user: CurrentUser,
) -> ContractorMaintenanceCategoriesPublic:
    ensure_contractor_visit_schema(session)
    ensure_contractor_maintenance_schema(session)
    condominio_id = _require_manager_condominio(session, current_user)
    rows = session.exec(
        select(ContractorMaintenanceCategory)
        .where(ContractorMaintenanceCategory.condominio_id == condominio_id)
        .order_by(ContractorMaintenanceCategory.name.asc())
    ).all()
    return ContractorMaintenanceCategoriesPublic(
        data=[
            ContractorMaintenanceCategoryPublic(
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
    "/maintenance/categories",
    response_model=ContractorMaintenanceCategoryPublic,
    status_code=201,
)
def create_contractor_maintenance_category(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: ContractorMaintenanceCategoryCreate,
) -> ContractorMaintenanceCategoryPublic:
    ensure_contractor_visit_schema(session)
    ensure_contractor_maintenance_schema(session)
    condominio_id = _require_manager_condominio(session, current_user)
    name = _normalise_text(payload.name)
    if not name:
        raise HTTPException(status_code=422, detail="Category name is required")

    existing = session.exec(
        select(ContractorMaintenanceCategory).where(
            ContractorMaintenanceCategory.condominio_id == condominio_id
        )
    ).all()
    if any(_normalise_building_name(item.name) == _normalise_building_name(name) for item in existing):
        raise HTTPException(status_code=400, detail="Maintenance category already exists")

    category = ContractorMaintenanceCategory(name=name, condominio_id=condominio_id)
    session.add(category)
    session.commit()
    session.refresh(category)
    return ContractorMaintenanceCategoryPublic(
        id=category.id,
        name=category.name,
        created_at=category.created_at,
        updated_at=category.updated_at,
    )


@router.post("/maintenance", response_model=ContractorMaintenancePublic, status_code=201)
def create_contractor_maintenance(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: ContractorMaintenanceCreate,
) -> ContractorMaintenancePublic:
    ensure_contractor_visit_schema(session)
    ensure_contractor_maintenance_schema(session)
    condominio_id = _require_manager_condominio(session, current_user)
    category = _require_contractor_maintenance_category(
        session, condominio_id, payload.category_id
    )
    tag = _normalise_text(payload.tag) or ""
    report = _normalise_text(payload.report)
    if not report:
        raise HTTPException(status_code=422, detail="Description is required")

    frequency_value, frequency_unit = _validated_contractor_maintenance_frequency(
        payload
    )

    mobile = _normalise_text(payload.mobile)
    filters = _validated_contractor_maintenance_filters(payload.filters, mobile)

    maintenance = ContractorMaintenance(
        category_id=category.id,
        condominio_id=condominio_id,
        tag=tag,
        report=report,
        frequency_days=frequency_value,
        frequency_value=frequency_value,
        frequency_unit=frequency_unit,
        notes=_normalise_text(payload.notes) or "",
        mobile=mobile,
        last_completed_at=payload.last_completed_at,
    )
    session.add(maintenance)
    for field, value in filters:
        session.add(
            ContractorMaintenanceFilter(
                maintenance_id=maintenance.id,
                field=field,
                value=value,
            )
        )
    session.commit()
    session.refresh(maintenance)
    return _contractor_maintenance_to_public(session, maintenance, category)


@router.put("/maintenance/{maintenance_id}", response_model=ContractorMaintenancePublic)
def update_contractor_maintenance(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    maintenance_id: uuid.UUID,
    payload: ContractorMaintenanceUpdate,
) -> ContractorMaintenancePublic:
    ensure_contractor_visit_schema(session)
    ensure_contractor_maintenance_schema(session)
    condominio_id = _require_manager_condominio(session, current_user)
    maintenance = _require_contractor_maintenance(
        session, condominio_id, maintenance_id
    )
    category = _require_contractor_maintenance_category(
        session, condominio_id, payload.category_id
    )
    report = _normalise_text(payload.report)
    if not report:
        raise HTTPException(status_code=422, detail="Description is required")

    frequency_value, frequency_unit = _validated_contractor_maintenance_frequency(
        payload
    )
    mobile = _normalise_text(payload.mobile)
    filters = _validated_contractor_maintenance_filters(payload.filters, mobile)

    maintenance.category_id = category.id
    maintenance.tag = _normalise_text(payload.tag) or ""
    maintenance.report = report
    maintenance.frequency_days = frequency_value
    maintenance.frequency_value = frequency_value
    maintenance.frequency_unit = frequency_unit
    maintenance.notes = _normalise_text(payload.notes) or ""
    maintenance.mobile = mobile
    maintenance.last_completed_at = payload.last_completed_at
    maintenance.updated_at = datetime.now(timezone.utc)

    for maintenance_filter in _get_contractor_maintenance_filters(
        session, maintenance.id
    ):
        session.delete(maintenance_filter)

    session.add(maintenance)
    session.flush()
    for field, value in filters:
        session.add(
            ContractorMaintenanceFilter(
                maintenance_id=maintenance.id,
                field=field,
                value=value,
            )
        )
    session.commit()
    session.refresh(maintenance)
    return _contractor_maintenance_to_public(session, maintenance, category)


@router.get("/maintenance/schedule", response_model=ContractorMaintenancesPublic)
def read_contractor_maintenance_schedule(
    session: SessionDep,
    current_user: CurrentUser,
) -> ContractorMaintenancesPublic:
    ensure_contractor_visit_schema(session)
    ensure_contractor_maintenance_schema(session)
    condominio_id = _require_manager_condominio(session, current_user)
    rows = session.exec(
        select(ContractorMaintenance, ContractorMaintenanceCategory)
        .join(
            ContractorMaintenanceCategory,
            ContractorMaintenanceCategory.id == ContractorMaintenance.category_id,
        )
        .where(ContractorMaintenance.condominio_id == condominio_id)
        .order_by(ContractorMaintenance.created_at.desc())
    ).all()
    return ContractorMaintenancesPublic(
        data=[
            _contractor_maintenance_to_public(session, maintenance, category)
            for maintenance, category in rows
        ],
        count=len(rows),
    )


@router.get("/maintenance/history", response_model=ContractorMaintenanceRecordsPublic)
def read_contractor_maintenance_history(
    session: SessionDep,
    current_user: CurrentUser,
    limit: int = 100,
) -> ContractorMaintenanceRecordsPublic:
    ensure_contractor_visit_schema(session)
    ensure_contractor_maintenance_schema(session)
    condominio_id = _require_manager_condominio(session, current_user)
    rows = session.exec(
        select(
            ContractorMaintenanceRecord,
            ContractorMaintenance,
            ContractorMaintenanceCategory,
            ContractorVisit,
        )
        .join(
            ContractorMaintenance,
            ContractorMaintenance.id == ContractorMaintenanceRecord.maintenance_id,
        )
        .join(
            ContractorMaintenanceCategory,
            ContractorMaintenanceCategory.id == ContractorMaintenance.category_id,
        )
        .join(
            ContractorVisit,
            ContractorVisit.id == ContractorMaintenanceRecord.contractor_visit_id,
        )
        .where(ContractorMaintenanceRecord.condominio_id == condominio_id)
        .order_by(ContractorMaintenanceRecord.in_at.desc())
        .limit(min(max(limit, 1), 500))
    ).all()
    return ContractorMaintenanceRecordsPublic(
        data=[
            _contractor_maintenance_record_to_public(
                record, maintenance, category, visit
            )
            for record, maintenance, category, visit in rows
        ],
        count=len(rows),
    )


@router.post(
    "/maintenance/records",
    response_model=ContractorMaintenanceRecordPublic,
    status_code=201,
)
def create_contractor_maintenance_record(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: ContractorMaintenanceRecordCreate,
) -> ContractorMaintenanceRecordPublic:
    ensure_contractor_visit_schema(session)
    ensure_contractor_maintenance_schema(session)
    condominio_id = _require_manager_condominio(session, current_user)
    maintenance = _require_contractor_maintenance(
        session, condominio_id, payload.maintenance_id
    )
    visit = _require_contractor_visit_for_condominio(
        session, condominio_id, payload.contractor_visit_id
    )
    existing = session.exec(
        select(ContractorMaintenanceRecord).where(
            ContractorMaintenanceRecord.maintenance_id == maintenance.id,
            ContractorMaintenanceRecord.contractor_visit_id == visit.id,
        )
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="This contractor visit is already linked to the maintenance",
        )
    category = _require_contractor_maintenance_category(
        session, condominio_id, maintenance.category_id
    )
    record = ContractorMaintenanceRecord(
        condominio_id=condominio_id,
        maintenance_id=maintenance.id,
        contractor_visit_id=visit.id,
        in_at=visit.in_at,
        out_at=visit.out_at,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return _contractor_maintenance_record_to_public(
        record, maintenance, category, visit
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
    visible_rows = [
        item for item in rows if _is_visible_contractor_access_building(item.nome)
    ]
    visible_rows.sort(
        key=lambda item: CONTRACTOR_ACCESS_BUILDING_ORDER_BY_NORMALISED_NAME[
            _normalise_building_name(item.nome)
        ]
    )

    return ContractorAccessBuildingsPublic(
        data=[
            ContractorAccessBuildingPublic(
                id=item.id,
                name=item.nome,
            )
            for item in visible_rows
        ],
        count=len(visible_rows),
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
    ensure_contractor_maintenance_schema(session)
    _require_condominio(session, payload.condominio_id)
    building = _require_building(session, payload.condominio_id, payload.building_id)
    check_in_at = payload.in_at or datetime.now(timezone.utc)

    item = ContractorVisit(
        name=payload.name.strip(),
        company=payload.company.strip(),
        block=building.nome,
        job_description=payload.job_description.strip(),
        mobile=payload.mobile.strip(),
        in_at=check_in_at,
        condominio_id=payload.condominio_id,
    )
    session.add(item)
    _create_maintenance_records_for_contractor_visit(session, item)
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
    ensure_contractor_maintenance_schema(session)
    _require_condominio(session, payload.condominio_id)

    item = session.get(ContractorVisit, payload.visit_id)
    if not item or item.condominio_id != payload.condominio_id:
        raise HTTPException(status_code=404, detail="Contractor visit not found")

    if item.out_at is not None:
        raise HTTPException(status_code=400, detail="Contractor already checked out")

    check_out_at = payload.out_at or datetime.now(timezone.utc)
    if check_out_at <= item.in_at:
        raise HTTPException(
            status_code=400,
            detail="Contractor check out must be after check in",
        )

    item.out_at = check_out_at
    session.add(item)
    _complete_maintenance_records_for_contractor_visit(session, item)
    session.commit()
    session.refresh(item)

    return _contractor_visit_to_public(item)


@router.patch("/{visit_id}", response_model=ContractorVisitAdminPublic)
def update_contractor_visit(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    visit_id: uuid.UUID,
    payload: ContractorVisitUpdate,
) -> ContractorVisitAdminPublic:
    ensure_contractor_visit_schema(session)
    ensure_contractor_maintenance_schema(session)
    condominio_id = _require_manager_condominio(session, current_user)
    item = _require_contractor_visit_for_condominio(session, condominio_id, visit_id)

    fields_to_update = payload.model_fields_set
    if not fields_to_update:
        raise HTTPException(status_code=422, detail="No fields to update")

    for field_name in ("name", "company", "job_description", "mobile"):
        if field_name not in fields_to_update:
            continue
        value = _normalise_text(getattr(payload, field_name))
        if not value:
            raise HTTPException(status_code=422, detail=f"{field_name} is required")
        setattr(item, field_name, value)

    if "building_id" in fields_to_update:
        if payload.building_id is None:
            raise HTTPException(status_code=422, detail="building_id is required")
        item.block = _require_building(
            session, condominio_id, payload.building_id
        ).nome

    next_in_at = payload.in_at if "in_at" in fields_to_update else item.in_at
    next_out_at = payload.out_at if "out_at" in fields_to_update else item.out_at
    if next_in_at is None:
        raise HTTPException(status_code=422, detail="in_at is required")
    if next_out_at is not None and next_out_at <= next_in_at:
        raise HTTPException(
            status_code=422,
            detail="Contractor check out must be after check in",
        )
    item.in_at = next_in_at
    item.out_at = next_out_at
    session.add(item)

    maintenance_records = session.exec(
        select(ContractorMaintenanceRecord).where(
            ContractorMaintenanceRecord.contractor_visit_id == item.id
        )
    ).all()
    for record in maintenance_records:
        record.in_at = item.in_at
        record.out_at = item.out_at
        session.add(record)

    session.commit()
    session.refresh(item)
    return _contractor_visit_to_admin_public(item)


@router.delete("/{visit_id}")
def delete_contractor_visit(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    visit_id: uuid.UUID,
) -> dict[str, str]:
    ensure_contractor_visit_schema(session)
    ensure_contractor_maintenance_schema(session)
    condominio_id = _require_manager_condominio(session, current_user)
    item = _require_contractor_visit_for_condominio(session, condominio_id, visit_id)
    session.delete(item)
    session.commit()
    return {"message": "Contractor record deleted successfully"}


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
