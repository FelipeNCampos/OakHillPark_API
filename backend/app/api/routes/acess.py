import datetime
import logging
import re
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc
from sqlmodel import col, func, select

from app.api.deps import CurrentUser, SessionDep, get_current_user, require_cargo
from app.core.config import settings
from app.core.db import ensure_caretaker_monthly_goal_schema
from app.models import (
    Acess,
    AcessActiveStatus,
    AcessCreate,
    AcessesPublic,
    AcessPublic,
    AcessUpdate,
    Building,
    CaretakerMonthlyGoal,
    CaretakerMonthlyGoalCreate,
    CaretakerMonthlyGoalPublic,
    CaretakerMonthlyGoalsPublic,
    CaretakerMonthlyGoalUpdate,
    CaretakerMonthlyMetricPublic,
    CaretakerMonthlyMetricsPublic,
    Funcionario,
    Message,
    User,
    WorkTimeSession,
    WorkTimeSessionCreate,
    WorkTimeSessionPublic,
    WorkTimeSessionUpdate,
    WorkTimeSessionsPublic,
)
from app.utils import send_sms_notification

router = APIRouter(prefix="/acess", tags=["acess"])
logger = logging.getLogger(__name__)
E164_PHONE_REGEX = re.compile(r"^\+[1-9]\d{8,19}$")


def _is_cleaner_supported_building_name(building_name: str | None) -> bool:
    if not building_name:
        return False
    return building_name.strip().lower() != "office"


def get_default_funcionario(
    session: SessionDep,
    cargo: int,
    condominio_id: uuid.UUID | None = None,
) -> Funcionario | None:
    conditions = [Funcionario.cargo == cargo, Funcionario.status]
    if condominio_id:
        conditions.append(Funcionario.condominio_id == condominio_id)

    funcionario = session.exec(
        select(Funcionario)
        .where(
            *conditions,
            Funcionario.is_default,
        )
        .limit(1)
    ).first()

    if funcionario:
        return funcionario

    return session.exec(
        select(Funcionario)
        .where(*conditions)
        .limit(1)
    ).first()


def get_last_acess(session: SessionDep, funcionario_id: uuid.UUID) -> Acess | None:
    return session.exec(
        select(Acess)
        .where(Acess.funcionario_id == funcionario_id)
        .order_by(desc(col(Acess.data)), col(Acess.operacao).asc())
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


def has_open_work_time_session_at(
    session: SessionDep,
    funcionario_id: uuid.UUID,
    session_time: datetime.datetime,
) -> bool:
    last_session_before_time = session.exec(
        select(WorkTimeSession)
        .where(
            WorkTimeSession.funcionario_id == funcionario_id,
            WorkTimeSession.data < session_time,
        )
        .order_by(desc(col(WorkTimeSession.data)))
        .limit(1)
    ).first()
    return bool(last_session_before_time and last_session_before_time.operacao == 0)


def _has_work_time_operation_for_day(
    session: SessionDep,
    funcionario_id: uuid.UUID,
    target_date: datetime.date,
    operacao: int,
) -> bool:
    statement = (
        select(func.count())
        .select_from(WorkTimeSession)
        .where(
            WorkTimeSession.funcionario_id == funcionario_id,
            WorkTimeSession.operacao == operacao,
            func.date(WorkTimeSession.data) == target_date,
        )
    )
    return session.exec(statement).one() > 0


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
    excluded_names = {"office", "general", "cleaner"}
    building_ids = set(
        session.exec(
            select(Building.id).where(
                Building.condominio_id == cleaner.condominio_id,
                func.lower(func.trim(Building.nome)).not_in(excluded_names),
            )
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


def _resolve_user_condominio_id(session: SessionDep, current_user: User) -> uuid.UUID | None:
    if current_user.condominio_id:
        return current_user.condominio_id

    if current_user.is_superuser:
        condominio_id = session.exec(select(Funcionario.condominio_id).limit(1)).first()
        if condominio_id:
            current_user.condominio_id = condominio_id
            session.add(current_user)
            session.commit()
            session.refresh(current_user)
            return condominio_id

    return None


def _to_month_start(value: datetime.date | datetime.datetime) -> datetime.date:
    if isinstance(value, datetime.datetime):
        if value.tzinfo is not None:
            value = value.astimezone(datetime.timezone.utc).date()
        else:
            value = value.date()
    return datetime.date(value.year, value.month, 1)


def _iter_month_starts(
    start_month: datetime.date, end_month: datetime.date
) -> list[datetime.date]:
    cursor = _to_month_start(start_month)
    end = _to_month_start(end_month)
    months: list[datetime.date] = []

    while cursor <= end:
        months.append(cursor)
        if cursor.month == 12:
            cursor = datetime.date(cursor.year + 1, 1, 1)
        else:
            cursor = datetime.date(cursor.year, cursor.month + 1, 1)

    return months


def _build_closed_work_time_pairs(
    records: list[WorkTimeSession],
) -> list[tuple[WorkTimeSession, WorkTimeSession]]:
    sorted_records = sorted(
        (record for record in records if record.data),
        key=lambda record: (record.data, record.operacao),
    )
    pairs: list[tuple[WorkTimeSession, WorkTimeSession]] = []
    open_record: WorkTimeSession | None = None

    for record in sorted_records:
        if record.operacao == 0:
            if open_record is None:
                open_record = record
            continue

        if open_record is not None:
            pairs.append((open_record, record))
            open_record = None

    return pairs


def _get_closed_session_hours(
    in_record: WorkTimeSession, out_record: WorkTimeSession
) -> float:
    if not in_record.data or not out_record.data:
        return 0

    start = in_record.data
    end = out_record.data
    if end < start:
        return 0

    diff_hours = (end - start).total_seconds() / 3600
    if diff_hours >= 24:
        return 0
    return diff_hours


def _round_hours(value: float) -> float:
    return round(value + 1e-9, 2)


def _build_caretaker_monthly_metrics(
    records: list[WorkTimeSession],
    goals: list[CaretakerMonthlyGoal],
) -> list[CaretakerMonthlyMetricPublic]:
    worked_hours_by_month: dict[datetime.date, float] = {}
    for in_record, out_record in _build_closed_work_time_pairs(records):
        month_start = _to_month_start(in_record.data)
        worked_hours_by_month[month_start] = (
            worked_hours_by_month.get(month_start, 0) +
            _get_closed_session_hours(in_record, out_record)
        )

    target_hours_by_month = {
        _to_month_start(goal.month_start): goal.target_hours for goal in goals
    }

    current_month = _to_month_start(datetime.datetime.now(datetime.timezone.utc))
    all_months = {
        *worked_hours_by_month.keys(),
        *target_hours_by_month.keys(),
        current_month,
    }
    if not all_months:
        return []

    month_sequence = _iter_month_starts(min(all_months), max(all_months))
    metrics: list[CaretakerMonthlyMetricPublic] = []

    for month_start in month_sequence:
        target_hours = float(target_hours_by_month.get(month_start, 0))
        worked_hours = float(worked_hours_by_month.get(month_start, 0))
        effective_target_hours = target_hours
        remaining_hours = max(effective_target_hours - worked_hours, 0)

        metrics.append(
            CaretakerMonthlyMetricPublic(
                month_start=month_start,
                worked_hours=_round_hours(worked_hours),
                target_hours=_round_hours(target_hours),
                carry_over_hours=0,
                effective_target_hours=_round_hours(effective_target_hours),
                remaining_hours=_round_hours(remaining_hours),
            )
        )

    return metrics


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

    building = session.get(Building, acess_in.building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    if not _is_cleaner_supported_building_name(building.nome):
        raise HTTPException(
            status_code=400,
            detail="Office is not valid for cleaner access",
        )

    is_manual_backfill = "data" in acess_in.model_fields_set
    access_time = acess_in.data if is_manual_backfill else datetime.datetime.now()
    access_date = access_time.date()
    should_send_cleaner_in_sms = (
        not is_manual_backfill
        and acess_in.operacao == 0
        and not _has_cleaner_in_for_day(session, default_cleaner.id, access_date)
    )
    had_completed_all_buildings = False
    if not is_manual_backfill and acess_in.operacao == 1:
        had_completed_all_buildings = _has_all_buildings_cleaner_in_and_out_for_day(
            session, default_cleaner, access_date
        )

    last_acess = (
        get_last_acess(session, default_cleaner.id)
        if not is_manual_backfill
        else None
    )

    if not is_manual_backfill and acess_in.operacao == 0:
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
    if not is_manual_backfill and acess_in.operacao == 1:
        if last_acess is None:
            raise HTTPException(
                status_code=400,
                detail="Cleaner does not have an open session to close",
            )
        if last_acess.operacao == 1:
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
        not is_manual_backfill
        and acess_in.operacao == 1
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
def read_active_caretaker_work_time(
    session: SessionDep, condominio_id: uuid.UUID
) -> Any:
    caretaker = get_default_funcionario(session, 1, condominio_id)
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
    caretaker = get_default_funcionario(session, 1, payload.condominio_id)
    if not caretaker:
        raise HTTPException(status_code=404, detail="Default caretaker not found")

    if payload.operacao not in {0, 1}:
        raise HTTPException(status_code=422, detail="Invalid operacao")

    session_time = payload.data if payload.data else datetime.datetime.now(datetime.timezone.utc)
    session_date = session_time.date()
    has_open_session_at_time = has_open_work_time_session_at(
        session,
        caretaker.id,
        session_time,
    )
    should_send_caretaker_in_sms = (
        payload.operacao == 0
        and not _has_work_time_operation_for_day(
            session,
            caretaker.id,
            session_date,
            0,
        )
    )
    should_send_caretaker_out_sms = (
        payload.operacao == 1
        and not _has_work_time_operation_for_day(
            session,
            caretaker.id,
            session_date,
            1,
        )
    )

    if payload.operacao == 0 and has_open_session_at_time:
        raise HTTPException(status_code=400, detail="Caretaker already has an open work time session")

    if payload.operacao == 1 and not has_open_session_at_time:
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

    if should_send_caretaker_in_sms:
        _send_staff_status_sms("Caretaker IN")
    elif should_send_caretaker_out_sms:
        _send_staff_status_sms("Caretaker OUT")

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


@router.get(
    "/caretaker/work-time/goals",
    response_model=CaretakerMonthlyGoalsPublic,
    dependencies=[Depends(require_cargo(1))],
)
def read_caretaker_work_time_goals(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> Any:
    ensure_caretaker_monthly_goal_schema(session)
    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        return CaretakerMonthlyGoalsPublic(data=[], count=0)

    statement = (
        select(CaretakerMonthlyGoal)
        .where(CaretakerMonthlyGoal.condominio_id == condominio_id)
        .order_by(CaretakerMonthlyGoal.month_start.asc())
    )
    rows = session.exec(statement).all()
    data = [
        CaretakerMonthlyGoalPublic(
            id=item.id,
            month_start=item.month_start,
            target_hours=item.target_hours,
            condominio_id=item.condominio_id,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )
        for item in rows
    ]
    return CaretakerMonthlyGoalsPublic(data=data, count=len(data))


@router.post(
    "/caretaker/work-time/goals",
    response_model=CaretakerMonthlyGoalPublic,
    dependencies=[Depends(require_cargo(2))],
)
def upsert_caretaker_work_time_goal(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: CaretakerMonthlyGoalCreate,
) -> Any:
    ensure_caretaker_monthly_goal_schema(session)
    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="Condominio not found")

    month_start = _to_month_start(payload.month_start)
    existing = session.exec(
        select(CaretakerMonthlyGoal).where(
            CaretakerMonthlyGoal.condominio_id == condominio_id,
            CaretakerMonthlyGoal.month_start == month_start,
        )
    ).first()

    if existing:
        existing.target_hours = payload.target_hours
        existing.updated_at = datetime.datetime.now(datetime.timezone.utc)
        session.add(existing)
        session.commit()
        session.refresh(existing)
        item = existing
    else:
        item = CaretakerMonthlyGoal(
            month_start=month_start,
            target_hours=payload.target_hours,
            condominio_id=condominio_id,
        )
        session.add(item)
        session.commit()
        session.refresh(item)

    return CaretakerMonthlyGoalPublic(
        id=item.id,
        month_start=item.month_start,
        target_hours=item.target_hours,
        condominio_id=item.condominio_id,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.patch(
    "/caretaker/work-time/goals/{id}",
    response_model=CaretakerMonthlyGoalPublic,
    dependencies=[Depends(require_cargo(2))],
)
def update_caretaker_work_time_goal(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    payload: CaretakerMonthlyGoalUpdate,
) -> Any:
    ensure_caretaker_monthly_goal_schema(session)
    item = session.get(CaretakerMonthlyGoal, id)
    if not item:
        raise HTTPException(status_code=404, detail="Caretaker monthly goal not found")

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not current_user.is_superuser and item.condominio_id != condominio_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    update_dict = payload.model_dump(exclude_unset=True)
    if not update_dict:
        raise HTTPException(status_code=422, detail="No fields to update")

    next_month_start = (
        _to_month_start(payload.month_start)
        if payload.month_start is not None
        else item.month_start
    )
    duplicate = session.exec(
        select(CaretakerMonthlyGoal).where(
            CaretakerMonthlyGoal.condominio_id == item.condominio_id,
            CaretakerMonthlyGoal.month_start == next_month_start,
            CaretakerMonthlyGoal.id != item.id,
        )
    ).first()
    if duplicate:
        raise HTTPException(
            status_code=400,
            detail="A goal already exists for the selected month",
        )

    item.month_start = next_month_start
    if payload.target_hours is not None:
        item.target_hours = payload.target_hours
    item.updated_at = datetime.datetime.now(datetime.timezone.utc)
    session.add(item)
    session.commit()
    session.refresh(item)

    return CaretakerMonthlyGoalPublic(
        id=item.id,
        month_start=item.month_start,
        target_hours=item.target_hours,
        condominio_id=item.condominio_id,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.delete(
    "/caretaker/work-time/goals/{id}",
    response_model=Message,
    dependencies=[Depends(require_cargo(2))],
)
def delete_caretaker_work_time_goal(
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
) -> Message:
    ensure_caretaker_monthly_goal_schema(session)
    item = session.get(CaretakerMonthlyGoal, id)
    if not item:
        raise HTTPException(status_code=404, detail="Caretaker monthly goal not found")

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not current_user.is_superuser and item.condominio_id != condominio_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    session.delete(item)
    session.commit()
    return Message(message="Caretaker monthly goal deleted successfully")


@router.get(
    "/caretaker/work-time/monthly-metrics",
    response_model=CaretakerMonthlyMetricsPublic,
    dependencies=[Depends(require_cargo(1))],
)
def read_caretaker_work_time_monthly_metrics(
    session: SessionDep,
    current_user: User = Depends(get_current_user),
) -> Any:
    ensure_caretaker_monthly_goal_schema(session)
    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        return CaretakerMonthlyMetricsPublic(data=[], count=0)

    caretaker = get_default_funcionario(session, 1, condominio_id)
    if not caretaker or caretaker.condominio_id != condominio_id:
        return CaretakerMonthlyMetricsPublic(data=[], count=0)

    records = session.exec(
        select(WorkTimeSession)
        .where(WorkTimeSession.funcionario_id == caretaker.id)
        .order_by(WorkTimeSession.data.asc())
    ).all()
    goals = session.exec(
        select(CaretakerMonthlyGoal)
        .where(CaretakerMonthlyGoal.condominio_id == condominio_id)
        .order_by(CaretakerMonthlyGoal.month_start.asc())
    ).all()

    data = _build_caretaker_monthly_metrics(records, goals)
    return CaretakerMonthlyMetricsPublic(data=data, count=len(data))


@router.patch(
    "/caretaker/work-time/{id}",
    response_model=WorkTimeSessionPublic,
    dependencies=[Depends(require_cargo(2))],
)
def update_caretaker_work_time(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
    payload: WorkTimeSessionUpdate,
) -> Any:
    item = session.get(WorkTimeSession, id)
    if not item:
        raise HTTPException(status_code=404, detail="Work time session not found")

    funcionario = session.get(Funcionario, item.funcionario_id)
    if not funcionario or funcionario.cargo != 1:
        raise HTTPException(status_code=404, detail="Caretaker work time session not found")

    if not current_user.is_superuser and (
        current_user.condominio_id != funcionario.condominio_id
    ):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    update_dict = payload.model_dump(exclude_unset=True)
    if not update_dict:
        raise HTTPException(status_code=422, detail="No fields to update")

    item.sqlmodel_update(update_dict)
    session.add(item)
    session.commit()
    session.refresh(item)

    return WorkTimeSessionPublic(
        id=item.id,
        status=item.status,
        data=item.data,
        operacao=item.operacao,
        funcionario_id=item.funcionario_id,
    )


@router.delete(
    "/caretaker/work-time/{id}",
    response_model=Message,
    dependencies=[Depends(require_cargo(2))],
)
def delete_caretaker_work_time(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    id: uuid.UUID,
) -> Message:
    item = session.get(WorkTimeSession, id)
    if not item:
        raise HTTPException(status_code=404, detail="Work time session not found")

    funcionario = session.get(Funcionario, item.funcionario_id)
    if not funcionario or funcionario.cargo != 1:
        raise HTTPException(status_code=404, detail="Caretaker work time session not found")

    if not current_user.is_superuser and (
        current_user.condominio_id != funcionario.condominio_id
    ):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    session.delete(item)
    session.commit()
    return Message(message="Work time session deleted successfully")


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
