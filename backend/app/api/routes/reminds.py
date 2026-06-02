import uuid
from datetime import date, datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep
from app.models import (
    Condominio,
    Funcionario,
    Reminder,
    ReminderCreate,
    ReminderExecutionSummary,
    ReminderPublic,
    RemindersPublic,
    ReminderUpdate,
    Task,
    User,
)
from app.utils import normalize_phone_to_e164, send_sms_notification

router = APIRouter(prefix="/reminds", tags=["reminds"])
REMINDER_SCHEDULE_UNITS = {"day", "week", "month"}
REMINDER_SCHEDULE_MODES = {"interval", "fixed"}
REMINDER_SMS_DISPATCH_HOUR = 8


def _is_manager(user: User) -> bool:
    return bool(user.is_superuser or user.cargo >= 2)


def _resolve_user_condominio_id(session: SessionDep, user: User):
    if user.condominio_id:
        return user.condominio_id
    condominio = session.exec(select(Condominio).limit(1)).first()
    if condominio:
        user.condominio_id = condominio.id
        session.add(user)
        session.commit()
        session.refresh(user)
        return condominio.id
    return None


def _reminder_to_public(reminder: Reminder) -> ReminderPublic:
    return ReminderPublic(
        id=reminder.id,
        name=reminder.name,
        schedule_unit=reminder.schedule_unit,
        schedule_mode=reminder.schedule_mode,
        interval_value=reminder.interval_value,
        weekday_mask=reminder.weekday_mask,
        month_mask=reminder.month_mask,
        is_active=reminder.is_active,
        action_sms=reminder.action_sms,
        sms_to=reminder.sms_to,
        sms_message=reminder.sms_message,
        action_task=reminder.action_task,
        task_title=reminder.task_title,
        task_description=reminder.task_description,
        task_priority=reminder.task_priority,
        condominio_id=reminder.condominio_id,
        created_by_user_id=reminder.created_by_user_id,
        last_triggered_on=reminder.last_triggered_on,
        last_triggered_at=reminder.last_triggered_at,
        created_at=reminder.created_at,
        updated_at=reminder.updated_at,
    )


def _validate_reminder_actions(
    *,
    action_sms: bool,
    sms_to: str | None,
    sms_message: str | None,
    action_task: bool,
    task_title: str | None,
) -> None:
    if not action_sms and not action_task:
        raise HTTPException(
            status_code=400, detail="Select at least one action (SMS or task)"
        )

    if action_sms:
        if not (sms_to or "").strip():
            raise HTTPException(
                status_code=400, detail="SMS destination is required for SMS action"
            )
        if not (sms_message or "").strip():
            raise HTTPException(
                status_code=400, detail="SMS message is required for SMS action"
            )

    if action_task and not (task_title or "").strip():
        raise HTTPException(
            status_code=400, detail="Task title is required for task action"
        )


def _normalize_reminder_sms_to(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = normalize_phone_to_e164(value)
    if not normalized:
        raise HTTPException(
            status_code=400,
            detail="SMS destination must be a valid phone number",
        )
    return normalized


def _validate_weekday_mask(weekday_mask: int) -> None:
    if weekday_mask < 1 or weekday_mask > 127:
        raise HTTPException(status_code=400, detail="Invalid weekday mask")


def _validate_month_mask(month_mask: int) -> None:
    if month_mask < 1 or month_mask > 4095:
        raise HTTPException(status_code=400, detail="Invalid month mask")


def _validate_schedule_config(
    *,
    schedule_unit: str,
    schedule_mode: str,
    interval_value: int | None,
    weekday_mask: int,
    month_mask: int | None,
) -> None:
    if schedule_unit not in REMINDER_SCHEDULE_UNITS:
        raise HTTPException(status_code=400, detail="Invalid schedule unit")
    if schedule_mode not in REMINDER_SCHEDULE_MODES:
        raise HTTPException(status_code=400, detail="Invalid schedule mode")

    if schedule_mode == "interval":
        if interval_value is None or interval_value < 1:
            raise HTTPException(
                status_code=400,
                detail="Interval value is required for interval mode",
            )
    if schedule_unit == "week" and schedule_mode == "fixed":
        _validate_weekday_mask(weekday_mask)
    if schedule_unit == "month" and schedule_mode == "fixed":
        if month_mask is None:
            raise HTTPException(
                status_code=400,
                detail="Select at least one month for fixed monthly reminders",
            )
        _validate_month_mask(month_mask)


def _start_of_week(value: date) -> date:
    return date.fromordinal(value.toordinal() - value.weekday())


def _month_index(value: date) -> int:
    return value.year * 12 + (value.month - 1)


def _is_reminder_due_today(reminder: Reminder, today_date: date) -> bool:
    schedule_unit = (reminder.schedule_unit or "week").strip().lower()
    schedule_mode = (reminder.schedule_mode or "fixed").strip().lower()

    if schedule_unit == "day":
        if schedule_mode == "fixed":
            return True
        if not reminder.interval_value:
            return False
        anchor_date = reminder.created_at.date()
        diff_days = (today_date - anchor_date).days
        return diff_days >= 0 and diff_days % reminder.interval_value == 0

    if schedule_unit == "week":
        if schedule_mode == "fixed":
            weekday_bit = 1 << today_date.weekday()
            if (reminder.weekday_mask & weekday_bit) == 0:
                return False
            return True
        if not reminder.interval_value:
            return False
        anchor_date = reminder.created_at.date()
        if today_date.weekday() != anchor_date.weekday():
            return False
        anchor_week = _start_of_week(reminder.created_at.date())
        current_week = _start_of_week(today_date)
        diff_weeks = (current_week - anchor_week).days // 7
        return diff_weeks >= 0 and diff_weeks % reminder.interval_value == 0

    if schedule_unit == "month":
        if today_date.day != 1:
            return False
        if schedule_mode == "fixed":
            month_bit = 1 << (today_date.month - 1)
            return bool(reminder.month_mask and (reminder.month_mask & month_bit) != 0)
        if not reminder.interval_value:
            return False
        diff_months = _month_index(today_date) - _month_index(reminder.created_at.date())
        return diff_months >= 0 and diff_months % reminder.interval_value == 0

    return False


def _is_reminder_sms_window_open(reference_time: datetime) -> bool:
    return reference_time.astimezone().hour >= REMINDER_SMS_DISPATCH_HOUR


def _next_task_code(session: SessionDep, condominio_id) -> str:
    import re

    task_code_pattern = re.compile(r"^task-(\d+)$")
    statement = select(Task.code).where(
        Task.condominio_id == condominio_id,
        Task.code.is_not(None),
    )
    codes = session.exec(statement).all()
    max_seq = 0
    for code in codes:
        if not code:
            continue
        match = task_code_pattern.fullmatch(code.strip().lower())
        if not match:
            continue
        max_seq = max(max_seq, int(match.group(1)))
    return f"task-{max_seq + 1:03d}"


def _resolve_active_caretaker_user(session: SessionDep, condominio_id) -> User | None:
    default_caretaker = session.exec(
        select(Funcionario)
        .where(
            Funcionario.cargo == 1,
            Funcionario.status,
            Funcionario.is_default,
            Funcionario.condominio_id == condominio_id,
        )
        .limit(1)
    ).first()

    if default_caretaker and default_caretaker.email:
        user = session.exec(
            select(User).where(
                User.email == default_caretaker.email,
                User.cargo == 1,
                User.is_active,
                or_(
                    User.condominio_id == condominio_id,
                    User.condominio_id.is_(None),
                ),
            )
        ).first()
        if user:
            if user.condominio_id is None:
                user.condominio_id = condominio_id
                session.add(user)
                session.commit()
                session.refresh(user)
            return user

    return session.exec(
        select(User)
        .where(
            User.cargo == 1,
            User.is_active,
            or_(User.condominio_id == condominio_id, User.condominio_id.is_(None)),
        )
        .order_by(User.created_at.asc())
        .limit(1)
    ).first()


def _send_reminder_sms(reminder: Reminder) -> bool:
    if not (reminder.action_sms and reminder.sms_to and reminder.sms_message):
        return False

    send_sms_notification(
        phone_to=reminder.sms_to,
        body=reminder.sms_message,
    )
    return True


def _create_task_from_reminder(
    session: SessionDep,
    *,
    reminder: Reminder,
    condominio_id,
    created_by_user_id,
) -> bool:
    if not (reminder.action_task and reminder.task_title):
        return False

    caretaker = _resolve_active_caretaker_user(session, condominio_id)
    if not caretaker:
        return False

    for _attempt in range(3):
        try:
            now = datetime.now(timezone.utc)
            task = Task(
                code=_next_task_code(session, condominio_id),
                title=reminder.task_title,
                description=(reminder.task_description or "").strip(),
                status="todo",
                priority=reminder.task_priority,
                condominio_id=condominio_id,
                created_by_user_id=created_by_user_id,
                assigned_to_user_id=caretaker.id,
                created_at=now,
                updated_at=now,
            )
            session.add(task)
            session.commit()
            return True
        except IntegrityError:
            session.rollback()

    return False


def _mark_reminder_triggered(
    session: SessionDep,
    *,
    reminder: Reminder,
    triggered_at: datetime,
) -> None:
    reminder.last_triggered_on = triggered_at.date()
    reminder.last_triggered_at = triggered_at
    reminder.updated_at = triggered_at
    session.add(reminder)
    session.commit()


@router.get("/", response_model=RemindersPublic)
def read_reminders(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    count = session.exec(
        select(func.count())
        .select_from(Reminder)
        .where(Reminder.condominio_id == condominio_id)
    ).one()
    reminders = session.exec(
        select(Reminder)
        .where(Reminder.condominio_id == condominio_id)
        .order_by(Reminder.created_at.desc())
        .offset(skip)
        .limit(limit)
    ).all()

    return RemindersPublic(
        data=[_reminder_to_public(item) for item in reminders],
        count=count,
    )


@router.post("/", response_model=ReminderPublic, status_code=201)
def create_reminder(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: ReminderCreate,
) -> ReminderPublic:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    _validate_reminder_actions(
        action_sms=payload.action_sms,
        sms_to=payload.sms_to,
        sms_message=payload.sms_message,
        action_task=payload.action_task,
        task_title=payload.task_title,
    )
    _validate_schedule_config(
        schedule_unit=payload.schedule_unit.strip().lower(),
        schedule_mode=payload.schedule_mode.strip().lower(),
        interval_value=payload.interval_value,
        weekday_mask=payload.weekday_mask,
        month_mask=payload.month_mask,
    )
    normalized_sms_to = (
        _normalize_reminder_sms_to(payload.sms_to) if payload.action_sms else None
    )

    now = datetime.now(timezone.utc)
    reminder = Reminder(
        name=payload.name.strip(),
        schedule_unit=payload.schedule_unit.strip().lower(),
        schedule_mode=payload.schedule_mode.strip().lower(),
        interval_value=payload.interval_value,
        weekday_mask=payload.weekday_mask,
        month_mask=payload.month_mask,
        is_active=payload.is_active,
        action_sms=payload.action_sms,
        sms_to=normalized_sms_to,
        sms_message=payload.sms_message.strip() if payload.sms_message else None,
        action_task=payload.action_task,
        task_title=payload.task_title.strip() if payload.task_title else None,
        task_description=(
            payload.task_description.strip() if payload.task_description else None
        ),
        task_priority=payload.task_priority,
        condominio_id=condominio_id,
        created_by_user_id=current_user.id,
        created_at=now,
        updated_at=now,
    )
    session.add(reminder)
    session.commit()
    session.refresh(reminder)
    return _reminder_to_public(reminder)


@router.patch("/{reminder_id}", response_model=ReminderPublic)
def update_reminder(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    reminder_id: str,
    payload: ReminderUpdate,
) -> ReminderPublic:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    try:
        reminder_uuid = uuid.UUID(reminder_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid reminder id") from exc

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    reminder = session.get(Reminder, reminder_uuid)
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    if reminder.condominio_id != condominio_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    if payload.name is not None:
        reminder.name = payload.name.strip()
    if payload.schedule_unit is not None:
        reminder.schedule_unit = payload.schedule_unit.strip().lower()
    if payload.schedule_mode is not None:
        reminder.schedule_mode = payload.schedule_mode.strip().lower()
    if "interval_value" in payload.model_fields_set:
        reminder.interval_value = payload.interval_value
    if payload.weekday_mask is not None:
        reminder.weekday_mask = payload.weekday_mask
    if "month_mask" in payload.model_fields_set:
        reminder.month_mask = payload.month_mask
    if payload.is_active is not None:
        reminder.is_active = payload.is_active
    if payload.action_sms is not None:
        reminder.action_sms = payload.action_sms
    if payload.action_task is not None:
        reminder.action_task = payload.action_task

    if "sms_to" in payload.model_fields_set:
        reminder.sms_to = (
            _normalize_reminder_sms_to(payload.sms_to) if payload.sms_to else None
        )
    if "sms_message" in payload.model_fields_set:
        reminder.sms_message = (payload.sms_message or "").strip() or None
    if "task_title" in payload.model_fields_set:
        reminder.task_title = (payload.task_title or "").strip() or None
    if "task_description" in payload.model_fields_set:
        reminder.task_description = (payload.task_description or "").strip() or None
    if payload.task_priority is not None:
        reminder.task_priority = payload.task_priority

    _validate_schedule_config(
        schedule_unit=reminder.schedule_unit,
        schedule_mode=reminder.schedule_mode,
        interval_value=reminder.interval_value,
        weekday_mask=reminder.weekday_mask,
        month_mask=reminder.month_mask,
    )

    _validate_reminder_actions(
        action_sms=reminder.action_sms,
        sms_to=reminder.sms_to,
        sms_message=reminder.sms_message,
        action_task=reminder.action_task,
        task_title=reminder.task_title,
    )

    reminder.updated_at = datetime.now(timezone.utc)
    session.add(reminder)
    session.commit()
    session.refresh(reminder)
    return _reminder_to_public(reminder)


@router.delete("/{reminder_id}")
def delete_reminder(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    reminder_id: str,
) -> dict[str, str]:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    try:
        reminder_uuid = uuid.UUID(reminder_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid reminder id") from exc

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    reminder = session.get(Reminder, reminder_uuid)
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    if reminder.condominio_id != condominio_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    session.delete(reminder)
    session.commit()
    return {"message": "Reminder deleted successfully"}


@router.post("/execute-due", response_model=ReminderExecutionSummary)
def execute_due_reminders(
    *,
    session: SessionDep,
    current_user: CurrentUser,
) -> ReminderExecutionSummary:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    today_utc = datetime.now(timezone.utc)
    today_date = today_utc.date()
    due_candidates = session.exec(
        select(Reminder).where(
            Reminder.condominio_id == condominio_id,
            Reminder.is_active,
            or_(
                Reminder.last_triggered_on.is_(None),
                Reminder.last_triggered_on < today_date,
            ),
        )
    ).all()
    due_reminders = [
        reminder
        for reminder in due_candidates
        if _is_reminder_due_today(reminder, today_date)
    ]

    sms_sent = 0
    tasks_created = 0
    triggered = 0
    sms_window_open = _is_reminder_sms_window_open(today_utc)

    for reminder in due_reminders:
        if reminder.action_sms and not sms_window_open:
            continue

        reminder_triggered = False

        if reminder.action_sms and reminder.sms_to and reminder.sms_message:
            try:
                _send_reminder_sms(reminder)
                sms_sent += 1
                reminder_triggered = True
            except Exception:
                # Keep reminder pending for another attempt if SMS fails.
                pass

        if reminder.action_task and reminder.task_title:
            task_created = _create_task_from_reminder(
                session,
                reminder=reminder,
                condominio_id=condominio_id,
                created_by_user_id=current_user.id,
            )
            if task_created:
                tasks_created += 1
                reminder_triggered = True

        if reminder_triggered:
            _mark_reminder_triggered(
                session,
                reminder=reminder,
                triggered_at=datetime.now(timezone.utc),
            )
            triggered += 1

    return ReminderExecutionSummary(
        checked=len(due_reminders),
        triggered=triggered,
        sms_sent=sms_sent,
        tasks_created=tasks_created,
    )


@router.post("/{reminder_id}/trigger-now", response_model=ReminderExecutionSummary)
def trigger_reminder_now(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    reminder_id: str,
) -> ReminderExecutionSummary:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Not enough permissions")
    try:
        reminder_uuid = uuid.UUID(reminder_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid reminder id") from exc

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    reminder = session.get(Reminder, reminder_uuid)
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    if reminder.condominio_id != condominio_id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    sms_sent = 0
    tasks_created = 0
    last_error_detail: str | None = None
    last_error_status = 400

    if reminder.action_sms and reminder.sms_to and reminder.sms_message:
        try:
            if _send_reminder_sms(reminder):
                sms_sent = 1
        except Exception as exc:
            last_error_detail = str(exc) or "Could not send reminder SMS"
            last_error_status = 502

    if reminder.action_task and reminder.task_title:
        if _create_task_from_reminder(
            session,
            reminder=reminder,
            condominio_id=condominio_id,
            created_by_user_id=current_user.id,
        ):
            tasks_created = 1
        elif last_error_detail is None:
            last_error_detail = "No active caretaker available for task assignment"

    triggered = 1 if (sms_sent or tasks_created) else 0
    if not triggered:
        raise HTTPException(
            status_code=last_error_status,
            detail=last_error_detail or "Reminder could not be triggered now",
        )

    _mark_reminder_triggered(
        session,
        reminder=reminder,
        triggered_at=datetime.now(timezone.utc),
    )

    return ReminderExecutionSummary(
        checked=1,
        triggered=1,
        sms_sent=sms_sent,
        tasks_created=tasks_created,
    )
