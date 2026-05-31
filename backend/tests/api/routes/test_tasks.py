import re

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import (
    Building,
    BuildingCreate,
    Condominio,
    CondominioCreate,
    User,
    UserCreate,
    UserUpdate,
)
from tests.utils.user import user_authentication_headers
from tests.utils.utils import random_email, random_lower_string

VALID_IMAGE_DATA = "data:image/png;base64,QUFB"


def _ensure_condominio_and_users(db: Session) -> tuple[Condominio, User, User]:
    condominio = db.exec(select(Condominio).limit(1)).first()
    if not condominio:
        condominio = Condominio.model_validate(CondominioCreate(nome="Oak Hill Park"))
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


def _create_test_building(db: Session, condominio_id) -> Building:
    building = Building.model_validate(
        BuildingCreate(nome="Test Tasks Building", condominio_id=condominio_id)
    )
    db.add(building)
    db.commit()
    db.refresh(building)
    return building


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
    condominio, _, caretaker = _ensure_condominio_and_users(db)
    building = _create_test_building(db, condominio.id)

    manager_headers = user_authentication_headers(
        client=client,
        email=settings.FIRST_SUPERUSER,
        password=settings.FIRST_SUPERUSER_PASSWORD,
    )

    task_payload = {
        "title": "Check water leak",
        "description": "Block B - flat 12",
        "assigned_to_user_id": str(caretaker.id),
        "building_id": str(building.id),
    }
    create_task = client.post(
        f"{settings.API_V1_STR}/tasks/",
        headers=manager_headers,
        json=task_payload,
    )
    assert create_task.status_code == 200
    task = create_task.json()
    task_id = task["id"]
    assert re.fullmatch(r"task-\d{3,}", task["code"])
    assert task["building_id"] == str(building.id)
    assert task["building_label"] == building.nome

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
        json={"status": "done"},
    )
    assert update_status.status_code == 200
    assert update_status.json()["status"] == "done"

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
    condominio, _, caretaker = _ensure_condominio_and_users(db)

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
    assigned_user = db.get(User, payload["assigned_to_user_id"])
    assert assigned_user is not None
    assert assigned_user.cargo == 1
    assert assigned_user.condominio_id == caretaker.condominio_id
    assert re.fullmatch(r"task-\d{3,}", payload["code"])
    assert payload["building_id"] is None
    assert payload["building_label"] == condominio.nome


def test_task_code_auto_increment(client: TestClient, db: Session) -> None:
    _, _, caretaker = _ensure_condominio_and_users(db)

    manager_headers = user_authentication_headers(
        client=client,
        email=settings.FIRST_SUPERUSER,
        password=settings.FIRST_SUPERUSER_PASSWORD,
    )

    first = client.post(
        f"{settings.API_V1_STR}/tasks/",
        headers=manager_headers,
        json={
            "title": "Task code first",
            "description": "First code",
            "assigned_to_user_id": str(caretaker.id),
        },
    )
    assert first.status_code == 200
    first_code = first.json()["code"]
    first_match = re.fullmatch(r"task-(\d{3,})", first_code)
    assert first_match

    second = client.post(
        f"{settings.API_V1_STR}/tasks/",
        headers=manager_headers,
        json={
            "title": "Task code second",
            "description": "Second code",
            "assigned_to_user_id": str(caretaker.id),
        },
    )
    assert second.status_code == 200
    second_code = second.json()["code"]
    second_match = re.fullmatch(r"task-(\d{3,})", second_code)
    assert second_match
    assert int(second_match.group(1)) == int(first_match.group(1)) + 1


def test_task_with_creation_photo_requires_completion_photo(
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
            "title": "Photo-based task",
            "description": "",
            "image_data": VALID_IMAGE_DATA,
            "assigned_to_user_id": str(caretaker.id),
        },
    )
    assert create_task.status_code == 200
    payload = create_task.json()
    assert payload["cover_image_data"] == VALID_IMAGE_DATA
    assert payload["requires_completion_image"] is True

    list_response = client.get(f"{settings.API_V1_STR}/tasks/", headers=manager_headers)
    assert list_response.status_code == 200
    listed_task = next(
        item for item in list_response.json()["data"] if item["id"] == payload["id"]
    )
    assert listed_task["cover_image_data"] is None
    assert listed_task["requires_completion_image"] is True

    detail_response = client.get(
        f"{settings.API_V1_STR}/tasks/{payload['id']}",
        headers=manager_headers,
    )
    assert detail_response.status_code == 200
    assert detail_response.json()["cover_image_data"] == VALID_IMAGE_DATA

    caretaker_password = random_lower_string()
    caretaker = crud.update_user(
        session=db, db_user=caretaker, user_in=UserUpdate(password=caretaker_password)
    )
    caretaker_headers = user_authentication_headers(
        client=client,
        email=caretaker.email,
        password=caretaker_password,
    )

    finish_without_photo = client.patch(
        f"{settings.API_V1_STR}/tasks/{payload['id']}/status",
        headers=caretaker_headers,
        json={"status": "done"},
    )
    assert finish_without_photo.status_code == 400
    assert (
        finish_without_photo.json()["detail"]
        == "A completion photo is required to finish this task"
    )

    finish_with_photo = client.patch(
        f"{settings.API_V1_STR}/tasks/{payload['id']}/status",
        headers=caretaker_headers,
        json={"status": "done", "image_data": "data:image/png;base64,QkJC"},
    )
    assert finish_with_photo.status_code == 200
    assert finish_with_photo.json()["status"] == "done"

    reopen_after_done = client.patch(
        f"{settings.API_V1_STR}/tasks/{payload['id']}/status",
        headers=caretaker_headers,
        json={"status": "todo"},
    )
    assert reopen_after_done.status_code == 400
    assert (
        reopen_after_done.json()["detail"]
        == "Completed tasks cannot be changed by caretaker"
    )

    message_after_done = client.post(
        f"{settings.API_V1_STR}/tasks/{payload['id']}/messages",
        headers=caretaker_headers,
        json={"text": "late update"},
    )
    assert message_after_done.status_code == 400
    assert (
        message_after_done.json()["detail"]
        == "Completed tasks cannot be changed by caretaker"
    )

    messages_response = client.get(
        f"{settings.API_V1_STR}/tasks/{payload['id']}/messages",
        headers=manager_headers,
    )
    assert messages_response.status_code == 200
    assert any(
        message["image_data"] == "data:image/png;base64,QkJC"
        and "Done" in (message.get("text") or "")
        for message in messages_response.json()["data"]
    )


def test_task_creation_rejects_invalid_image_data(
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
            "title": "Invalid image task",
            "description": "",
            "image_data": "not-a-data-url",
            "assigned_to_user_id": str(caretaker.id),
        },
    )

    assert create_task.status_code == 422
    assert create_task.json()["detail"] == "Invalid image_data"


def test_task_creation_rejects_oversized_image_data(
    client: TestClient, db: Session
) -> None:
    _, _, caretaker = _ensure_condominio_and_users(db)

    manager_headers = user_authentication_headers(
        client=client,
        email=settings.FIRST_SUPERUSER,
        password=settings.FIRST_SUPERUSER_PASSWORD,
    )

    oversized_image_data = "data:image/png;base64," + ("A" * (14 * 1024 * 1024))
    create_task = client.post(
        f"{settings.API_V1_STR}/tasks/",
        headers=manager_headers,
        json={
            "title": "Oversized image task",
            "description": "",
            "image_data": oversized_image_data,
            "assigned_to_user_id": str(caretaker.id),
        },
    )

    assert create_task.status_code == 413
    assert create_task.json()["detail"] == "image_data is too large"


def test_task_board_metadata_returns_buildings_and_common_area_label(
    client: TestClient, db: Session
) -> None:
    condominio, _, _ = _ensure_condominio_and_users(db)
    building = _create_test_building(db, condominio.id)

    manager_headers = user_authentication_headers(
        client=client,
        email=settings.FIRST_SUPERUSER,
        password=settings.FIRST_SUPERUSER_PASSWORD,
    )

    response = client.get(
        f"{settings.API_V1_STR}/tasks/metadata",
        headers=manager_headers,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["common_area_label"] == condominio.nome
    assert any(item["id"] == str(building.id) for item in payload["buildings"])


def test_public_tasks_access_allows_read_message_and_done(
    client: TestClient, db: Session
) -> None:
    condominio, _, caretaker = _ensure_condominio_and_users(db)
    building = _create_test_building(db, condominio.id)

    manager_headers = user_authentication_headers(
        client=client,
        email=settings.FIRST_SUPERUSER,
        password=settings.FIRST_SUPERUSER_PASSWORD,
    )

    create_task = client.post(
        f"{settings.API_V1_STR}/tasks/",
        headers=manager_headers,
        json={
            "title": "Public QR Task",
            "description": "Public flow",
            "assigned_to_user_id": str(caretaker.id),
            "building_id": str(building.id),
        },
    )
    assert create_task.status_code == 200
    task_id = create_task.json()["id"]

    list_response = client.get(
        f"{settings.API_V1_STR}/tasks/public",
        params={"condominio_id": str(condominio.id)},
    )
    assert list_response.status_code == 200
    assert any(item["id"] == task_id for item in list_response.json()["data"])

    detail_response = client.get(
        f"{settings.API_V1_STR}/tasks/public/{task_id}",
        params={"condominio_id": str(condominio.id)},
    )
    assert detail_response.status_code == 200
    assert detail_response.json()["building_id"] == str(building.id)

    message_response = client.post(
        f"{settings.API_V1_STR}/tasks/public/{task_id}/messages",
        params={"condominio_id": str(condominio.id)},
        json={"text": "Starting public task"},
    )
    assert message_response.status_code == 201
    assert message_response.json()["sender_role"] == "caretaker"

    done_response = client.patch(
        f"{settings.API_V1_STR}/tasks/public/{task_id}/status",
        params={"condominio_id": str(condominio.id)},
        json={"status": "done"},
    )
    assert done_response.status_code == 200
    assert done_response.json()["status"] == "done"
