import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

from app.api.deps import SessionDep, require_cargo
from app.models import (
    Message,
    Morador,
    MoradorCreate,
    MoradorPublic,
    MoradorUpdate,
    MoradoresPublic,
)

router = APIRouter(prefix="/moradores", tags=["moradores"])


@router.get("/", response_model=MoradoresPublic, dependencies=[Depends(require_cargo(2))])
def read_moradores(session: SessionDep, skip: int = 0, limit: int = 100) -> Any:
    count_statement = select(func.count()).select_from(Morador)
    count = session.exec(count_statement).one()
    statement = select(Morador).offset(skip).limit(limit)
    moradores = session.exec(statement).all()
    return MoradoresPublic(data=moradores, count=count)


@router.get("/{id}", response_model=MoradorPublic, dependencies=[Depends(require_cargo(2))])
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


@router.delete("/{id}", response_model=Message, dependencies=[Depends(require_cargo(2))])
def delete_morador(session: SessionDep, id: uuid.UUID) -> Message:
    morador = session.get(Morador, id)
    if not morador:
        raise HTTPException(status_code=404, detail="Morador not found")
    session.delete(morador)
    session.commit()
    return Message(message="Morador deleted successfully")
