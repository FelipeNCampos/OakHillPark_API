from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import (
    Condominio,
    CondominioCreate,
    User,
    UserCreate,
    UserUpdate,
)
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string


def _ensure_condominio_and_users(db: Session) -> tuple[Condominio, User, User]:
    condominio = db.exec(
        select(Condominio).where(Condominio.nome == "Test Tasks Condominio")
    ).first()
    if not condominio:
        condominio = Condominio.model_validate(CondominioCreate(nome="Test Tasks Condominio"))
        db.add(condominio)
        db.commit()
        db.refresh(condominio)

    manager = db.exec(select(User).where(User.email == settings.FIRST_SUPERUSER)).first()
    if not manager:
        raise AssertionError("Superuser not found")
    manager.condominio_id = condominio.id
    db.add(manager)

    caretaker_email = random_email()
    caretaker_password = random_lower_string()
    caretaker = crud.create_user(
        session=db,
        user_create=UserCreate(
            email=caretaker_email,
            password=caretaker_password,
            is_active=True,
            is_superuser=False,
            cargo=1,
            condominio_id=condominio.id,
        ),
    )

    return condominio, manager, caretaker


def test_caretaker_login_only(client: TestClient, db: Session) -> None:
    condominio, _, caretaker = _ensure_condominio_and_users(db)
    assert condominio.id

    password = random_lower_string()
    caretaker = crud.update_user(
        session=db, db_user=caretaker, user_in=UserUpdate(password=password)
    )

    response = client.post(
        f"{settings.API_V1_STR}/login/caretaker-access-token",
        data={"username": caretaker.email, "password": password},
    )
    assert response.status_code == 200
    payload = response.json()
    assert "access_token" in payload


def test_tasks_lifecycle(client: TestClient, db: Session) -> None:
    _, _, caretaker = _ensure_condominio_and_users(db)

    manager_headers = user_authentication_headers(
        client=client,
        email=settings.FIRST_SUPERUSER,
        password=settings.FIRST_SUPERUSER_PASSWORD,
    )

    task_payload = {
        "title": "Check water leak",
        "description": "Block B - flat 12",
        "assigned_to_user_id": str(caretaker.id),
    }
    create_task = client.post(
        f"{settings.API_V1_STR}/tasks/",
        headers=manager_headers,
        json=task_payload,
    )
    assert create_task.status_code == 200
    task = create_task.json()
    task_id = task["id"]

    caretaker_password = random_lower_string()
    caretaker = crud.update_user(
        session=db, db_user=caretaker, user_in=UserUpdate(password=caretaker_password)
    )
    caretaker_headers = user_authentication_headers(
        client=client,
        email=caretaker.email,
        password=caretaker_password,
    )

    list_tasks = client.get(f"{settings.API_V1_STR}/tasks/", headers=caretaker_headers)
    assert list_tasks.status_code == 200
    assert list_tasks.json()["count"] >= 1

    update_status = client.patch(
        f"{settings.API_V1_STR}/tasks/{task_id}/status",
        headers=caretaker_headers,
        json={"status": "in_progress"},
    )
    assert update_status.status_code == 200
    assert update_status.json()["status"] == "in_progress"

    send_message = client.post(
        f"{settings.API_V1_STR}/tasks/{task_id}/messages",
        headers=caretaker_headers,
        json={"text": "Starting now"},
    )
    assert send_message.status_code == 201

    read_messages = client.get(
        f"{settings.API_V1_STR}/tasks/{task_id}/messages",
        headers=manager_headers,
    )
    assert read_messages.status_code == 200
    assert read_messages.json()["count"] >= 1


def test_manager_creates_task_without_assigned_user(
    client: TestClient, db: Session
) -> None:
    _, _, caretaker = _ensure_condominio_and_users(db)

    manager_headers = user_authentication_headers(
        client=client,
        email=settings.FIRST_SUPERUSER,
        password=settings.FIRST_SUPERUSER_PASSWORD,
    )

    create_task = client.post(
        f"{settings.API_V1_STR}/tasks/",
        headers=manager_headers,
        json={
            "title": "Check lights",
            "description": "Lobby maintenance",
        },
    )
    assert create_task.status_code == 200
    payload = create_task.json()
    assert payload["assigned_to_user_id"] == str(caretaker.id)
