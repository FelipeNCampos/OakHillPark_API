import datetime
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc
from sqlmodel import col, func, select

from app.api.deps import SessionDep, require_cargo
from app.models import (
    Acess,
    AcessActiveStatus,
    AcessCreate,
    AcessesPublic,
    AcessPublic,
    AcessUpdate,
    Funcionario,
    Message,
)

router = APIRouter(prefix="/acess", tags=["acess"])


def get_default_funcionario(session: SessionDep, cargo: int) -> Funcionario | None:
    funcionario = session.exec(
        select(Funcionario)
        .where(
            Funcionario.cargo == cargo,
            Funcionario.status,
            Funcionario.is_default,
        )
        .limit(1)
    ).first()

    if funcionario:
        return funcionario

    return session.exec(
        select(Funcionario)
        .where(Funcionario.cargo == cargo, Funcionario.status)
        .limit(1)
    ).first()


def get_last_acess(session: SessionDep, funcionario_id: uuid.UUID) -> Acess | None:
    return session.exec(
        select(Acess)
        .where(Acess.funcionario_id == funcionario_id)
        .order_by(desc(col(Acess.data)))
        .limit(1)
    ).first()


@router.get("/active", response_model=AcessActiveStatus)
def read_active_acess(session: SessionDep) -> Any:
    default_cleaner = get_default_funcionario(session, 0)

    if not default_cleaner:
        return AcessActiveStatus(has_open_session=False, building_id=None)

    last_acess = get_last_acess(session, default_cleaner.id)

    if last_acess and last_acess.operacao == 0:
        return AcessActiveStatus(
            has_open_session=True,
            building_id=last_acess.building_id,
        )

    return AcessActiveStatus(has_open_session=False, building_id=None)


@router.get("/caretaker/active", response_model=AcessActiveStatus)
def read_active_caretaker(session: SessionDep) -> Any:
    caretaker = get_default_funcionario(session, 1)

    if not caretaker:
        return AcessActiveStatus(has_open_session=False, building_id=None)

    last_acess = get_last_acess(session, caretaker.id)

    if last_acess and last_acess.operacao == 0:
        return AcessActiveStatus(
            has_open_session=True,
            building_id=last_acess.building_id,
        )

    return AcessActiveStatus(has_open_session=False, building_id=None)


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
    default_cleaner = get_default_funcionario(session, 0)

    if not default_cleaner:
        raise HTTPException(status_code=404, detail="Default cleaner not found")
    last_acess = get_last_acess(session, default_cleaner.id)

    if acess_in.operacao == 0:
        if last_acess and last_acess.operacao == 0:
            if last_acess.building_id == acess_in.building_id:
                raise HTTPException(
                    status_code=400,
                    detail="Cleaner already has an open session",
                )
            auto_close = {
                "id": uuid.uuid4(),
                "status": True,
                "data": datetime.datetime.now(),
                "operacao": 1,
                "building_id": last_acess.building_id,
                "funcionario_id": default_cleaner.id,
            }
            auto_close_acess = Acess.model_validate(auto_close)
            auto_close_acess.funcionario_id = default_cleaner.id
            session.add(auto_close_acess)
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


@router.post("/caretaker", response_model=AcessPublic)
def create_caretaker_acess(*, session: SessionDep, acess_in: AcessCreate) -> Any:
    caretaker = get_default_funcionario(session, 1)

    if not caretaker:
        raise HTTPException(status_code=404, detail="Default caretaker not found")

    last_acess = get_last_acess(session, caretaker.id)

    if acess_in.operacao == 0:
        if last_acess and last_acess.operacao == 0:
            if last_acess.building_id == acess_in.building_id:
                raise HTTPException(
                    status_code=400,
                    detail="Caretaker already has an open session",
                )
            auto_close = {
                "id": uuid.uuid4(),
                "status": True,
                "data": datetime.datetime.now(),
                "operacao": 1,
                "building_id": last_acess.building_id,
                "funcionario_id": caretaker.id,
            }
            auto_close_acess = Acess.model_validate(auto_close)
            auto_close_acess.funcionario_id = caretaker.id
            session.add(auto_close_acess)

    if acess_in.operacao == 1:
        if last_acess is None:
            raise HTTPException(
                status_code=400,
                detail="Caretaker does not have an open session to close",
            )
        if last_acess.operacao == 1:
            raise HTTPException(
                status_code=400,
                detail="Caretaker does not have an open session to close",
            )

    final: dict = {
        "id": uuid.uuid4(),
        "status": True,
        "data": datetime.datetime.now(),
        "operacao": acess_in.operacao,
        "building_id": acess_in.building_id,
        "funcionario_id": caretaker.id,
    }

    acess = Acess.model_validate(final)
    acess.funcionario_id = caretaker.id
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
