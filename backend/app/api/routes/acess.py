import datetime
import logging
import re
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc
from sqlmodel import col, func, select

from app.api.deps import SessionDep, get_current_user, require_cargo
from app.core.config import settings
from app.models import (
    Acess,
    AcessActiveStatus,
    AcessCreate,
    AcessesPublic,
    AcessPublic,
    AcessUpdate,
    Building,
    Funcionario,
    Message,
    User,
    WorkTimeSession,
    WorkTimeSessionCreate,
    WorkTimeSessionPublic,
    WorkTimeSessionsPublic,
)
from app.utils import send_sms_notification

router = APIRouter(prefix="/acess", tags=["acess"])
logger = logging.getLogger(__name__)
E164_PHONE_REGEX = re.compile(r"^\+[1-9]\d{8,19}$")


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


def get_last_work_time_session(
    session: SessionDep, funcionario_id: uuid.UUID
) -> WorkTimeSession | None:
    return session.exec(
        select(WorkTimeSession)
        .where(WorkTimeSession.funcionario_id == funcionario_id)
        .order_by(desc(col(WorkTimeSession.data)))
        .limit(1)
    ).first()


def _has_cleaner_in_for_day(
    session: SessionDep,
    funcionario_id: uuid.UUID,
    target_date: datetime.date,
) -> bool:
    statement = (
        select(func.count())
        .select_from(Acess)
        .where(
            Acess.funcionario_id == funcionario_id,
            Acess.operacao == 0,
            func.date(Acess.data) == target_date,
        )
    )
    return session.exec(statement).one() > 0


def _has_all_buildings_cleaner_in_and_out_for_day(
    session: SessionDep,
    cleaner: Funcionario,
    target_date: datetime.date,
) -> bool:
    building_ids = set(
        session.exec(
            select(Building.id).where(Building.condominio_id == cleaner.condominio_id)
        ).all()
    )
    if not building_ids:
        return False

    day_accesses = session.exec(
        select(Acess.building_id, Acess.operacao).where(
            Acess.funcionario_id == cleaner.id,
            func.date(Acess.data) == target_date,
        )
    ).all()

    operations_by_building: dict[uuid.UUID, set[int]] = {}
    for building_id, operacao in day_accesses:
        operations_by_building.setdefault(building_id, set()).add(operacao)

    return all(
        {0, 1}.issubset(operations_by_building.get(building_id, set()))
        for building_id in building_ids
    )


def _normalize_status_sms_phone(
    raw_phone: str | None, default_country_code: str = "+44"
) -> str | None:
    if raw_phone is None:
        return None

    cleaned = re.sub(r"[^\d+]", "", str(raw_phone).strip())
    if not cleaned:
        return None
    if cleaned.startswith("+"):
        return cleaned if E164_PHONE_REGEX.fullmatch(cleaned) else None

    digits_only = re.sub(r"\D", "", cleaned)
    if digits_only.startswith("0"):
        digits_only = digits_only[1:]
    normalized = f"{default_country_code}{digits_only}"
    return normalized if E164_PHONE_REGEX.fullmatch(normalized) else None


def _send_staff_status_sms(body: str) -> None:
    phone_to = _normalize_status_sms_phone(settings.CLEANER_STATUS_SMS_TO)
    if not phone_to:
        logger.info(
            "Skipping cleaner status SMS because CLEANER_STATUS_SMS_TO is not configured"
        )
        return

    try:
        send_sms_notification(phone_to=phone_to, body=body)
    except Exception:
        logger.exception("Failed to send staff status SMS", extra={"body": body})


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
    statement = (
        select(Acess)
        .order_by(desc(col(Acess.data)))
        .offset(skip)
        .limit(limit)
    )
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

    access_time = datetime.datetime.now()
    access_date = access_time.date()
    should_send_cleaner_in_sms = (
        acess_in.operacao == 0
        and not _has_cleaner_in_for_day(session, default_cleaner.id, access_date)
    )
    had_completed_all_buildings = False
    if acess_in.operacao == 1:
        had_completed_all_buildings = _has_all_buildings_cleaner_in_and_out_for_day(
            session, default_cleaner, access_date
        )

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
                "data": access_time,
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
        "data": access_time,
        "operacao": acess_in.operacao,
        "building_id": acess_in.building_id,
        "funcionario_id": default_cleaner.id,
    }

    acess = Acess.model_validate(final)
    acess.funcionario_id = default_cleaner.id
    session.add(acess)
    session.commit()
    session.refresh(acess)

    if should_send_cleaner_in_sms:
        _send_staff_status_sms("Cleaner IN")
    elif (
        acess_in.operacao == 1
        and not had_completed_all_buildings
        and _has_all_buildings_cleaner_in_and_out_for_day(
            session, default_cleaner, access_date
        )
    ):
        _send_staff_status_sms("Cleaner OUT")

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


@router.get("/caretaker/work-time/active", response_model=AcessActiveStatus)
def read_active_caretaker_work_time(session: SessionDep) -> Any:
    caretaker = get_default_funcionario(session, 1)
    if not caretaker:
        return AcessActiveStatus(has_open_session=False, building_id=None)

    last_session = get_last_work_time_session(session, caretaker.id)
    if last_session and last_session.operacao == 0:
        return AcessActiveStatus(has_open_session=True, building_id=None)
    return AcessActiveStatus(has_open_session=False, building_id=None)


@router.post("/caretaker/work-time", response_model=WorkTimeSessionPublic, status_code=201)
def create_caretaker_work_time(
    *, session: SessionDep, payload: WorkTimeSessionCreate
) -> Any:
    caretaker = get_default_funcionario(session, 1)
    if not caretaker:
        raise HTTPException(status_code=404, detail="Default caretaker not found")

    if payload.operacao not in {0, 1}:
        raise HTTPException(status_code=422, detail="Invalid operacao")

    last_session = get_last_work_time_session(session, caretaker.id)
    session_time = payload.data if payload.data else datetime.datetime.now(datetime.timezone.utc)
    session_date = session_time.date()
    should_send_work_time_in_sms = (
        payload.operacao == 0
        and not session.exec(
            select(func.count())
            .select_from(WorkTimeSession)
            .where(
                WorkTimeSession.funcionario_id == caretaker.id,
                WorkTimeSession.operacao == 0,
                func.date(WorkTimeSession.data) == session_date,
            )
        ).one()
    )

    if payload.operacao == 0 and last_session and last_session.operacao == 0:
        raise HTTPException(status_code=400, detail="Caretaker already has an open work time session")

    if payload.operacao == 1 and (last_session is None or last_session.operacao == 1):
        raise HTTPException(
            status_code=400,
            detail="Caretaker does not have an open work time session to close",
        )

    item = WorkTimeSession.model_validate(
        payload,
        update={
            "status": True,
            "data": session_time,
            "funcionario_id": caretaker.id,
        },
    )
    session.add(item)
    session.commit()
    session.refresh(item)

    if should_send_work_time_in_sms:
        _send_staff_status_sms("WORK TIME IN")
    elif payload.operacao == 1:
        _send_staff_status_sms("WORK TIME OUT")

    return WorkTimeSessionPublic(
        id=item.id,
        status=item.status,
        data=item.data,
        operacao=item.operacao,
        funcionario_id=item.funcionario_id,
    )


@router.get(
    "/caretaker/work-time",
    response_model=WorkTimeSessionsPublic,
    dependencies=[Depends(require_cargo(1))],
)
def read_caretaker_work_time(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    condominio_id = current_user.condominio_id
    conditions = [Funcionario.condominio_id == condominio_id, Funcionario.cargo == 1]

    count_statement = (
        select(func.count())
        .select_from(WorkTimeSession)
        .join(Funcionario, WorkTimeSession.funcionario_id == Funcionario.id)
        .where(*conditions)
    )
    count = session.exec(count_statement).one()

    statement = (
        select(WorkTimeSession)
        .join(Funcionario, WorkTimeSession.funcionario_id == Funcionario.id)
        .where(*conditions)
        .order_by(WorkTimeSession.data.desc())
        .offset(skip)
        .limit(limit)
    )
    rows = session.exec(statement).all()
    data = [
        WorkTimeSessionPublic(
            id=item.id,
            status=item.status,
            data=item.data,
            operacao=item.operacao,
            funcionario_id=item.funcionario_id,
        )
        for item in rows
    ]
    return WorkTimeSessionsPublic(data=data, count=count)


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
