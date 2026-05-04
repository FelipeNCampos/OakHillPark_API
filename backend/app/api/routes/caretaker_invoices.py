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
    CaretakerInvoice,
    CaretakerInvoiceCreate,
    CaretakerInvoicePublic,
    CaretakerInvoicesPublic,
    Condominio,
    User,
)

router = APIRouter(prefix="/caretaker-invoices", tags=["caretaker-invoices"])

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


def _normalise_media_name(value: str | None) -> str | None:
    if not value:
        return None
    stripped = value.strip()
    return stripped or None


def _normalise_media_data(value: str | None) -> str:
    if not value:
        raise HTTPException(status_code=422, detail="Media is required")
    stripped = value.strip()
    if not stripped:
        raise HTTPException(status_code=422, detail="Media is required")

    match = DATA_URL_PATTERN.fullmatch(stripped)
    if not match:
        raise HTTPException(status_code=422, detail="Invalid media")

    try:
        file_bytes = base64.b64decode(match.group("data"), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Invalid media") from exc

    if not file_bytes:
        raise HTTPException(status_code=422, detail="Empty media")
    if len(file_bytes) > MAX_MEDIA_BYTES:
        raise HTTPException(status_code=413, detail="Media is too large")
    return stripped


def _to_public(invoice: CaretakerInvoice) -> CaretakerInvoicePublic:
    return CaretakerInvoicePublic(
        id=invoice.id,
        invoice_date=invoice.invoice_date,
        media_name=invoice.media_name,
        media_data=invoice.media_data,
        condominio_id=invoice.condominio_id,
        created_by_user_id=invoice.created_by_user_id,
        created_at=invoice.created_at,
    )


@router.get("/", response_model=CaretakerInvoicesPublic)
def read_caretaker_invoices(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 200,
    date_from: date | None = None,
    date_to: date | None = None,
) -> Any:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    filters = [CaretakerInvoice.condominio_id == condominio_id]
    if date_from:
        filters.append(CaretakerInvoice.invoice_date >= date_from)
    if date_to:
        filters.append(CaretakerInvoice.invoice_date <= date_to)

    count_statement = select(func.count()).select_from(CaretakerInvoice).where(*filters)
    statement = (
        select(CaretakerInvoice)
        .where(*filters)
        .order_by(CaretakerInvoice.invoice_date.desc(), CaretakerInvoice.created_at.desc())
        .offset(skip)
        .limit(limit)
    )

    count = session.exec(count_statement).one()
    invoices = session.exec(statement).all()
    return CaretakerInvoicesPublic(
        data=[_to_public(invoice) for invoice in invoices],
        count=count,
    )


@router.post("/", response_model=CaretakerInvoicePublic, status_code=201)
def create_caretaker_invoice(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: CaretakerInvoiceCreate,
) -> CaretakerInvoicePublic:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    invoice = CaretakerInvoice(
        invoice_date=payload.invoice_date,
        media_name=_normalise_media_name(payload.media_name),
        media_data=_normalise_media_data(payload.media_data),
        condominio_id=condominio_id,
        created_by_user_id=current_user.id,
    )
    session.add(invoice)
    session.commit()
    session.refresh(invoice)
    return _to_public(invoice)
