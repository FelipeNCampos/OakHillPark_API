import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Building,
    Flat,
    KeyHandover,
    KeyHandoverCheckinCreate,
    KeyHandoverCheckoutCreate,
    KeyHandoverPublic,
    KeyHandoversPublic,
    KeyPublic,
    KeysPublic,
    PublicKeyAccess,
)

router = APIRouter(prefix="/key-access", tags=["key-access"])

KEY_PREFIX_BY_BUILDING = {
    "martlett": "MA",
    "falcon": "FA",
    "merlin": "ME",
    "oak lodge": "OA",
    "northwood": "NO",
}


def _normalise_building_name(value: str) -> str:
    return " ".join(value.casefold().split())


def _flat_key_identifier(flat: Flat) -> str:
    label = (flat.label or "").strip()
    return label.upper() if label else str(flat.numero)


def _key_code(building: Building, flat: Flat) -> str:
    prefix = KEY_PREFIX_BY_BUILDING.get(_normalise_building_name(building.nome))
    if not prefix:
        prefix = "".join(
            word[0].upper()
            for word in building.nome.split()
            if word and word[0].isalnum()
        )
    return f"{prefix or 'FL'}-{_flat_key_identifier(flat)}"


def _get_flat_and_building(
    session: SessionDep, flat_id: uuid.UUID
) -> tuple[Flat, Building]:
    flat = session.get(Flat, flat_id)
    if not flat:
        raise HTTPException(status_code=404, detail="Flat not found")
    building = session.get(Building, flat.building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    return flat, building


def _get_open_handover(
    session: SessionDep, flat_id: uuid.UUID
) -> KeyHandover | None:
    return session.exec(
        select(KeyHandover)
        .where(
            KeyHandover.flat_id == flat_id,
            col(KeyHandover.checked_in_at).is_(None),
        )
        .order_by(KeyHandover.checked_out_at.desc())
        .limit(1)
    ).first()


def _key_to_public(
    flat: Flat, building: Building, handover: KeyHandover | None
) -> KeyPublic:
    return KeyPublic(
        flat_id=flat.id,
        building_name=building.nome,
        flat_numero=flat.numero,
        flat_label=flat.label,
        key_code=_key_code(building, flat),
        is_checked_out=handover is not None,
        holder_name=handover.holder_name if handover else None,
        holder_mobile=handover.holder_mobile if handover else None,
        checked_out_at=handover.checked_out_at if handover else None,
    )


def _handover_to_public(
    handover: KeyHandover, flat: Flat, building: Building
) -> KeyHandoverPublic:
    return KeyHandoverPublic(
        id=handover.id,
        flat_id=flat.id,
        building_name=building.nome,
        flat_numero=flat.numero,
        flat_label=flat.label,
        key_code=handover.key_code,
        holder_name=handover.holder_name,
        holder_mobile=handover.holder_mobile,
        checked_out_at=handover.checked_out_at,
        checked_in_at=handover.checked_in_at,
        returned_by_name=handover.returned_by_name,
        returned_by_mobile=handover.returned_by_mobile,
    )


def _require_manager_condominio(current_user: CurrentUser) -> uuid.UUID | None:
    if not current_user.is_superuser and current_user.cargo < 2:
        raise HTTPException(status_code=403, detail="Not enough permissions")
    if current_user.is_superuser:
        return None
    if not current_user.condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")
    return current_user.condominio_id


def _required_text(value: str, field_name: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise HTTPException(status_code=422, detail=f"{field_name} is required")
    return cleaned


@router.get("/keys", response_model=KeysPublic)
def read_keys(session: SessionDep, current_user: CurrentUser) -> Any:
    condominio_id = _require_manager_condominio(current_user)
    conditions = []
    if condominio_id is not None:
        conditions.append(Building.condominio_id == condominio_id)

    rows = session.exec(
        select(Flat, Building)
        .join(Building, Flat.building_id == Building.id)
        .where(*conditions)
        .order_by(Building.nome.asc(), Flat.numero.asc(), Flat.label.asc())
    ).all()
    flat_ids = [flat.id for flat, _ in rows]
    open_handovers = (
        session.exec(
            select(KeyHandover).where(
                KeyHandover.flat_id.in_(flat_ids),
                col(KeyHandover.checked_in_at).is_(None),
            )
        ).all()
        if flat_ids
        else []
    )
    open_handover_by_flat_id = {
        handover.flat_id: handover for handover in open_handovers
    }
    data = [
        _key_to_public(flat, building, open_handover_by_flat_id.get(flat.id))
        for flat, building in rows
    ]
    return KeysPublic(data=data, count=len(data))


@router.get("/handovers", response_model=KeyHandoversPublic)
def read_key_handovers(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
    open_only: bool = False,
) -> Any:
    condominio_id = _require_manager_condominio(current_user)
    conditions = []
    if condominio_id is not None:
        conditions.append(Building.condominio_id == condominio_id)
    if open_only:
        conditions.append(col(KeyHandover.checked_in_at).is_(None))

    count = session.exec(
        select(func.count())
        .select_from(KeyHandover)
        .join(Flat, KeyHandover.flat_id == Flat.id)
        .join(Building, Flat.building_id == Building.id)
        .where(*conditions)
    ).one()
    rows = session.exec(
        select(KeyHandover, Flat, Building)
        .join(Flat, KeyHandover.flat_id == Flat.id)
        .join(Building, Flat.building_id == Building.id)
        .where(*conditions)
        .order_by(KeyHandover.checked_out_at.desc())
        .offset(skip)
        .limit(limit)
    ).all()
    return KeyHandoversPublic(
        data=[
            _handover_to_public(handover, flat, building)
            for handover, flat, building in rows
        ],
        count=count,
    )


@router.get("/public/{flat_id}", response_model=PublicKeyAccess)
def read_public_key_access(session: SessionDep, flat_id: uuid.UUID) -> PublicKeyAccess:
    flat, building = _get_flat_and_building(session, flat_id)
    open_handover = _get_open_handover(session, flat.id)
    return PublicKeyAccess(
        flat_id=flat.id,
        building_name=building.nome,
        flat_numero=flat.numero,
        flat_label=flat.label,
        key_code=_key_code(building, flat),
        is_checked_out=open_handover is not None,
    )


@router.post(
    "/public/{flat_id}/checkout",
    response_model=KeyHandoverPublic,
    status_code=201,
)
def checkout_key(
    *,
    session: SessionDep,
    flat_id: uuid.UUID,
    payload: KeyHandoverCheckoutCreate,
) -> KeyHandoverPublic:
    flat, building = _get_flat_and_building(session, flat_id)
    if _get_open_handover(session, flat.id):
        raise HTTPException(status_code=409, detail="This key is already checked out")

    handover = KeyHandover(
        flat_id=flat.id,
        key_code=_key_code(building, flat),
        holder_name=_required_text(payload.holder_name, "Name"),
        holder_mobile=_required_text(payload.holder_mobile, "Phone number"),
    )
    session.add(handover)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="This key is already checked out")
    session.refresh(handover)
    return _handover_to_public(handover, flat, building)


@router.post(
    "/public/{flat_id}/checkin",
    response_model=KeyHandoverPublic,
)
def checkin_key(
    *,
    session: SessionDep,
    flat_id: uuid.UUID,
    payload: KeyHandoverCheckinCreate,
) -> KeyHandoverPublic:
    flat, building = _get_flat_and_building(session, flat_id)
    handover = _get_open_handover(session, flat.id)
    if not handover:
        raise HTTPException(status_code=409, detail="This key is already checked in")

    handover.checked_in_at = datetime.now(timezone.utc)
    handover.returned_by_name = _required_text(payload.returned_by_name, "Name")
    handover.returned_by_mobile = _required_text(
        payload.returned_by_mobile, "Phone number"
    )
    session.add(handover)
    session.commit()
    session.refresh(handover)
    return _handover_to_public(handover, flat, building)
