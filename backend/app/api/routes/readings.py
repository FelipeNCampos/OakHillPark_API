import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

from app.api.deps import SessionDep, require_cargo
from app.models import Message, Readings, ReadingsCreate, ReadingsPublic, ReadingsPublicList, ReadingsUpdate

router = APIRouter(prefix="/readings", tags=["readings"])


@router.get("/", response_model=ReadingsPublicList, dependencies=[Depends(require_cargo(2))])
def read_readings(session: SessionDep, skip: int = 0, limit: int = 100, building_id: uuid.UUID | None = None) -> Any:
    count_statement = select(func.count()).select_from(Readings)
    statement = select(Readings).offset(skip).limit(limit)
    
    if building_id:
        count_statement = count_statement.where(Readings.building_id == building_id)
        statement = statement.where(Readings.building_id == building_id)
    
    count = session.exec(count_statement).one()
    readings = session.exec(statement).all()
    return ReadingsPublicList(data=readings, count=count)


@router.get("/{id}", response_model=ReadingsPublic, dependencies=[Depends(require_cargo(2))])
def read_reading(session: SessionDep, id: uuid.UUID) -> Any:
    reading = session.get(Readings, id)
    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found")
    return reading


@router.post("/", response_model=ReadingsPublic, dependencies=[Depends(require_cargo(2))])
def create_reading(*, session: SessionDep, reading_in: ReadingsCreate) -> Any:
    reading = Readings.model_validate(reading_in)
    session.add(reading)
    session.commit()
    session.refresh(reading)
    return reading


@router.patch("/{id}", response_model=ReadingsPublic, dependencies=[Depends(require_cargo(2))])
def update_reading(*, session: SessionDep, id: uuid.UUID, reading_in: ReadingsUpdate) -> Any:
    reading = session.get(Readings, id)
    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found")
    update_dict = reading_in.model_dump(exclude_unset=True)
    reading.sqlmodel_update(update_dict)
    session.add(reading)
    session.commit()
    session.refresh(reading)
    return reading


@router.delete("/{id}", response_model=Message, dependencies=[Depends(require_cargo(2))])
def delete_reading(session: SessionDep, id: uuid.UUID) -> Message:
    reading = session.get(Readings, id)
    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found")
    session.delete(reading)
    session.commit()
    return Message(message="Reading deleted successfully")
