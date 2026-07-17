import base64
import binascii
import hashlib
import math
import re
import secrets
import uuid
from datetime import date, datetime, timezone
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import or_
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.models import (
    CashFlowRecord,
    CashFlowRecordCreate,
    CashFlowRecordPublic,
    CashFlowRecordsPublic,
    CashFlowRecordUpdate,
    CashFlowReportSendCreate,
    CashFlowSharedRecordPublic,
    CashFlowSharedRecordsPublic,
    CashFlowShareLink,
    CashFlowShareLinkCreate,
    CashFlowShareLinkPublic,
    CashFlowShareLinksPublic,
    Condominio,
    Message,
    User,
)
from app.services.cash_flow_service import CashFlowService

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
        supplier=record.supplier,
        description=record.description,
        location=record.location,
        reason=record.reason,
        condominio_id=record.condominio_id,
        created_by_user_id=record.created_by_user_id,
        created_at=record.created_at,
    )


def _to_shared_public(record: CashFlowRecord) -> CashFlowSharedRecordPublic:
    return CashFlowSharedRecordPublic(
        id=record.id,
        payment_number=record.payment_number,
        has_invoice=record.has_invoice,
        invoice_media_name=record.invoice_media_name,
        invoice_media_data=record.invoice_media_data,
        record_date=record.record_date,
        amount=record.amount,
        supplier=record.supplier,
        description=record.description,
        location=record.location,
        reason=record.reason,
    )


def _share_token_cipher() -> Fernet:
    configured_key = settings.CASH_FLOW_SHARE_TOKEN_ENCRYPTION_KEY
    if configured_key:
        return Fernet(configured_key.encode())
    fallback_key = base64.urlsafe_b64encode(
        hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    )
    return Fernet(fallback_key)


def _share_link_status(link: CashFlowShareLink, now: datetime) -> str:
    if link.revoked_at is not None:
        return "revoked"
    if link.expires_at <= now:
        return "expired"
    return "active"


def _share_link_url(link: CashFlowShareLink) -> str:
    try:
        token = _share_token_cipher().decrypt(link.token_encrypted.encode()).decode()
    except (InvalidToken, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=500, detail="Unable to recover shared link") from exc
    return f"{settings.cash_flow_share_frontend_host}/cash-flow/share/{token}"


def _to_share_link_public(link: CashFlowShareLink, now: datetime) -> CashFlowShareLinkPublic:
    status = _share_link_status(link, now)
    return CashFlowShareLinkPublic(
        id=link.id,
        url=_share_link_url(link) if status != "revoked" else None,
        date_from=link.date_from,
        date_to=link.date_to,
        expires_at=link.expires_at,
        revoked_at=link.revoked_at,
        created_at=link.created_at,
        status=status,
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
        filters.append(
            or_(
                CashFlowRecord.description.ilike(query),
                CashFlowRecord.supplier.ilike(query),
            )
        )

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


@router.post("/share-links/", response_model=CashFlowShareLinkPublic, status_code=201)
def create_cash_flow_share_link(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: CashFlowShareLinkCreate,
) -> CashFlowShareLinkPublic:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    if payload.date_from > payload.date_to:
        raise HTTPException(status_code=422, detail="date_from must be before date_to")
    if payload.expires_at.tzinfo is None:
        raise HTTPException(status_code=422, detail="expires_at must include a timezone")

    now = datetime.now(timezone.utc)
    expires_at = payload.expires_at.astimezone(timezone.utc)
    if expires_at <= now:
        raise HTTPException(status_code=422, detail="expires_at must be in the future")

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    token = secrets.token_urlsafe(32)
    link = CashFlowShareLink(
        token_hash=hashlib.sha256(token.encode()).hexdigest(),
        token_encrypted=_share_token_cipher().encrypt(token.encode()).decode(),
        date_from=payload.date_from,
        date_to=payload.date_to,
        expires_at=expires_at,
        condominio_id=condominio_id,
        created_by_user_id=current_user.id,
    )
    session.add(link)
    session.commit()
    session.refresh(link)
    return _to_share_link_public(link, now)


@router.get("/share-links/", response_model=CashFlowShareLinksPublic)
def read_cash_flow_share_links(
    session: SessionDep,
    current_user: CurrentUser,
) -> CashFlowShareLinksPublic:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    now = datetime.now(timezone.utc)
    links = session.exec(
        select(CashFlowShareLink)
        .where(
            CashFlowShareLink.condominio_id == condominio_id,
            CashFlowShareLink.hidden_at.is_(None),
        )
        .order_by(CashFlowShareLink.created_at.desc())
    ).all()
    return CashFlowShareLinksPublic(
        data=[_to_share_link_public(link, now) for link in links], count=len(links)
    )


@router.delete("/share-links/{share_link_id}", response_model=CashFlowShareLinkPublic)
def revoke_cash_flow_share_link(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    share_link_id: uuid.UUID,
) -> CashFlowShareLinkPublic:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    link = session.get(CashFlowShareLink, share_link_id)
    if not link or link.condominio_id != condominio_id:
        raise HTTPException(status_code=404, detail="Shared cash flow link not found")

    now = datetime.now(timezone.utc)
    if link.revoked_at is None:
        link.revoked_at = now
        session.add(link)
        session.commit()
        session.refresh(link)
    return _to_share_link_public(link, now)


@router.post("/share-links/{share_link_id}/hide", response_model=Message)
def hide_revoked_cash_flow_share_link(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    share_link_id: uuid.UUID,
) -> Message:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    link = session.get(CashFlowShareLink, share_link_id)
    if not link or link.condominio_id != condominio_id:
        raise HTTPException(status_code=404, detail="Shared cash flow link not found")
    if link.revoked_at is None:
        raise HTTPException(status_code=422, detail="Only revoked shared links can be hidden")

    if link.hidden_at is None:
        link.hidden_at = datetime.now(timezone.utc)
        session.add(link)
        session.commit()
    return Message(message="Shared cash flow link hidden")


@router.get("/shared/{token}", response_model=CashFlowSharedRecordsPublic)
def read_shared_cash_flow_records(
    session: SessionDep,
    token: str,
) -> CashFlowSharedRecordsPublic:
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    link = session.exec(
        select(CashFlowShareLink).where(CashFlowShareLink.token_hash == token_hash)
    ).first()
    now = datetime.now(timezone.utc)
    if not link or _share_link_status(link, now) != "active":
        raise HTTPException(status_code=404, detail="Shared cash flow link not found")

    records = session.exec(
        select(CashFlowRecord)
        .where(
            CashFlowRecord.condominio_id == link.condominio_id,
            CashFlowRecord.record_date >= link.date_from,
            CashFlowRecord.record_date <= link.date_to,
        )
        .order_by(
            CashFlowRecord.record_date.asc(),
            CashFlowRecord.payment_number.asc(),
            CashFlowRecord.created_at.asc(),
            CashFlowRecord.id.asc(),
        )
    ).all()
    amounts = [float(record.amount) for record in records]
    return CashFlowSharedRecordsPublic(
        data=[_to_shared_public(record) for record in records],
        count=len(records),
        date_from=link.date_from,
        date_to=link.date_to,
        credits_total=round(sum(amount for amount in amounts if amount > 0), 2),
        debits_total=round(sum(amount for amount in amounts if amount < 0), 2),
        balance=round(sum(amounts), 2),
    )


@router.get("/report/")
def generate_cash_flow_report(
    session: SessionDep,
    current_user: CurrentUser,
    start_month: str | None = None,
    end_month: str | None = None,
    search: str | None = None,
    include_invoice_table: bool = False,
) -> Response:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    service = CashFlowService(session, condominio_id)
    period_label, report_data = service.build_range_report_pdf(
        start_month=start_month,
        end_month=end_month,
        search=search,
        include_invoice_table=include_invoice_table,
    )
    file_name = service.build_report_file_name(period_label)
    headers = {"Content-Disposition": f'inline; filename="{file_name}"'}
    return Response(content=report_data, media_type="application/pdf", headers=headers)


@router.post("/report/send/", response_model=Message, status_code=201)
def send_cash_flow_report(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: CashFlowReportSendCreate,
) -> Message:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    service = CashFlowService(session, condominio_id)
    try:
        service.send_range_report(
            recipient=str(payload.email_to),
            start_month=payload.start_month,
            end_month=payload.end_month,
            search=payload.search,
            include_invoice_table=payload.include_invoice_table,
        )
    except AssertionError:
        raise HTTPException(
            status_code=400,
            detail="Email is not configured. Set SMTP_HOST and EMAILS_FROM_EMAIL.",
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return Message(message="Report sent successfully")


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
        supplier=_normalise_text(payload.supplier),
        description=_normalise_text(payload.description),
        location=_normalise_text(payload.location),
        reason=_normalise_text(payload.reason),
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
    if "supplier" in update and update["supplier"] is not None:
        update["supplier"] = _normalise_text(update["supplier"])
    if "description" in update and update["description"] is not None:
        update["description"] = _normalise_text(update["description"])
    if "location" in update and update["location"] is not None:
        update["location"] = _normalise_text(update["location"])
    if "reason" in update and update["reason"] is not None:
        update["reason"] = _normalise_text(update["reason"])

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
