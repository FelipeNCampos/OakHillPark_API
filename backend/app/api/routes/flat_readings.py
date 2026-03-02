import re
import uuid
from datetime import datetime, time, timedelta, timezone
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

from app.api.deps import SessionDep, require_cargo
from app.models import (
    Flat,
    FlatReading,
    FlatReadingCreate,
    FlatReadingPublic,
    FlatReadingsPublic,
    FlatReadingUpdate,
    Morador,
)
from app.utils import send_sms_notification

router = APIRouter(prefix="/flat_readings", tags=["flat_readings"])
logger = logging.getLogger(__name__)


def _normalize_phone_to_e164(raw_phone: str | None, default_country_code: str = "+55") -> str | None:
    if raw_phone is None:
        return None
    cleaned = str(raw_phone).strip()
    cleaned = re.sub(r"[^\d+]", "", cleaned)
    if not cleaned:
        return None

    normalized = cleaned
    if not normalized.startswith("+"):
        digits_only = re.sub(r"\D", "", normalized)
        country = re.sub(r"[^\d+]", "", default_country_code) or "+55"
        normalized = f"{country}{digits_only}"

    e164_regex = re.compile(r"^\+[1-9]\d{8,19}$")
    return normalized if e164_regex.fullmatch(normalized) else None


def _build_flat_readings_sms_message(
    *,
    flat_number: int | None,
    reading_date: datetime,
    normal_value: int | None,
    gas_value: int | None,
) -> str | None:
    # Notify only the utility types requested for the flow (normal/gas).
    if normal_value is None and gas_value is None:
        return None

    date_str = reading_date.astimezone(timezone.utc).strftime("%d/%m/%Y")
    flat_label = f"flat {flat_number}" if flat_number is not None else "flat"
    parts: list[str] = []
    if normal_value is not None:
        parts.append(f"Normal: {normal_value}")
    if gas_value is not None:
        parts.append(f"Gas: {gas_value}")
    values = " | ".join(parts)
    return (
        f"OakHill Park: reading update for {flat_label} on {date_str}. "
        f"{values}. Please keep this record."
    )


def _send_owner1_flat_reading_sms(session: SessionDep, flat_reading: FlatReading) -> None:
    # Flow applies only to normal/gas flat readings.
    if flat_reading.tipo not in (2, 4):
        return

    flat = session.get(Flat, flat_reading.flat_id)
    if not flat:
        return

    owner_1 = session.exec(
        select(Morador)
        .where(Morador.flat_id == flat_reading.flat_id, Morador.cargo == 0)
        .order_by(Morador.nome.asc())
        .limit(1)
    ).first()
    if not owner_1:
        return

    phone_to = _normalize_phone_to_e164(owner_1.mobile)
    if not phone_to:
        logger.info(
            "Skipping flat reading SMS because owner 1 has invalid phone format",
            extra={"flat_id": str(flat_reading.flat_id), "owner_id": str(owner_1.id)},
        )
        return

    reading_date_utc = flat_reading.data.astimezone(timezone.utc)
    day_start = datetime.combine(reading_date_utc.date(), time.min, tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)

    day_readings = session.exec(
        select(FlatReading)
        .where(
            FlatReading.flat_id == flat_reading.flat_id,
            FlatReading.data >= day_start,
            FlatReading.data < day_end,
            FlatReading.tipo.in_([2, 4]),
        )
        .order_by(FlatReading.data.desc())
    ).all()

    latest_normal: int | None = None
    latest_gas: int | None = None
    for reading in day_readings:
        if reading.tipo == 2 and latest_normal is None:
            latest_normal = reading.valor
        if reading.tipo == 4 and latest_gas is None:
            latest_gas = reading.valor
        if latest_normal is not None and latest_gas is not None:
            break

    has_normal_config = (flat.reading_types & 2) != 0
    has_gas_config = (flat.reading_types & 4) != 0
    has_both_types = has_normal_config and has_gas_config

    # If the flat tracks both utilities, wait until both readings are present
    # and send a single combined SMS.
    if has_both_types and (latest_normal is None or latest_gas is None):
        return

    message = _build_flat_readings_sms_message(
        flat_number=flat.numero if flat else None,
        reading_date=flat_reading.data,
        normal_value=latest_normal,
        gas_value=latest_gas,
    )
    if not message:
        return

    try:
        send_sms_notification(phone_to=phone_to, body=message)
    except Exception:
        # SMS failure should not block reading creation.
        logger.exception(
            "Failed to send flat reading SMS",
            extra={"flat_id": str(flat_reading.flat_id), "reading_id": str(flat_reading.id)},
        )


@router.get("/", response_model=FlatReadingsPublic, dependencies=[Depends(require_cargo(2))])
def read_flat_readings(session: SessionDep, skip: int = 0, limit: int = 100, flat_id: uuid.UUID | None = None) -> Any:
    count_statement = select(func.count()).select_from(FlatReading)
    statement = select(FlatReading).order_by(FlatReading.data.desc()).offset(skip).limit(limit)
    
    if flat_id:
        count_statement = count_statement.where(FlatReading.flat_id == flat_id)
        statement = statement.where(FlatReading.flat_id == flat_id)
    
    count = session.exec(count_statement).one()
    flat_readings = session.exec(statement).all()
    return FlatReadingsPublic(data=flat_readings, count=count)


@router.get("/{id}", response_model=FlatReadingPublic, dependencies=[Depends(require_cargo(2))])
def read_flat_reading(session: SessionDep, id: uuid.UUID) -> Any:
    flat_reading = session.get(FlatReading, id)
    if not flat_reading:
        raise HTTPException(status_code=404, detail="Flat reading not found")
    return flat_reading


@router.post("/", response_model=FlatReadingPublic, dependencies=[Depends(require_cargo(2))])
def create_flat_reading(*, session: SessionDep, flat_reading_in: FlatReadingCreate) -> Any:
    flat_reading = FlatReading.model_validate(flat_reading_in)
    session.add(flat_reading)
    session.commit()
    session.refresh(flat_reading)
    _send_owner1_flat_reading_sms(session, flat_reading)
    return flat_reading


@router.patch("/{id}", response_model=FlatReadingPublic, dependencies=[Depends(require_cargo(2))])
def update_flat_reading(*, session: SessionDep, id: uuid.UUID, flat_reading_in: FlatReadingUpdate) -> Any:
    flat_reading = session.get(FlatReading, id)
    if not flat_reading:
        raise HTTPException(status_code=404, detail="Flat reading not found")
    update_dict = flat_reading_in.model_dump(exclude_unset=True)
    flat_reading.sqlmodel_update(update_dict)
    session.add(flat_reading)
    session.commit()
    session.refresh(flat_reading)
    return flat_reading


@router.delete("/{id}", dependencies=[Depends(require_cargo(2))])
def delete_flat_reading(session: SessionDep, id: uuid.UUID) -> Any:
    flat_reading = session.get(FlatReading, id)
    if not flat_reading:
        raise HTTPException(status_code=404, detail="Flat reading not found")
    session.delete(flat_reading)
    session.commit()
    return {"ok": True}
