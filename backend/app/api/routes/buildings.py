import uuid
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case
from sqlalchemy.orm import InstrumentedAttribute, selectinload
from sqlmodel import func, select

from app.api.deps import SessionDep, get_current_user, require_cargo
from app.models import (
    Building,
    BuildingCreate,
    BuildingPublic,
    BuildingsPublic,
    BuildingUpdate,
    Message,
    User,
)

router = APIRouter(prefix="/buildings", tags=["buildings"])

BUILDING_READING_ORDER = ("Falcon", "Martlett", "Merlin", "Oak Lodge", "Northwood")


def _building_reading_order_expression() -> Any:
    return case(
        *(
            (func.lower(Building.nome) == building_name.lower(), index)
            for index, building_name in enumerate(BUILDING_READING_ORDER)
        ),
        else_=len(BUILDING_READING_ORDER),
    )


@router.get("/condominio", response_model=BuildingsPublic, dependencies=[Depends(require_cargo(1))])
def read_buildings_by_condominio(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    condominio_id = current_user.condominio_id
    count_statement = (
        select(func.count())
        .select_from(Building)
        .where(Building.condominio_id == condominio_id)
    )
    count = session.exec(count_statement).one()
    statement = (
        select(Building)
        .where(Building.condominio_id == condominio_id)
        .options(selectinload(cast(InstrumentedAttribute, Building.flats)))
        .order_by(_building_reading_order_expression(), Building.nome.asc())
        .offset(skip)
        .limit(limit)
    )
    buildings = session.exec(statement).all()
    return BuildingsPublic(data=buildings, count=count)


@router.get("/", response_model=BuildingsPublic, dependencies=[Depends(require_cargo(2))])
def read_buildings(session: SessionDep, skip: int = 0, limit: int = 100) -> Any:
    count_statement = select(func.count()).select_from(Building)
    count = session.exec(count_statement).one()
    statement = (
        select(Building)
        .options(selectinload(cast(InstrumentedAttribute, Building.flats)))
        .order_by(_building_reading_order_expression(), Building.nome.asc())
        .offset(skip)
        .limit(limit)
    )
    buildings = session.exec(statement).all()
    return BuildingsPublic(data=buildings, count=count)


@router.get("/{id}", response_model=BuildingPublic, dependencies=[Depends(require_cargo(2))])
def read_building(session: SessionDep, id: uuid.UUID) -> Any:
    building = session.get(Building, id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    return building


@router.post("/", response_model=BuildingPublic, dependencies=[Depends(require_cargo(2))])
def create_building(*, session: SessionDep, building_in: BuildingCreate) -> Any:
    building = Building.model_validate(building_in)
    session.add(building)
    session.commit()
    session.refresh(building)
    return building


@router.patch("/{id}", response_model=BuildingPublic, dependencies=[Depends(require_cargo(2))])
def update_building(*, session: SessionDep, id: uuid.UUID, building_in: BuildingUpdate) -> Any:
    building = session.get(Building, id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    update_dict = building_in.model_dump(exclude_unset=True)
    building.sqlmodel_update(update_dict)
    session.add(building)
    session.commit()
    session.refresh(building)
    return building


@router.delete("/{id}", response_model=Message, dependencies=[Depends(require_cargo(2))])
def delete_building(session: SessionDep, id: uuid.UUID) -> Message:
    building = session.get(Building, id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    session.delete(building)
    session.commit()
    return Message(message="Building deleted successfully")

@router.get("/id/{name}", response_model=BuildingPublic, dependencies=[Depends(require_cargo(1))])
def get_building_by_name(session: SessionDep, name: str,current_user: User = Depends(get_current_user),) -> Any:
    condominio = current_user.condominio_id


    statement = select(Building).where(Building.nome == name , Building.condominio_id == condominio)
    building = session.exec(statement).first()
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    return building
