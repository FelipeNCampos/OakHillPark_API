import datetime
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc
from sqlmodel import col, func, select

from app.api.deps import SessionDep, require_cargo
from app.models import (
    Acess,
    AcessCreate,
    AcessesPublic,
    AcessPublic,
    AcessUpdate,
    Funcionario,
    Message,
)

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


@router.post("/", response_model=AcessPublic)
def create_acess(*, session: SessionDep, acess_in: AcessCreate) -> Any:
    default_cleaner = session.exec(
        select(Funcionario)
        .where(
            Funcionario.cargo == 0,
            Funcionario.status,
            Funcionario.is_default,
        )
        .limit(1)
    ).first()

    if not default_cleaner:
        default_cleaner = session.exec(
            select(Funcionario)
            .where(Funcionario.cargo == 0, Funcionario.status)
            .limit(1)
        ).first()

    if not default_cleaner:
        raise HTTPException(status_code=404, detail="Default cleaner not found")
    last_acess = session.exec(
            select(Acess)
            .where(Acess.funcionario_id == default_cleaner.id)
            .order_by(desc(col(Acess.data)))
            .limit(1)
        ).first()

    if acess_in.operacao == 0:
        if (last_acess and last_acess.operacao == 0):
            raise HTTPException(
                status_code=400,
                detail="Cleaner already has an open session",
            )
    if acess_in.operacao == 1:
        if (last_acess is None) :
            raise HTTPException(
            status_code=400,
                detail="Cleaner does not have an open session to close",
            )
        if (last_acess.operacao == 1):
            raise HTTPException(
                status_code=400,
                detail="Cleaner does not have an open session to close",
            )
    final: dict = {
        "id": uuid.uuid4(),
        "status": True,
        "data": datetime.datetime.now(),
        "operacao": acess_in.operacao,
        "building_id": acess_in.building_id,
        "funcionario_id": default_cleaner.id,
    }

    acess = Acess.model_validate(final)
    acess.funcionario_id = default_cleaner.id
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
