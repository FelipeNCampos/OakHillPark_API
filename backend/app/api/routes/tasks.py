import base64
import binascii
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import func, select

from app.api.deps import CurrentUser, SessionDep, require_cargo
from app.models import (
    Building,
    CaretakerPublic,
    CaretakersPublic,
    Condominio,
    Funcionario,
    Task,
    TaskBoardMetadataPublic,
    TaskBuildingOptionPublic,
    TaskCreate,
    TaskMessage,
    TaskMessageCreate,
    TaskMessagePublic,
    TaskMessagesPublic,
    TaskPublic,
    TasksPublic,
    TaskStatusUpdate,
    User,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])

TASK_ALLOWED_STATUSES = {"todo", "done"}
STATUS_EVENT_PREFIX = "[STATUS]"
COVER_IMAGE_PREFIX = "[COVER_IMAGE]"
TASK_CODE_PATTERN = re.compile(r"^task-(\d+)$")
DATA_URL_PATTERN = re.compile(
    r"^data:(?P<mime>[-\w.+/]+/[-\w.+]+)?;base64,(?P<data>[A-Za-z0-9+/=\s]+)$"
)
MAX_TASK_IMAGE_BYTES = 10 * 1024 * 1024


def _is_manager(user: User) -> bool:
    return bool(user.is_superuser or user.cargo >= 2)


def _is_caretaker(user: User) -> bool:
    return bool((user.cargo == 1) and not user.is_superuser)


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


def _ensure_user_condominio_id(
    session: SessionDep, user: User, condominio_id
) -> None:
    if user.condominio_id:
        return
    user.condominio_id = condominio_id
    session.add(user)


def _resolve_active_caretaker_user(
    session: SessionDep, condominio_id
) -> User | None:
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
                _ensure_user_condominio_id(session, user, condominio_id)
                session.commit()
                session.refresh(user)
            return user

    fallback_user = session.exec(
        select(User)
        .where(
            User.cargo == 1,
            User.is_active,
            or_(User.condominio_id == condominio_id, User.condominio_id.is_(None)),
        )
        .order_by(User.created_at.asc())
        .limit(1)
    ).first()

    if fallback_user and fallback_user.condominio_id is None:
        _ensure_user_condominio_id(session, fallback_user, condominio_id)
        session.commit()
        session.refresh(fallback_user)

    return fallback_user


def _normalize_task_status(status: str) -> str:
    normalized = status.strip().lower()
    if normalized in {"paused", "in_progress"}:
        return "todo"
    return normalized


def _normalize_task_image_data(field_name: str, value: str | None) -> str | None:
    if not value:
        return None
    stripped = value.strip()
    if not stripped:
        return None

    match = DATA_URL_PATTERN.fullmatch(stripped)
    if not match:
        raise HTTPException(status_code=422, detail=f"Invalid {field_name}")

    try:
        file_bytes = base64.b64decode(match.group("data"), validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"Invalid {field_name}") from exc

    if not file_bytes:
        raise HTTPException(status_code=422, detail=f"Empty {field_name}")
    if len(file_bytes) > MAX_TASK_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail=f"{field_name} is too large")
    return stripped


def _task_to_public(
    session: SessionDep,
    task: Task,
    *,
    assigned_name: str | None = None,
    building_label: str | None = None,
    cover_image_data: str | None = None,
    requires_completion_image: bool | None = None,
    include_cover_image_data: bool = True,
) -> TaskPublic:
    if include_cover_image_data and cover_image_data is None:
        cover_image_data = _get_task_cover_image_data(session, task.id)
    if requires_completion_image is None:
        requires_completion_image = bool(cover_image_data)
    if assigned_name is None:
        assigned_user = session.get(User, task.assigned_to_user_id)
        assigned_name = (
            assigned_user.full_name
            or assigned_user.email
            if assigned_user
            else str(task.assigned_to_user_id)
        )
    if building_label is None:
        building = session.get(Building, task.building_id) if task.building_id else None
        if building:
            building_label = building.nome
        else:
            condominio = session.get(Condominio, task.condominio_id)
            building_label = condominio.nome if condominio else "Common areas"

    return TaskPublic(
        id=task.id,
        code=task.code,
        title=task.title,
        description=task.description,
        cover_image_data=cover_image_data,
        requires_completion_image=requires_completion_image,
        status=_normalize_task_status(task.status),
        priority=task.priority,
        condominio_id=task.condominio_id,
        building_id=task.building_id,
        building_label=str(building_label),
        created_by_user_id=task.created_by_user_id,
        assigned_to_user_id=task.assigned_to_user_id,
        assigned_to_name=str(assigned_name),
        spent_seconds=0,
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


def _get_task_cover_image_data(session: SessionDep, task_id) -> str | None:
    statement = (
        select(TaskMessage.image_data)
        .where(
            TaskMessage.task_id == task_id,
            TaskMessage.text.is_not(None),
            TaskMessage.text.like(f"{COVER_IMAGE_PREFIX}%"),
            TaskMessage.image_data.is_not(None),
        )
        .order_by(TaskMessage.created_at.asc())
        .limit(1)
    )
    return session.exec(statement).first()


def _get_task_ids_with_cover_image(
    session: SessionDep, task_ids: list[uuid.UUID]
) -> set[uuid.UUID]:
    if not task_ids:
        return set()
    statement = (
        select(TaskMessage.task_id)
        .distinct()
        .where(
            TaskMessage.task_id.in_(task_ids),
            TaskMessage.text.is_not(None),
            TaskMessage.text.like(f"{COVER_IMAGE_PREFIX}%"),
            TaskMessage.image_data.is_not(None),
        )
    )
    return set(session.exec(statement).all())


def _next_task_code(session: SessionDep, condominio_id) -> str:
    statement = select(Task.code).where(
        Task.condominio_id == condominio_id,
        Task.code.is_not(None),
    )
    codes = session.exec(statement).all()
    max_seq = 0
    for code in codes:
        if not code:
            continue
        match = TASK_CODE_PATTERN.fullmatch(code.strip().lower())
        if not match:
            continue
        max_seq = max(max_seq, int(match.group(1)))
    return f"task-{max_seq + 1:03d}"


def _check_task_access(task: Task, current_user: User) -> None:
    if _is_manager(current_user):
        if task.condominio_id != current_user.condominio_id:
            raise HTTPException(status_code=403, detail="Not enough permissions")
        return

    if _is_caretaker(current_user) and task.assigned_to_user_id == current_user.id:
        return

    raise HTTPException(status_code=403, detail="Not enough permissions")


def _ensure_caretaker_can_modify_task(task: Task, current_user: User) -> None:
    if _is_caretaker(current_user) and _normalize_task_status(task.status) == "done":
        raise HTTPException(
            status_code=400,
            detail="Completed tasks cannot be changed by caretaker",
        )


def _ensure_public_task_can_modify(task: Task) -> None:
    if _normalize_task_status(task.status) == "done":
        raise HTTPException(
            status_code=400,
            detail="Completed tasks cannot be changed by caretaker",
        )


def _check_public_task_access(task: Task, condominio_id: uuid.UUID) -> None:
    if task.condominio_id != condominio_id:
        raise HTTPException(status_code=404, detail="Task not found")


def _resolve_public_task_actor(session: SessionDep, task: Task) -> User:
    assigned_user = session.get(User, task.assigned_to_user_id)
    if (
        assigned_user
        and assigned_user.cargo == 1
        and assigned_user.is_active
        and assigned_user.condominio_id == task.condominio_id
    ):
        return assigned_user

    fallback_user = _resolve_active_caretaker_user(session, task.condominio_id)
    if fallback_user:
        return fallback_user

    raise HTTPException(
        status_code=400,
        detail="No active caretaker available for public task access",
    )


def _status_label(status: str) -> str:
    labels = {
        "todo": "To Do",
        "done": "Done",
    }
    return labels.get(_normalize_task_status(status), status)


def _status_from_label(label: str) -> str | None:
    mapping = {
        "To Do": "todo",
        "In Progress": "todo",
        "Done": "done",
    }
    return mapping.get(label.strip())


def _parse_status_event_next_status(text: str | None) -> str | None:
    if not text or not text.startswith(STATUS_EVENT_PREFIX):
        return None
    payload = text.replace(STATUS_EVENT_PREFIX, "", 1).strip()
    direct_status = _status_from_label(payload)
    if direct_status is not None:
        return direct_status
    parts = payload.split("->")
    if len(parts) != 2:
        return None
    return _status_from_label(parts[1])


@router.get("/caretakers", response_model=CaretakersPublic)
def list_caretakers(
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
    count_statement = (
        select(func.count())
        .select_from(User)
        .where(
            User.cargo == 1,
            User.is_active,
            or_(User.condominio_id == condominio_id, User.condominio_id.is_(None)),
        )
    )
    count = session.exec(count_statement).one()
    statement = (
        select(User)
        .where(
            User.cargo == 1,
            User.is_active,
            or_(User.condominio_id == condominio_id, User.condominio_id.is_(None)),
        )
        .offset(skip)
        .limit(limit)
    )
    users = session.exec(statement).all()
    should_commit = False
    for user in users:
        if user.condominio_id is None:
            _ensure_user_condominio_id(session, user, condominio_id)
            should_commit = True
    if should_commit:
        session.commit()
        for user in users:
            session.refresh(user)
    data = [
        CaretakerPublic(id=user.id, email=user.email, full_name=user.full_name)
        for user in users
    ]
    return CaretakersPublic(data=data, count=count)


@router.get(
    "/metadata",
    response_model=TaskBoardMetadataPublic,
    dependencies=[Depends(require_cargo(1))],
)
def read_task_board_metadata(
    session: SessionDep,
    current_user: CurrentUser,
) -> TaskBoardMetadataPublic:
    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    condominio = session.get(Condominio, condominio_id)
    if not condominio:
        raise HTTPException(status_code=404, detail="Condominio not found")

    buildings = session.exec(
        select(Building)
        .where(Building.condominio_id == condominio_id)
        .order_by(Building.nome.asc())
    ).all()

    return TaskBoardMetadataPublic(
        common_area_label=condominio.nome,
        buildings=[
            TaskBuildingOptionPublic(id=building.id, name=building.nome)
            for building in buildings
        ],
    )


@router.post("/", response_model=TaskPublic, dependencies=[Depends(require_cargo(1))])
def create_task(
    *, session: SessionDep, current_user: CurrentUser, payload: TaskCreate
) -> TaskPublic:
    if not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Only managers can create tasks")

    condominio_id = _resolve_user_condominio_id(session, current_user)
    if not condominio_id:
        raise HTTPException(status_code=400, detail="No condominio configured")

    assigned_to_user_id = payload.assigned_to_user_id
    if assigned_to_user_id is None:
        active_caretaker = _resolve_active_caretaker_user(session, condominio_id)
        if not active_caretaker:
            raise HTTPException(
                status_code=400,
                detail="No active caretaker available for task assignment",
            )
        assigned_to_user_id = active_caretaker.id

    caretaker = session.get(User, assigned_to_user_id)
    if not caretaker:
        raise HTTPException(status_code=404, detail="Caretaker not found")
    if caretaker.cargo != 1:
        raise HTTPException(status_code=400, detail="User is not a caretaker")
    if caretaker.condominio_id is None:
        _ensure_user_condominio_id(session, caretaker, condominio_id)
        session.commit()
        session.refresh(caretaker)
    if caretaker.condominio_id != condominio_id:
        raise HTTPException(status_code=400, detail="Caretaker outside this condominio")

    building_id = payload.building_id
    if building_id is not None:
        building = session.get(Building, building_id)
        if not building:
            raise HTTPException(status_code=404, detail="Building not found")
        if building.condominio_id != condominio_id:
            raise HTTPException(
                status_code=400, detail="Building outside this condominio"
            )

    cover_image_data = _normalize_task_image_data("image_data", payload.image_data)

    for _attempt in range(3):
        now = datetime.now(timezone.utc)
        task = Task(
            code=_next_task_code(session, condominio_id),
            title=payload.title.strip(),
            description=payload.description.strip(),
            status="todo",
            priority=payload.priority,
            condominio_id=condominio_id,
            building_id=building_id,
            created_by_user_id=current_user.id,
            assigned_to_user_id=assigned_to_user_id,
            created_at=now,
            updated_at=now,
        )
        session.add(task)
        try:
            session.flush()
            if cover_image_data:
                session.add(
                    TaskMessage(
                        task_id=task.id,
                        sender_user_id=current_user.id,
                        sender_role="manager",
                        text=f"{COVER_IMAGE_PREFIX} Creation photo",
                        image_data=cover_image_data,
                        created_at=now,
                    )
                )
            session.commit()
            session.refresh(task)
            return _task_to_public(session, task)
        except IntegrityError:
            # Retry if another concurrent transaction consumed this code.
            session.rollback()

    raise HTTPException(status_code=500, detail="Could not generate a unique task code")


@router.get("/", response_model=TasksPublic, dependencies=[Depends(require_cargo(1))])
def read_tasks(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 100,
) -> Any:
    if _is_manager(current_user):
        condominio_id = _resolve_user_condominio_id(session, current_user)
        if not condominio_id:
            raise HTTPException(status_code=400, detail="No condominio configured")
        count_statement = (
            select(func.count())
            .select_from(Task)
            .where(Task.condominio_id == condominio_id)
        )
        statement = (
            select(Task)
            .where(Task.condominio_id == condominio_id)
            .order_by(Task.priority.asc(), Task.updated_at.desc())
            .offset(skip)
            .limit(limit)
        )
    elif _is_caretaker(current_user):
        count_statement = (
            select(func.count())
            .select_from(Task)
            .where(Task.assigned_to_user_id == current_user.id)
        )
        statement = (
            select(Task)
            .where(Task.assigned_to_user_id == current_user.id)
            .order_by(Task.priority.asc(), Task.updated_at.desc())
            .offset(skip)
            .limit(limit)
        )
    else:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    count = session.exec(count_statement).one()
    tasks = session.exec(statement).all()

    task_ids = [task.id for task in tasks]
    task_ids_with_cover_image = _get_task_ids_with_cover_image(session, task_ids)

    assigned_user_ids = list({task.assigned_to_user_id for task in tasks})
    assigned_user_map: dict[Any, User] = {}
    if assigned_user_ids:
        assigned_users = session.exec(select(User).where(User.id.in_(assigned_user_ids))).all()
        assigned_user_map = {user.id: user for user in assigned_users}

    building_ids = [task.building_id for task in tasks if task.building_id is not None]
    building_map: dict[Any, Building] = {}
    if building_ids:
        buildings = session.exec(select(Building).where(Building.id.in_(building_ids))).all()
        building_map = {building.id: building for building in buildings}

    condominio_ids = list({task.condominio_id for task in tasks})
    condominio_map: dict[Any, Condominio] = {}
    if condominio_ids:
        condominios = session.exec(
            select(Condominio).where(Condominio.id.in_(condominio_ids))
        ).all()
        condominio_map = {condominio.id: condominio for condominio in condominios}

    data: list[TaskPublic] = []
    for task in tasks:
        assigned_user = assigned_user_map.get(task.assigned_to_user_id)
        assigned_name = (
            assigned_user.full_name or assigned_user.email
            if assigned_user
            else str(task.assigned_to_user_id)
        )
        building = building_map.get(task.building_id) if task.building_id else None
        condominio = condominio_map.get(task.condominio_id)
        building_label = building.nome if building else (
            condominio.nome if condominio else "Common areas"
        )
        data.append(
            TaskPublic(
                id=task.id,
                code=task.code,
                title=task.title,
                description=task.description,
                cover_image_data=None,
                requires_completion_image=task.id in task_ids_with_cover_image,
                status=_normalize_task_status(task.status),
                priority=task.priority,
                condominio_id=task.condominio_id,
                building_id=task.building_id,
                building_label=building_label,
                created_by_user_id=task.created_by_user_id,
                assigned_to_user_id=task.assigned_to_user_id,
                assigned_to_name=str(assigned_name),
                spent_seconds=0,
                created_at=task.created_at,
                updated_at=task.updated_at,
            )
        )
    return TasksPublic(data=data, count=count)


@router.get("/public", response_model=TasksPublic)
def read_public_tasks(
    session: SessionDep,
    condominio_id: uuid.UUID = Query(...),
    skip: int = 0,
    limit: int = 100,
) -> TasksPublic:
    count_statement = (
        select(func.count())
        .select_from(Task)
        .where(Task.condominio_id == condominio_id)
    )
    statement = (
        select(Task)
        .where(Task.condominio_id == condominio_id)
        .order_by(Task.priority.asc(), Task.updated_at.desc())
        .offset(skip)
        .limit(limit)
    )

    count = session.exec(count_statement).one()
    tasks = session.exec(statement).all()

    task_ids = [task.id for task in tasks]
    task_ids_with_cover_image = _get_task_ids_with_cover_image(session, task_ids)

    assigned_user_ids = list({task.assigned_to_user_id for task in tasks})
    assigned_user_map: dict[Any, User] = {}
    if assigned_user_ids:
        assigned_users = session.exec(select(User).where(User.id.in_(assigned_user_ids))).all()
        assigned_user_map = {user.id: user for user in assigned_users}

    building_ids = [task.building_id for task in tasks if task.building_id is not None]
    building_map: dict[Any, Building] = {}
    if building_ids:
        buildings = session.exec(select(Building).where(Building.id.in_(building_ids))).all()
        building_map = {building.id: building for building in buildings}

    condominio = session.get(Condominio, condominio_id)
    common_area_label = condominio.nome if condominio else "Common areas"

    data: list[TaskPublic] = []
    for task in tasks:
        assigned_user = assigned_user_map.get(task.assigned_to_user_id)
        assigned_name = (
            assigned_user.full_name or assigned_user.email
            if assigned_user
            else str(task.assigned_to_user_id)
        )
        building = building_map.get(task.building_id) if task.building_id else None
        building_label = building.nome if building else common_area_label
        data.append(
            TaskPublic(
                id=task.id,
                code=task.code,
                title=task.title,
                description=task.description,
                cover_image_data=None,
                requires_completion_image=task.id in task_ids_with_cover_image,
                status=_normalize_task_status(task.status),
                priority=task.priority,
                condominio_id=task.condominio_id,
                building_id=task.building_id,
                building_label=building_label,
                created_by_user_id=task.created_by_user_id,
                assigned_to_user_id=task.assigned_to_user_id,
                assigned_to_name=str(assigned_name),
                spent_seconds=0,
                created_at=task.created_at,
                updated_at=task.updated_at,
            )
        )

    return TasksPublic(data=data, count=count)


@router.get("/public/{task_id}", response_model=TaskPublic)
def read_public_task(
    *, session: SessionDep, task_id: str, condominio_id: uuid.UUID = Query(...)
) -> TaskPublic:
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid task id") from exc

    task = session.get(Task, task_uuid)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    _check_public_task_access(task, condominio_id)
    return _task_to_public(session, task)


@router.patch("/public/{task_id}/status", response_model=TaskPublic)
def update_public_task_status(
    *,
    session: SessionDep,
    task_id: str,
    payload: TaskStatusUpdate,
    condominio_id: uuid.UUID = Query(...),
) -> TaskPublic:
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid task id") from exc

    task = session.get(Task, task_uuid)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    _check_public_task_access(task, condominio_id)
    _ensure_public_task_can_modify(task)

    next_status = payload.status.strip().lower()
    if next_status not in TASK_ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid task status")

    image_data = _normalize_task_image_data("image_data", payload.image_data)

    actor = _resolve_public_task_actor(session, task)
    previous_status = _normalize_task_status(task.status)
    task.status = next_status
    task.updated_at = datetime.now(timezone.utc)
    session.add(task)

    if previous_status != next_status:
        session.add(
            TaskMessage(
                task_id=task.id,
                sender_user_id=actor.id,
                sender_role="caretaker",
                text=f"{STATUS_EVENT_PREFIX} {_status_label(next_status)}",
                image_data=image_data if next_status == "done" else None,
                created_at=task.updated_at,
            )
        )

    session.commit()
    session.refresh(task)
    return _task_to_public(session, task)


@router.get("/public/{task_id}/messages", response_model=TaskMessagesPublic)
def read_public_task_messages(
    *,
    session: SessionDep,
    task_id: str,
    condominio_id: uuid.UUID = Query(...),
    skip: int = 0,
    limit: int = 200,
) -> TaskMessagesPublic:
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid task id") from exc

    task = session.get(Task, task_uuid)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    _check_public_task_access(task, condominio_id)

    count_statement = (
        select(func.count()).select_from(TaskMessage).where(TaskMessage.task_id == task.id)
    )
    count = session.exec(count_statement).one()
    statement = (
        select(TaskMessage)
        .where(TaskMessage.task_id == task.id)
        .order_by(TaskMessage.created_at.asc())
        .offset(skip)
        .limit(limit)
    )
    messages = session.exec(statement).all()

    data: list[TaskMessagePublic] = []
    for item in messages:
        sender = session.get(User, item.sender_user_id)
        sender_name = sender.full_name or sender.email if sender else str(item.sender_user_id)
        data.append(
            TaskMessagePublic(
                id=item.id,
                task_id=item.task_id,
                sender_user_id=item.sender_user_id,
                sender_name=str(sender_name),
                sender_role=item.sender_role,
                text=item.text,
                image_data=item.image_data,
                created_at=item.created_at,
            )
        )
    return TaskMessagesPublic(data=data, count=count)


@router.post("/public/{task_id}/messages", response_model=TaskMessagePublic, status_code=201)
def create_public_task_message(
    *,
    session: SessionDep,
    task_id: str,
    payload: TaskMessageCreate,
    condominio_id: uuid.UUID = Query(...),
) -> TaskMessagePublic:
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid task id") from exc

    task = session.get(Task, task_uuid)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    _check_public_task_access(task, condominio_id)
    _ensure_public_task_can_modify(task)

    text = payload.text.strip() if payload.text else None
    image_data = _normalize_task_image_data("image_data", payload.image_data)
    if not text and not image_data:
        raise HTTPException(status_code=400, detail="Message must have text or image")

    actor = _resolve_public_task_actor(session, task)
    now = datetime.now(timezone.utc)
    item = TaskMessage(
        task_id=task.id,
        sender_user_id=actor.id,
        sender_role="caretaker",
        text=text,
        image_data=image_data,
        created_at=now,
    )
    task.updated_at = now
    session.add(item)
    session.add(task)
    session.commit()
    session.refresh(item)

    sender_name = actor.full_name or actor.email
    return TaskMessagePublic(
        id=item.id,
        task_id=item.task_id,
        sender_user_id=item.sender_user_id,
        sender_name=str(sender_name),
        sender_role=item.sender_role,
        text=item.text,
        image_data=item.image_data,
        created_at=item.created_at,
    )


@router.get(
    "/{task_id}",
    response_model=TaskPublic,
    dependencies=[Depends(require_cargo(1))],
)
def read_task(
    *, session: SessionDep, current_user: CurrentUser, task_id: str
) -> TaskPublic:
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid task id") from exc

    task = session.get(Task, task_uuid)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    _check_task_access(task, current_user)
    return _task_to_public(session, task)


@router.patch(
    "/{task_id}/status",
    response_model=TaskPublic,
    dependencies=[Depends(require_cargo(1))],
)
def update_task_status(
    *, session: SessionDep, current_user: CurrentUser, task_id: str, payload: TaskStatusUpdate
) -> TaskPublic:
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid task id") from exc

    task = session.get(Task, task_uuid)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    _check_task_access(task, current_user)
    _ensure_caretaker_can_modify_task(task, current_user)

    next_status = payload.status.strip().lower()
    if next_status not in TASK_ALLOWED_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid task status")

    if _is_caretaker(current_user) and task.assigned_to_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not enough permissions")

    image_data = _normalize_task_image_data("image_data", payload.image_data)
    requires_completion_image = bool(_get_task_cover_image_data(session, task.id))
    if (
        next_status == "done"
        and _is_caretaker(current_user)
        and requires_completion_image
        and not image_data
    ):
        raise HTTPException(
            status_code=400,
            detail="A completion photo is required to finish this task",
        )

    previous_status = _normalize_task_status(task.status)
    task.status = next_status
    task.updated_at = datetime.now(timezone.utc)
    session.add(task)

    if previous_status != next_status:
        sender_role = "manager" if _is_manager(current_user) else "caretaker"
        status_event = TaskMessage(
            task_id=task.id,
            sender_user_id=current_user.id,
            sender_role=sender_role,
            text=f"{STATUS_EVENT_PREFIX} {_status_label(next_status)}",
            image_data=image_data if next_status == "done" else None,
            created_at=task.updated_at,
        )
        session.add(status_event)

    session.commit()
    session.refresh(task)
    return _task_to_public(session, task)


@router.get(
    "/{task_id}/messages",
    response_model=TaskMessagesPublic,
    dependencies=[Depends(require_cargo(1))],
)
def read_task_messages(
    *, session: SessionDep, current_user: CurrentUser, task_id: str, skip: int = 0, limit: int = 200
) -> Any:
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid task id") from exc

    task = session.get(Task, task_uuid)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    _check_task_access(task, current_user)

    count_statement = (
        select(func.count()).select_from(TaskMessage).where(TaskMessage.task_id == task.id)
    )
    count = session.exec(count_statement).one()
    statement = (
        select(TaskMessage)
        .where(TaskMessage.task_id == task.id)
        .order_by(TaskMessage.created_at.asc())
        .offset(skip)
        .limit(limit)
    )
    messages = session.exec(statement).all()

    data: list[TaskMessagePublic] = []
    for item in messages:
        sender = session.get(User, item.sender_user_id)
        sender_name = sender.full_name or sender.email if sender else str(item.sender_user_id)
        data.append(
            TaskMessagePublic(
                id=item.id,
                task_id=item.task_id,
                sender_user_id=item.sender_user_id,
                sender_name=str(sender_name),
                sender_role=item.sender_role,
                text=item.text,
                image_data=item.image_data,
                created_at=item.created_at,
            )
        )
    return TaskMessagesPublic(data=data, count=count)


@router.post(
    "/{task_id}/messages",
    response_model=TaskMessagePublic,
    status_code=201,
    dependencies=[Depends(require_cargo(1))],
)
def create_task_message(
    *, session: SessionDep, current_user: CurrentUser, task_id: str, payload: TaskMessageCreate
) -> TaskMessagePublic:
    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid task id") from exc

    task = session.get(Task, task_uuid)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    _check_task_access(task, current_user)
    _ensure_caretaker_can_modify_task(task, current_user)

    text = payload.text.strip() if payload.text else None
    image_data = _normalize_task_image_data("image_data", payload.image_data)
    if not text and not image_data:
        raise HTTPException(status_code=400, detail="Message must have text or image")

    sender_role = "manager" if _is_manager(current_user) else "caretaker"
    now = datetime.now(timezone.utc)
    item = TaskMessage(
        task_id=task.id,
        sender_user_id=current_user.id,
        sender_role=sender_role,
        text=text,
        image_data=image_data,
        created_at=now,
    )
    task.updated_at = now
    session.add(item)
    session.add(task)
    session.commit()
    session.refresh(item)

    sender_name = current_user.full_name or current_user.email
    return TaskMessagePublic(
        id=item.id,
        task_id=item.task_id,
        sender_user_id=item.sender_user_id,
        sender_name=str(sender_name),
        sender_role=item.sender_role,
        text=item.text,
        image_data=item.image_data,
        created_at=item.created_at,
    )
