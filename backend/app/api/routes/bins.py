import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import func, select

from app.api.deps import SessionDep, get_current_user, require_cargo
from app.models import (
    BinMissCollection,
    BinMissCollectionCreate,
    BinMissCollectionPublic,
    BinMissCollectionsPublic,
    Building,
    Message,
    User,
)

router = APIRouter(prefix="/bins", tags=["bins"])


@router.post("/", response_model=Message, status_code=201)
def create_bin_miss_collection(
    *, session: SessionDep, payload: BinMissCollectionCreate
) -> Message:
    building = session.get(Building, payload.building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")

    item = BinMissCollection.model_validate(payload)
    session.add(item)
    session.commit()
    return Message(message="Miss collection recorded")


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
            building_id=item.building_id,
            building_nome=building.nome,
        )
        for item, building in rows
    ]
    return BinMissCollectionsPublic(data=data, count=count)
