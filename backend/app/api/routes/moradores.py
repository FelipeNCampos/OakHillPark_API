import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
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


def _safe_email(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = value.strip()
    if not cleaned or "@" not in cleaned:
        return None
    return cleaned


@router.get("/", response_model=MoradoresWithFlatPublic)
def read_moradores(
    session: SessionDep,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    building: str = Query(None),
    search: str = Query(None),
) -> Any:
    statement = (
        select(Morador, Flat, Building)
        .join(Flat, col(Morador.flat_id) == Flat.id)
        .join(Building, col(Flat.building_id) == Building.id)
        .order_by(col(Building.nome), col(Flat.numero))
    )

    # Filter by building if provided
    if building:
        statement = statement.where(Building.nome == building)

    # Search by flat number, name, mobile, or email
    if search:
        search_term = f"%{search}%"
        statement = statement.where(
            or_(
                Flat.numero == int(search) if search.isdigit() else False,
                col(Morador.nome).ilike(search_term),
                col(Morador.mobile).ilike(search_term),
                col(Morador.email).ilike(search_term) if search else False,
            )
        )

    # Get total count with filters
    count_statement = select(func.count()).select_from(Morador).join(Flat).join(Building)
    if building:
        count_statement = count_statement.where(Building.nome == building)
    if search:
        search_term = f"%{search}%"
        count_statement = count_statement.where(
            or_(
                Flat.numero == int(search) if search.isdigit() else False,
                col(Morador.nome).ilike(search_term),
                col(Morador.mobile).ilike(search_term),
                col(Morador.email).ilike(search_term) if search else False,
            )
        )
    count = session.exec(count_statement).one()

    statement = statement.offset(skip).limit(limit)
    results = session.exec(statement).all()
    moradores_with_flat = [
        MoradorWithFlatPublic(
            id=morador.id,
            cargo=morador.cargo,
            nome=morador.nome,
            email=_safe_email(morador.email),
            mobile=morador.mobile,
            car1=flat.car1 if flat.car1 and flat.car1.strip() else None,
            car2=flat.car2 if flat.car2 and flat.car2.strip() else None,
            car3=flat.car3 if flat.car3 and flat.car3.strip() else None,
            flat_id=morador.flat_id,
            flat_numero=flat.numero,
            building_nome=building.nome,
            reading_types=flat.reading_types,
        )
        for morador, flat, building in results
    ]
    return MoradoresWithFlatPublic(data=moradores_with_flat, count=count)


@router.get("/{id}", response_model=MoradorPublic)
def read_morador(session: SessionDep, id: uuid.UUID) -> Any:
    morador = session.get(Morador, id)
    if not morador:
        raise HTTPException(status_code=404, detail="Morador not found")
    return morador


@router.post("/", response_model=MoradorPublic, dependencies=[Depends(require_cargo(2))])
def create_morador(*, session: SessionDep, morador_in: MoradorCreate) -> Any:
    morador = Morador.model_validate(morador_in)
    session.add(morador)
    session.commit()
    session.refresh(morador)
    return morador


@router.patch("/{id}", response_model=MoradorPublic, dependencies=[Depends(require_cargo(2))])
def update_morador(
    *, session: SessionDep, id: uuid.UUID, morador_in: MoradorUpdate
) -> Any:
    morador = session.get(Morador, id)
    if not morador:
        raise HTTPException(status_code=404, detail="Morador not found")
    update_dict = morador_in.model_dump(exclude_unset=True)
    morador.sqlmodel_update(update_dict)
    session.add(morador)
    session.commit()
    session.refresh(morador)
    return morador


@router.patch("/{id}/reading-types", response_model=MoradorWithFlatPublic, dependencies=[Depends(require_cargo(2))])
def update_morador_reading_types(
    *, session: SessionDep, id: uuid.UUID, request_body: dict
) -> Any:
    """Update reading types for a morador's flat"""
    reading_types = request_body.get("reading_types", 0)

    morador = session.get(Morador, id)
    if not morador:
        raise HTTPException(status_code=404, detail="Morador not found")

    flat = session.get(Flat, morador.flat_id)
    if not flat:
        raise HTTPException(status_code=404, detail="Flat not found")

    flat.reading_types = reading_types
    session.add(flat)
    session.commit()
    session.refresh(flat)

    # Return the updated morador with flat info
    building = session.get(Building, flat.building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    return MoradorWithFlatPublic(
        id=morador.id,
        cargo=morador.cargo,
        nome=morador.nome,
        email=_safe_email(morador.email),
        mobile=morador.mobile,
        car1=flat.car1,
        car2=flat.car2,
        car3=flat.car3,
        flat_id=morador.flat_id,
        flat_numero=flat.numero,
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
