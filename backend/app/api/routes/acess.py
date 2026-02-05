import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

from app.api.deps import SessionDep, require_cargo
from app.models import Acess, AcessCreate, AcessPublic, AcessUpdate, AcessesPublic, Funcionario, Message

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
            Funcionario.status == True,
            Funcionario.is_default == True,
        )
        .limit(1)
    ).first()

    if not default_cleaner:
        default_cleaner = session.exec(
            select(Funcionario)
            .where(Funcionario.cargo == 0, Funcionario.status == True)
            .limit(1)
        ).first()

    if not default_cleaner:
        raise HTTPException(status_code=404, detail="Default cleaner not found")

    if acess_in.operacao == 0:
        last_acess = session.exec(
            select(Acess)
            .where(Acess.funcionario_id == default_cleaner.id)
            .order_by(Acess.data.desc())
            .limit(1)
        ).first()
        if last_acess and last_acess.operacao == 0:
            raise HTTPException(
                status_code=400,
                detail="Cleaner already has an open session",
            )

    acess = Acess.model_validate(acess_in)
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
