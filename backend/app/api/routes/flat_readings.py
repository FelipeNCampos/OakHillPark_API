import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

from app.api.deps import SessionDep, require_cargo
from app.models import FlatReading, FlatReadingCreate, FlatReadingPublic, FlatReadingsPublic, FlatReadingUpdate

router = APIRouter(prefix="/flat_readings", tags=["flat_readings"])


@router.get("/", response_model=FlatReadingsPublic, dependencies=[Depends(require_cargo(2))])
def read_flat_readings(session: SessionDep, skip: int = 0, limit: int = 100, flat_id: uuid.UUID | None = None) -> Any:
    count_statement = select(func.count()).select_from(FlatReading)
    statement = select(FlatReading).offset(skip).limit(limit)
    
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
