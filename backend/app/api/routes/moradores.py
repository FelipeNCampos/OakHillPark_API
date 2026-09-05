import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case
from sqlmodel import col, func, or_, select

from app.api.deps import SessionDep, require_cargo
from app.models import (
    Building,
    Flat,
    Message,
    Morador,
    MoradorCreate,
    MoradoresWithFlatPublic,
    MoradorPublic,
    MoradorUpdate,
    MoradorWithFlatPublic,
)

router = APIRouter(prefix="/moradores", tags=["moradores"])

BUILDING_READING_ORDER = ("Falcon", "Martlett", "Merlin", "Oak Lodge", "Northwood")
FLAT_READING_TYPE_LOW = 1
FLAT_READING_TYPE_NORMAL = 2
FLAT_READING_TYPE_GAS = 4
FLAT_READING_TYPE_GARAGE = 8
FLAT_READING_TYPES_MAX = (
    FLAT_READING_TYPE_LOW
    | FLAT_READING_TYPE_NORMAL
    | FLAT_READING_TYPE_GAS
    | FLAT_READING_TYPE_GARAGE
)


def _building_reading_order_expression() -> Any:
    return case(
        *(
            (func.lower(Building.nome) == building_name.lower(), index)
            for index, building_name in enumerate(BUILDING_READING_ORDER)
        ),
        else_=len(BUILDING_READING_ORDER),
    )


def _normalize_car_value(value: str | None) -> str | None:
    if value is None:
        return None
    stripped_value = value.strip()
    return stripped_value or None


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped_value = value.strip()
    return stripped_value or None


def _build_morador_public(morador: Morador, flat: Flat | None = None) -> MoradorPublic:
    return MoradorPublic(
        id=morador.id,
        cargo=morador.cargo,
        nome=morador.nome,
        email=morador.email if morador.email and morador.email.strip() else None,
        tenant_nome_2=_normalize_optional_text(morador.tenant_nome_2),
        tenant_email_2=(
            morador.tenant_email_2
            if morador.tenant_email_2 and morador.tenant_email_2.strip()
            else None
        ),
        tenant_mobile_2=_normalize_optional_text(morador.tenant_mobile_2),
        mobile=morador.mobile,
        receives_flat_reading_sms=morador.receives_flat_reading_sms,
        receives_twilio_sms=morador.receives_twilio_sms,
        receives_twilio_email=morador.receives_twilio_email,
        flat_id=morador.flat_id,
        car1=_normalize_car_value(flat.car1) if flat else None,
        car2=_normalize_car_value(flat.car2) if flat else None,
        car3=_normalize_car_value(flat.car3) if flat else None,
    )


def _sync_flat_cars(
    flat: Flat, car1: str | None, car2: str | None, car3: str | None
) -> None:
    flat.car1 = _normalize_car_value(car1)
    flat.car2 = _normalize_car_value(car2)
    flat.car3 = _normalize_car_value(car3)


@router.get(
    "/",
    response_model=MoradoresWithFlatPublic,
    dependencies=[Depends(require_cargo(1))],
)
def read_moradores(
    session: SessionDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    building: str | None = Query(default=None),
    search: str | None = Query(default=None),
) -> Any:
    statement = (
        select(Morador, Flat, Building)
        .join(Flat, col(Morador.flat_id) == col(Flat.id))
        .join(Building, col(Flat.building_id) == col(Building.id))
        .order_by(
            _building_reading_order_expression(),
            Building.nome,
            Flat.numero,
            Flat.label,
        )
    )

    # Filter by building if provided
    if building:
        statement = statement.where(Building.nome == building)

    # Search by flat number, name, mobile, or email
    if search:
        search_term = f"%{search}%"
        search_clauses = [
            col(Morador.nome).ilike(search_term),
            col(Morador.mobile).ilike(search_term),
            col(Morador.email).ilike(search_term),
            col(Morador.tenant_nome_2).ilike(search_term),
            col(Morador.tenant_email_2).ilike(search_term),
            col(Morador.tenant_mobile_2).ilike(search_term),
            col(Flat.label).ilike(search_term),
        ]
        if search.isdigit():
            search_clauses.append(col(Flat.numero) == int(search))
        statement = statement.where(or_(*search_clauses))

    # Get total count with filters
    count_statement = (
        select(func.count())
        .select_from(Morador)
        .join(Flat, col(Morador.flat_id) == col(Flat.id))
        .join(Building, col(Flat.building_id) == col(Building.id))
    )
    if building:
        count_statement = count_statement.where(Building.nome == building)
    if search:
        search_term = f"%{search}%"
        search_clauses = [
            col(Morador.nome).ilike(search_term),
            col(Morador.mobile).ilike(search_term),
            col(Morador.email).ilike(search_term),
            col(Morador.tenant_nome_2).ilike(search_term),
            col(Morador.tenant_email_2).ilike(search_term),
            col(Morador.tenant_mobile_2).ilike(search_term),
            col(Flat.label).ilike(search_term),
        ]
        if search.isdigit():
            search_clauses.append(col(Flat.numero) == int(search))
        count_statement = count_statement.where(or_(*search_clauses))
    count = session.exec(count_statement).one()

    statement = statement.offset(skip).limit(limit)
    results = session.exec(statement).all()
    moradores_with_flat = [
        MoradorWithFlatPublic(
            id=morador.id,
            cargo=morador.cargo,
            nome=morador.nome,
            email=morador.email if morador.email and morador.email.strip() else None,
            tenant_nome_2=_normalize_optional_text(morador.tenant_nome_2),
            tenant_email_2=(
                morador.tenant_email_2
                if morador.tenant_email_2 and morador.tenant_email_2.strip()
                else None
            ),
            tenant_mobile_2=_normalize_optional_text(morador.tenant_mobile_2),
            mobile=morador.mobile,
            receives_flat_reading_sms=morador.receives_flat_reading_sms,
            receives_twilio_sms=morador.receives_twilio_sms,
            receives_twilio_email=morador.receives_twilio_email,
            car1=flat.car1 if flat.car1 and flat.car1.strip() else None,
            car2=flat.car2 if flat.car2 and flat.car2.strip() else None,
            car3=flat.car3 if flat.car3 and flat.car3.strip() else None,
            flat_id=morador.flat_id,
            flat_numero=flat.numero,
            flat_label=flat.label,
            building_nome=building.nome,
            reading_types=flat.reading_types,
        )
        for morador, flat, building in results
    ]
    return MoradoresWithFlatPublic(data=moradores_with_flat, count=count)


def _is_northwood_flat_1(flat: Flat, building: Building) -> bool:
    return (
        building.nome.strip().lower() == "northwood"
        and flat.numero == 1
        and not (flat.label or "").strip()
    )


@router.get(
    "/{id}",
    response_model=MoradorPublic,
    dependencies=[Depends(require_cargo(1))],
)
def read_morador(session: SessionDep, id: uuid.UUID) -> Any:
    morador = session.get(Morador, id)
    if not morador:
        raise HTTPException(status_code=404, detail="Morador not found")
    flat = session.get(Flat, morador.flat_id)
    return _build_morador_public(morador, flat)


@router.post("/", response_model=MoradorPublic, dependencies=[Depends(require_cargo(2))])
def create_morador(*, session: SessionDep, morador_in: MoradorCreate) -> Any:
    flat = session.get(Flat, morador_in.flat_id)
    if not flat:
        raise HTTPException(status_code=404, detail="Flat not found")

    morador_data = morador_in.model_dump(exclude={"car1", "car2", "car3"})
    morador_data["tenant_nome_2"] = _normalize_optional_text(
        morador_data.get("tenant_nome_2")
    )
    morador_data["tenant_mobile_2"] = _normalize_optional_text(
        morador_data.get("tenant_mobile_2")
    )
    morador = Morador.model_validate(morador_data)
    if {"car1", "car2", "car3"} & morador_in.model_fields_set:
        _sync_flat_cars(flat, morador_in.car1, morador_in.car2, morador_in.car3)

    session.add(flat)
    session.add(morador)
    session.commit()
    session.refresh(flat)
    session.refresh(morador)
    return _build_morador_public(morador, flat)


@router.patch("/{id}", response_model=MoradorPublic, dependencies=[Depends(require_cargo(2))])
def update_morador(
    *, session: SessionDep, id: uuid.UUID, morador_in: MoradorUpdate
) -> Any:
    morador = session.get(Morador, id)
    if not morador:
        raise HTTPException(status_code=404, detail="Morador not found")
    target_flat_id = morador_in.flat_id or morador.flat_id
    flat = session.get(Flat, target_flat_id)
    if not flat:
        raise HTTPException(status_code=404, detail="Flat not found")

    update_dict = morador_in.model_dump(
        exclude_unset=True,
        exclude={"car1", "car2", "car3"},
    )
    if "tenant_nome_2" in update_dict:
        update_dict["tenant_nome_2"] = _normalize_optional_text(
            update_dict["tenant_nome_2"]
        )
    if "tenant_mobile_2" in update_dict:
        update_dict["tenant_mobile_2"] = _normalize_optional_text(
            update_dict["tenant_mobile_2"]
        )
    morador.sqlmodel_update(update_dict)

    if {"car1", "car2", "car3"} & morador_in.model_fields_set:
        _sync_flat_cars(flat, morador_in.car1, morador_in.car2, morador_in.car3)

    session.add(flat)
    session.add(morador)
    session.commit()
    session.refresh(flat)
    session.refresh(morador)
    return _build_morador_public(morador, flat)


@router.patch(
    "/{id}/reading-types",
    response_model=MoradorWithFlatPublic,
    dependencies=[Depends(require_cargo(2))],
)
def update_morador_reading_types(
    *, session: SessionDep, id: uuid.UUID, request_body: dict
) -> Any:
    """Update reading types for a morador's flat"""
    try:
        reading_types = int(request_body.get("reading_types", 0))
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="Invalid reading types")

    if reading_types < 0 or reading_types > FLAT_READING_TYPES_MAX:
        raise HTTPException(status_code=422, detail="Invalid reading types")

    morador = session.get(Morador, id)
    if not morador:
        raise HTTPException(status_code=404, detail="Morador not found")

    flat = session.get(Flat, morador.flat_id)
    if not flat:
        raise HTTPException(status_code=404, detail="Flat not found")

    building = session.get(Building, flat.building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    if (reading_types & FLAT_READING_TYPE_GARAGE) and not _is_northwood_flat_1(
        flat, building
    ):
        raise HTTPException(
            status_code=400,
            detail="Garage readings are only available for Northwood flat 1",
        )

    flat.reading_types = reading_types
    session.add(flat)
    session.commit()
    session.refresh(flat)

    # Return the updated morador with flat info
    return MoradorWithFlatPublic(
        id=morador.id,
        cargo=morador.cargo,
        nome=morador.nome,
        email=morador.email,
        tenant_nome_2=_normalize_optional_text(morador.tenant_nome_2),
        tenant_email_2=(
            morador.tenant_email_2
            if morador.tenant_email_2 and morador.tenant_email_2.strip()
            else None
        ),
        tenant_mobile_2=_normalize_optional_text(morador.tenant_mobile_2),
        mobile=morador.mobile,
        receives_flat_reading_sms=morador.receives_flat_reading_sms,
        receives_twilio_sms=morador.receives_twilio_sms,
        car1=flat.car1,
        car2=flat.car2,
        car3=flat.car3,
        flat_id=morador.flat_id,
        flat_numero=flat.numero,
        flat_label=flat.label,
        building_nome=building.nome,
        reading_types=flat.reading_types,
    )


@router.delete("/{id}", response_model=Message, dependencies=[Depends(require_cargo(2))])
def delete_morador(session: SessionDep, id: uuid.UUID) -> Message:
    morador = session.get(Morador, id)
    if not morador:
        raise HTTPException(status_code=404, detail="Morador not found")
    session.delete(morador)
    session.commit()
    return Message(message="Morador deleted successfully")
