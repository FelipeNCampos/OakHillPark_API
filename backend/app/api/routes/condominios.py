import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

from app.api.deps import SessionDep, require_cargo
from app.models import (
    Condominio,
    CondominioCreate,
    CondominioPublic,
    CondominioUpdate,
    CondominiosPublic,
    Message,
)

router = APIRouter(prefix="/condominios", tags=["condominios"])


@router.get("/", response_model=CondominiosPublic, dependencies=[Depends(require_cargo(3))])
def read_condominios(session: SessionDep, skip: int = 0, limit: int = 100) -> Any:
    count_statement = select(func.count()).select_from(Condominio)
    count = session.exec(count_statement).one()
    statement = select(Condominio).offset(skip).limit(limit)
    condominios = session.exec(statement).all()
    return CondominiosPublic(data=condominios, count=count)


@router.get("/{id}", response_model=CondominioPublic, dependencies=[Depends(require_cargo(3))])
def read_condominio(session: SessionDep, id: uuid.UUID) -> Any:
    condominio = session.get(Condominio, id)
    if not condominio:
        raise HTTPException(status_code=404, detail="Condominio not found")
    return condominio


@router.post("/", response_model=CondominioPublic, dependencies=[Depends(require_cargo(3))])
def create_condominio(*, session: SessionDep, condominio_in: CondominioCreate) -> Any:
    condominio = Condominio.model_validate(condominio_in)
    session.add(condominio)
    session.commit()
    session.refresh(condominio)
    return condominio


@router.patch("/{id}", response_model=CondominioPublic, dependencies=[Depends(require_cargo(3))])
def update_condominio(
    *, session: SessionDep, id: uuid.UUID, condominio_in: CondominioUpdate
) -> Any:
    condominio = session.get(Condominio, id)
    if not condominio:
        raise HTTPException(status_code=404, detail="Condominio not found")
    update_dict = condominio_in.model_dump(exclude_unset=True)
    condominio.sqlmodel_update(update_dict)
    session.add(condominio)
    session.commit()
    session.refresh(condominio)
    return condominio


@router.delete("/{id}", response_model=Message, dependencies=[Depends(require_cargo(3))])
def delete_condominio(session: SessionDep, id: uuid.UUID) -> Message:
    condominio = session.get(Condominio, id)
    if not condominio:
        raise HTTPException(status_code=404, detail="Condominio not found")
    session.delete(condominio)
    session.commit()
    return Message(message="Condominio deleted successfully")
