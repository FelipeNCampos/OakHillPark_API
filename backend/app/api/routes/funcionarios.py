import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep, require_cargo
from app.models import (
    Funcionario,
    FuncionarioCreate,
    FuncionarioPublic,
    FuncionarioUpdate,
    FuncionariosPublic,
    Message,
)


def _unset_other_defaults(
    session: SessionDep,
    condominio_id: uuid.UUID,
    cargo: int,
    current_id: uuid.UUID | None = None,
) -> None:
    statement = select(Funcionario).where(
        Funcionario.condominio_id == condominio_id,
        Funcionario.cargo == cargo,
        Funcionario.is_default.is_(True),
    )
    if current_id:
        statement = statement.where(Funcionario.id != current_id)

    defaults = session.exec(statement).all()
    for funcionario in defaults:
        funcionario.is_default = False
        session.add(funcionario)

router = APIRouter(prefix="/funcionarios", tags=["funcionarios"])


@router.get("/", response_model=FuncionariosPublic, dependencies=[Depends(require_cargo(2))])
def read_funcionarios(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    condition = Funcionario.condominio_id == current_user.condominio_id
    count_statement = select(func.count()).select_from(Funcionario).where(condition)
    count = session.exec(count_statement).one()
    statement = select(Funcionario).where(condition).offset(skip).limit(limit)
    funcionarios = session.exec(statement).all()
    return FuncionariosPublic(data=funcionarios, count=count)


@router.get("/{id}", response_model=FuncionarioPublic, dependencies=[Depends(require_cargo(2))])
def read_funcionario(session: SessionDep, id: uuid.UUID) -> Any:
    funcionario = session.get(Funcionario, id)
    if not funcionario:
        raise HTTPException(status_code=404, detail="Funcionario not found")
    return funcionario


@router.post("/", response_model=FuncionarioPublic, dependencies=[Depends(require_cargo(2))])
def create_funcionario(
    *, session: SessionDep, funcionario_in: FuncionarioCreate
) -> Any:
    funcionario = Funcionario.model_validate(funcionario_in)
    if funcionario.is_default:
        _unset_other_defaults(session, funcionario.condominio_id, funcionario.cargo)
    session.add(funcionario)
    session.commit()
    session.refresh(funcionario)
    return funcionario


@router.patch("/{id}", response_model=FuncionarioPublic, dependencies=[Depends(require_cargo(2))])
def update_funcionario(
    *, session: SessionDep, id: uuid.UUID, funcionario_in: FuncionarioUpdate
) -> Any:
    funcionario = session.get(Funcionario, id)
    if not funcionario:
        raise HTTPException(status_code=404, detail="Funcionario not found")
    update_dict = funcionario_in.model_dump(exclude_unset=True)
    if update_dict.get("is_default") is True:
        _unset_other_defaults(
            session,
            funcionario.condominio_id,
            update_dict.get("cargo", funcionario.cargo),
            funcionario.id,
        )
    funcionario.sqlmodel_update(update_dict)
    session.add(funcionario)
    session.commit()
    session.refresh(funcionario)
    return funcionario


@router.delete("/{id}", response_model=Message, dependencies=[Depends(require_cargo(2))])
def delete_funcionario(session: SessionDep, id: uuid.UUID) -> Message:
    funcionario = session.get(Funcionario, id)
    if not funcionario:
        raise HTTPException(status_code=404, detail="Funcionario not found")
    session.delete(funcionario)
    session.commit()
    return Message(message="Funcionario deleted successfully")
