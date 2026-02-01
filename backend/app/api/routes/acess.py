import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

from app.api.deps import SessionDep, require_cargo
from app.models import Acess, AcessCreate, AcessPublic, AcessUpdate, AcessesPublic, Message

router = APIRouter(prefix="/acess", tags=["acess"])


@router.get("/", response_model=AcessesPublic, dependencies=[Depends(require_cargo(1))])
def read_acess(session: SessionDep, skip: int = 0, limit: int = 100) -> Any:
    count_statement = select(func.count()).select_from(Acess)
    count = session.exec(count_statement).one()
    statement = select(Acess).offset(skip).limit(limit)
    acesses = session.exec(statement).all()
    return AcessesPublic(data=acesses, count=count)


@router.get("/{id}", response_model=AcessPublic, dependencies=[Depends(require_cargo(1))])
def read_acess_by_id(session: SessionDep, id: uuid.UUID) -> Any:
    acess = session.get(Acess, id)
    if not acess:
        raise HTTPException(status_code=404, detail="Acess not found")
    return acess


@router.post("/", response_model=AcessPublic, dependencies=[Depends(require_cargo(0))])
def create_acess(*, session: SessionDep, acess_in: AcessCreate) -> Any:
    acess = Acess.model_validate(acess_in)
    session.add(acess)
    session.commit()
    session.refresh(acess)
    return acess


@router.patch("/{id}", response_model=AcessPublic, dependencies=[Depends(require_cargo(1))])
def update_acess(*, session: SessionDep, id: uuid.UUID, acess_in: AcessUpdate) -> Any:
    acess = session.get(Acess, id)
    if not acess:
        raise HTTPException(status_code=404, detail="Acess not found")
    update_dict = acess_in.model_dump(exclude_unset=True)
    acess.sqlmodel_update(update_dict)
    session.add(acess)
    session.commit()
    session.refresh(acess)
    return acess


@router.delete("/{id}", response_model=Message, dependencies=[Depends(require_cargo(1))])
def delete_acess(session: SessionDep, id: uuid.UUID) -> Message:
    acess = session.get(Acess, id)
    if not acess:
        raise HTTPException(status_code=404, detail="Acess not found")
    session.delete(acess)
    session.commit()
    return Message(message="Acess deleted successfully")
