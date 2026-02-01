import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

from app.api.deps import SessionDep, require_cargo
from app.models import Flat, FlatCreate, FlatPublic, FlatUpdate, FlatsPublic, Message

router = APIRouter(prefix="/flats", tags=["flats"])


@router.get("/", response_model=FlatsPublic, dependencies=[Depends(require_cargo(2))])
def read_flats(session: SessionDep, skip: int = 0, limit: int = 100) -> Any:
    count_statement = select(func.count()).select_from(Flat)
    count = session.exec(count_statement).one()
    statement = select(Flat).offset(skip).limit(limit)
    flats = session.exec(statement).all()
    return FlatsPublic(data=flats, count=count)


@router.get("/{id}", response_model=FlatPublic, dependencies=[Depends(require_cargo(2))])
def read_flat(session: SessionDep, id: uuid.UUID) -> Any:
    flat = session.get(Flat, id)
    if not flat:
        raise HTTPException(status_code=404, detail="Flat not found")
    return flat


@router.post("/", response_model=FlatPublic, dependencies=[Depends(require_cargo(2))])
def create_flat(*, session: SessionDep, flat_in: FlatCreate) -> Any:
    flat = Flat.model_validate(flat_in)
    session.add(flat)
    session.commit()
    session.refresh(flat)
    return flat


@router.patch("/{id}", response_model=FlatPublic, dependencies=[Depends(require_cargo(2))])
def update_flat(*, session: SessionDep, id: uuid.UUID, flat_in: FlatUpdate) -> Any:
    flat = session.get(Flat, id)
    if not flat:
        raise HTTPException(status_code=404, detail="Flat not found")
    update_dict = flat_in.model_dump(exclude_unset=True)
    flat.sqlmodel_update(update_dict)
    session.add(flat)
    session.commit()
    session.refresh(flat)
    return flat


@router.delete("/{id}", response_model=Message, dependencies=[Depends(require_cargo(2))])
def delete_flat(session: SessionDep, id: uuid.UUID) -> Message:
    flat = session.get(Flat, id)
    if not flat:
        raise HTTPException(status_code=404, detail="Flat not found")
    session.delete(flat)
    session.commit()
    return Message(message="Flat deleted successfully")
