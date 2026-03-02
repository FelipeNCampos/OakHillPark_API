import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

from app.api.deps import SessionDep, get_current_user, require_cargo
from app.models import (
    AcessActiveStatus,
    BinMissCollection,
    BinMissCollectionCreate,
    BinMissCollectionPublic,
    BinMissCollectionsPublic,
    BinSession,
    BinSessionCreate,
    BinSessionPublic,
    BinSessionsPublic,
    Building,
    Funcionario,
    Message,
    User,
)

router = APIRouter(prefix="/bins", tags=["bins"])


def get_default_caretaker(session: SessionDep) -> Funcionario | None:
    caretaker = session.exec(
        select(Funcionario)
        .where(
            Funcionario.cargo == 1,
            Funcionario.status,
            Funcionario.is_default,
        )
        .limit(1)
    ).first()
    if caretaker:
        return caretaker
    return session.exec(
        select(Funcionario)
        .where(Funcionario.cargo == 1, Funcionario.status)
        .limit(1)
    ).first()


def get_last_bin_session(session: SessionDep, funcionario_id: uuid.UUID) -> BinSession | None:
    return session.exec(
        select(BinSession)
        .where(BinSession.funcionario_id == funcionario_id)
        .order_by(BinSession.data.desc())
        .limit(1)
    ).first()


@router.get("/sessions/active", response_model=AcessActiveStatus)
def read_active_bin_session(session: SessionDep) -> Any:
    caretaker = get_default_caretaker(session)
    if not caretaker:
        return AcessActiveStatus(has_open_session=False, building_id=None)

    last_session = get_last_bin_session(session, caretaker.id)
    if last_session and last_session.operacao == 0:
        return AcessActiveStatus(
            has_open_session=True,
            building_id=last_session.building_id,
        )
    return AcessActiveStatus(has_open_session=False, building_id=None)


@router.post("/sessions", response_model=BinSessionPublic, status_code=201)
def create_bin_session(*, session: SessionDep, payload: BinSessionCreate) -> Any:
    caretaker = get_default_caretaker(session)
    if not caretaker:
        raise HTTPException(status_code=404, detail="Default caretaker not found")

    building = session.get(Building, payload.building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    if building.nome.strip().lower() == "office":
        raise HTTPException(status_code=400, detail="Office is not valid for bins collection")

    if payload.operacao not in {0, 1}:
        raise HTTPException(status_code=422, detail="Invalid operacao")

    last_session = get_last_bin_session(session, caretaker.id)
    if payload.operacao == 0:
        if last_session and last_session.operacao == 0:
            if last_session.building_id == payload.building_id:
                raise HTTPException(
                    status_code=400,
                    detail="Bins collection already has an open session",
                )
            auto_close = BinSession.model_validate(
                {
                    "status": True,
                    "operacao": 1,
                    "building_id": last_session.building_id,
                    "funcionario_id": caretaker.id,
                }
            )
            session.add(auto_close)

    if payload.operacao == 1:
        if last_session is None or last_session.operacao == 1:
            raise HTTPException(
                status_code=400,
                detail="Bins collection does not have an open session to close",
            )

    item = BinSession.model_validate(
        payload,
        update={
            "status": True,
            "funcionario_id": caretaker.id,
        },
    )
    session.add(item)
    session.commit()
    session.refresh(item)
    return BinSessionPublic(
        id=item.id,
        status=item.status,
        data=item.data,
        operacao=item.operacao,
        building_id=item.building_id,
        funcionario_id=item.funcionario_id,
        building_nome=building.nome,
    )


@router.get(
    "/sessions",
    response_model=BinSessionsPublic,
    dependencies=[Depends(require_cargo(1))],
)
def read_bin_sessions(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
    building_id: uuid.UUID | None = None,
) -> Any:
    condominio_id = current_user.condominio_id
    conditions = [Building.condominio_id == condominio_id]
    if building_id is not None:
        conditions.append(BinSession.building_id == building_id)

    count_statement = (
        select(func.count())
        .select_from(BinSession)
        .join(Building, BinSession.building_id == Building.id)
        .where(*conditions)
    )
    count = session.exec(count_statement).one()

    statement = (
        select(BinSession, Building)
        .join(Building, BinSession.building_id == Building.id)
        .where(*conditions)
        .order_by(BinSession.data.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = session.exec(statement).all()
    data = [
        BinSessionPublic(
            id=item.id,
            status=item.status,
            data=item.data,
            operacao=item.operacao,
            building_id=item.building_id,
            funcionario_id=item.funcionario_id,
            building_nome=building.nome,
        )
        for item, building in rows
    ]
    return BinSessionsPublic(data=data, count=count)


@router.post("/", response_model=Message, status_code=201)
def create_bin_miss_collection(
    *, session: SessionDep, payload: BinMissCollectionCreate
) -> Message:
    building = session.get(Building, payload.building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    normalized_type = payload.collection_type.strip().lower()
    if normalized_type not in {"general", "recycle"}:
        raise HTTPException(status_code=422, detail="Invalid collection_type")

    normalized_status = payload.collection_status.strip().lower()
    if normalized_status not in {"miss", "late"}:
        # Backward compatibility with legacy payload that only sent miss_collection
        normalized_status = "miss" if payload.miss_collection else "late"

    item = BinMissCollection.model_validate(
        payload,
        update={
            "collection_type": normalized_type,
            "collection_status": normalized_status,
            "miss_collection": normalized_status == "miss",
        },
    )
    session.add(item)
    session.commit()
    return Message(message="Bins collection record saved")


@router.get(
    "/",
    response_model=BinMissCollectionsPublic,
    dependencies=[Depends(require_cargo(1))],
)
def read_bin_miss_collections(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
    building_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    collection_type: str | None = None,
    collection_status: str | None = None,
) -> Any:
    condominio_id = current_user.condominio_id
    conditions = [Building.condominio_id == condominio_id]

    if building_id is not None:
        conditions.append(BinMissCollection.building_id == building_id)

    if date_from is not None:
        start = datetime.combine(date_from, time.min).replace(tzinfo=timezone.utc)
        conditions.append(BinMissCollection.data >= start)

    if date_to is not None:
        end = datetime.combine(date_to + timedelta(days=1), time.min).replace(
            tzinfo=timezone.utc
        )
        conditions.append(BinMissCollection.data < end)

    if collection_type is not None:
        conditions.append(BinMissCollection.collection_type == collection_type.lower())

    if collection_status is not None:
        conditions.append(BinMissCollection.collection_status == collection_status.lower())

    count_statement = (
        select(func.count())
        .select_from(BinMissCollection)
        .join(Building, BinMissCollection.building_id == Building.id)
        .where(*conditions)
    )
    count = session.exec(count_statement).one()

    statement = (
        select(BinMissCollection, Building)
        .join(Building, BinMissCollection.building_id == Building.id)
        .where(*conditions)
        .order_by(BinMissCollection.data.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = session.exec(statement).all()

    data = [
        BinMissCollectionPublic(
            id=item.id,
            data=item.data,
            miss_collection=item.miss_collection,
            collection_type=item.collection_type,
            collection_status=item.collection_status,
            building_id=item.building_id,
            building_nome=building.nome,
        )
        for item, building in rows
    ]
    return BinMissCollectionsPublic(data=data, count=count)
