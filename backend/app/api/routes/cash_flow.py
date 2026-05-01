import base64
import binascii
import math
import re
import uuid
from datetime import date
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    CashFlowRecord,
    CashFlowRecordCreate,
    CashFlowRecordPublic,
    CashFlowRecordsPublic,
    CashFlowRecordUpdate,
    Condominio,
    Message,
    User,
)

router = APIRouter(prefix="/cash-flow", tags=["cash-flow"])

DATA_URL_PATTERN = re.compile(
    r"^data:(?P<mime>[-\w.+/]+/[-\w.+]+)?;base64,(?P<data>[A-Za-z0-9+/=\s]+)$"
)
MAX_MEDIA_BYTES = 10 * 1024 * 1024


def _is_manager(user: User) -> bool:
    return bool(user.is_superuser or user.cargo >= 2)


def _resolve_user_condominio_id(session: SessionDep, user: User) -> uuid.UUID | None:
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


def _normalise_text(value: str | None) -> str:
    return (value or "").strip()


def _normalise_media_name(value: str | None) -> str | None:
    normalised = _normalise_text(value)
    return normalised or None


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


def _validate_amount(amount: float) -> float:
    if not math.isfinite(amount):
        raise HTTPException(status_code=422, detail="Invalid amount")
    return round(amount, 2)


def _month_bounds(value: date) -> tuple[date, date]:
    start = value.replace(day=1)
    if start.month == 12:
        return start, start.replace(year=start.year + 1, month=1)
    return start, start.replace(month=start.month + 1)


def _cash_flow_month_filters(
    *, condominio_id: uuid.UUID, month_date: date
) -> list[Any]:
    month_start, next_month_start = _month_bounds(month_date)
    return [
        CashFlowRecord.condominio_id == condominio_id,
        CashFlowRecord.record_date >= month_start,
        CashFlowRecord.record_date < next_month_start,
    ]


def _renumber_cash_flow_month(
    session: SessionDep, *, condominio_id: uuid.UUID, month_date: date
) -> None:
    records = session.exec(
        select(CashFlowRecord)
        .where(
            *_cash_flow_month_filters(
                condominio_id=condominio_id, month_date=month_date
            )
        )
        .order_by(
            CashFlowRecord.record_date.asc(),
            CashFlowRecord.created_at.asc(),
            CashFlowRecord.id.asc(),
        )
    ).all()

    for index, record in enumerate(records, start=1):
        if record.payment_number != index:
            record.payment_number = index
            session.add(record)


def _next_payment_number(
    session: SessionDep, *, condominio_id: uuid.UUID, month_date: date
) -> int:
    record_count = session.exec(
        select(func.count())
        .select_from(CashFlowRecord)
        .where(
            *_cash_flow_month_filters(
                condominio_id=condominio_id, month_date=month_date
            )
        )
    ).one()
    return int(record_count or 0) + 1


def _require_record_for_condominio(
    session: SessionDep,
    *,
    condominio_id: uuid.UUID,
    record_id: uuid.UUID,
) -> CashFlowRecord:
    record = session.get(CashFlowRecord, record_id)
    if not record or record.condominio_id != condominio_id:
        raise HTTPException(status_code=404, detail="Cash flow record not found")
    return record


def _to_public(record: CashFlowRecord) -> CashFlowRecordPublic:
    return CashFlowRecordPublic(
        id=record.id,
        payment_number=record.payment_number,
        has_invoice=record.has_invoice,
        invoice_media_name=record.invoice_media_name,
        invoice_media_data=record.invoice_media_data,
        record_date=record.record_date,
        amount=record.amount,
        description=record.description,
        condominio_id=record.condominio_id,
        created_by_user_id=record.created_by_user_id,
        created_at=record.created_at,
    )


@router.get("/", response_model=CashFlowRecordsPublic)
def read_cash_flow_records(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 200,
    date_from: date | None = None,
    date_to: date | None = None,
    search: str | None = None,
) -> Any:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    filters = [CashFlowRecord.condominio_id == condominio_id]
    if date_from:
        filters.append(CashFlowRecord.record_date >= date_from)
    if date_to:
        filters.append(CashFlowRecord.record_date <= date_to)
    if search and search.strip():
        query = f"%{search.strip()}%"
        filters.append(CashFlowRecord.description.ilike(query))

    count_statement = select(func.count()).select_from(CashFlowRecord).where(*filters)
    balance_statement = select(func.coalesce(func.sum(CashFlowRecord.amount), 0)).where(
        *filters
    )
    statement = (
        select(CashFlowRecord)
        .where(*filters)
        .order_by(CashFlowRecord.record_date.asc(), CashFlowRecord.payment_number.asc())
        .offset(skip)
        .limit(limit)
    )

    count = session.exec(count_statement).one()
    balance = session.exec(balance_statement).one()
    records = session.exec(statement).all()

    return CashFlowRecordsPublic(
        data=[_to_public(record) for record in records],
        count=count,
        balance=round(float(balance or 0), 2),
        next_payment_number=_next_payment_number(
            session,
            condominio_id=condominio_id,
            month_date=date_from or date.today(),
        ),
    )


@router.post("/", response_model=CashFlowRecordPublic, status_code=201)
def create_cash_flow_record(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: CashFlowRecordCreate,
) -> CashFlowRecordPublic:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    invoice_media_data = (
        _normalise_media_data("invoice_media_data", payload.invoice_media_data)
        if payload.has_invoice
        else None
    )

    record = CashFlowRecord(
        payment_number=0,
        has_invoice=payload.has_invoice,
        invoice_media_name=_normalise_media_name(payload.invoice_media_name)
        if invoice_media_data
        else None,
        invoice_media_data=invoice_media_data,
        record_date=payload.record_date,
        amount=_validate_amount(payload.amount),
        description=_normalise_text(payload.description),
        condominio_id=condominio_id,
        created_by_user_id=current_user.id,
    )
    session.add(record)
    session.flush()
    _renumber_cash_flow_month(
        session, condominio_id=condominio_id, month_date=record.record_date
    )
    session.commit()
    session.refresh(record)
    return _to_public(record)


@router.patch("/{record_id}", response_model=CashFlowRecordPublic)
def update_cash_flow_record(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    record_id: uuid.UUID,
    payload: CashFlowRecordUpdate,
) -> CashFlowRecordPublic:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    record = _require_record_for_condominio(
        session,
        condominio_id=condominio_id,
        record_id=record_id,
    )

    original_record_date = record.record_date
    update = payload.model_dump(exclude_unset=True)
    if "amount" in update and update["amount"] is not None:
        update["amount"] = _validate_amount(float(update["amount"]))
    if "description" in update and update["description"] is not None:
        update["description"] = _normalise_text(update["description"])

    has_invoice = bool(update.get("has_invoice", record.has_invoice))
    if "invoice_media_data" in update or "has_invoice" in update:
        invoice_media_data = (
            _normalise_media_data(
                "invoice_media_data", update.get("invoice_media_data")
            )
            if has_invoice
            else None
        )
        update["invoice_media_data"] = invoice_media_data
        update["invoice_media_name"] = (
            _normalise_media_name(update.get("invoice_media_name"))
            if invoice_media_data
            else None
        )

    record.sqlmodel_update(update)
    session.add(record)
    session.flush()
    _renumber_cash_flow_month(
        session, condominio_id=condominio_id, month_date=original_record_date
    )
    if _month_bounds(original_record_date) != _month_bounds(record.record_date):
        _renumber_cash_flow_month(
            session, condominio_id=condominio_id, month_date=record.record_date
        )
    session.commit()
    session.refresh(record)
    return _to_public(record)


@router.delete("/{record_id}", response_model=Message)
def delete_cash_flow_record(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    record_id: uuid.UUID,
) -> Message:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    record = _require_record_for_condominio(
        session,
        condominio_id=condominio_id,
        record_id=record_id,
    )
    record_date = record.record_date
    session.delete(record)
    session.flush()
    _renumber_cash_flow_month(
        session, condominio_id=condominio_id, month_date=record_date
    )
    session.commit()
    return Message(message="Cash flow record deleted successfully")
