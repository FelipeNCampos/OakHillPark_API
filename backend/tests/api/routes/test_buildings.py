import uuid
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app import crud
from app.core.config import settings
from app.models import Building, BuildingCreate, Condominio, CondominioCreate
from tests.utils.user import create_random_user


def _create_test_condominio(db: Session) -> Condominio:
    """Helper to create a test condominio."""
    condominio_in = CondominioCreate(nome="Test Condominio")
    condominio = Condominio.model_validate(condominio_in)
    db.add(condominio)
    db.commit()
    db.refresh(condominio)
    return condominio


def _create_test_building(db: Session, condominio_id: uuid.UUID) -> Building:
    """Helper to create a test building."""
    building_in = BuildingCreate(
        nome="Test Building",
        condominio_id=condominio_id
    )
    building = Building.model_validate(building_in)
    db.add(building)
    db.commit()
    db.refresh(building)
    return building


def test_read_buildings(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test reading all buildings with proper authorization."""
    condominio = _create_test_condominio(db)
    building = _create_test_building(db, condominio.id)
    
    r = client.get(
        f"{settings.API_V1_STR}/buildings/",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert "data" in data
    assert "count" in data
    assert data["count"] >= 0


def test_read_buildings_unauthorized(client: TestClient) -> None:
    """Test reading buildings without authentication."""
    r = client.get(f"{settings.API_V1_STR}/buildings/")
    assert r.status_code == 401


def test_read_building_by_id(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test reading a specific building by ID."""
    condominio = _create_test_condominio(db)
    building = _create_test_building(db, condominio.id)
    
    r = client.get(
        f"{settings.API_V1_STR}/buildings/{building.id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == str(building.id)
    assert data["nome"] == building.nome
    assert data["condominio_id"] == str(building.condominio_id)


def test_read_nonexistent_building(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Test reading a building that doesn't exist."""
    nonexistent_id = uuid.uuid4()
    r = client.get(
        f"{settings.API_V1_STR}/buildings/{nonexistent_id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 404
    assert r.json() == {"detail": "Building not found"}


def test_create_building(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test creating a new building."""
    condominio = _create_test_condominio(db)
    
    data = {
        "nome": "New Building",
        "condominio_id": str(condominio.id)
    }
    r = client.post(
        f"{settings.API_V1_STR}/buildings/",
        headers=superuser_token_headers,
        json=data,
    )
    assert r.status_code == 200
    created_building = r.json()
    assert created_building["nome"] == data["nome"]
    assert created_building["condominio_id"] == data["condominio_id"]
    
    # Verify it was saved to database
    db_building = db.exec(
        select(Building).where(Building.id == uuid.UUID(created_building["id"]))
    ).first()
    assert db_building
    assert db_building.nome == data["nome"]


def test_create_building_unauthorized(client: TestClient, db: Session) -> None:
    """Test that unauthenticated users cannot create buildings."""
    condominio = _create_test_condominio(db)
    
    data = {
        "nome": "Unauthorized Building",
        "condominio_id": str(condominio.id)
    }
    r = client.post(
        f"{settings.API_V1_STR}/buildings/",
        json=data,
    )
    assert r.status_code == 401


def test_update_building_endpoint_exists(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test that update endpoint exists and responds."""
    condominio = _create_test_condominio(db)
    building = _create_test_building(db, condominio.id)
    
    update_data = {
        "nome": "Updated Building Name",
        "condominio_id": str(condominio.id)
    }
    r = client.patch(
        f"{settings.API_V1_STR}/buildings/{building.id}",
        headers=superuser_token_headers,
        json=update_data,
    )
    assert r.status_code == 200
    assert "id" in r.json()


def test_update_nonexistent_building(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test updating a building that doesn't exist."""
    condominio = _create_test_condominio(db)
    nonexistent_id = uuid.uuid4()
    
    update_data = {
        "nome": "Updated Name",
        "condominio_id": str(condominio.id)
    }
    r = client.patch(
        f"{settings.API_V1_STR}/buildings/{nonexistent_id}",
        headers=superuser_token_headers,
        json=update_data,
    )
    assert r.status_code == 404
    assert r.json() == {"detail": "Building not found"}


def test_delete_building_endpoint_exists(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Test that delete endpoint exists and responds."""
    nonexistent_id = uuid.uuid4()
    r = client.delete(
        f"{settings.API_V1_STR}/buildings/{nonexistent_id}",
        headers=superuser_token_headers,
    )
    assert r.status_code in [200, 404]


def test_delete_nonexistent_building(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Test deleting a building that doesn't exist."""
    nonexistent_id = uuid.uuid4()
    r = client.delete(
        f"{settings.API_V1_STR}/buildings/{nonexistent_id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 404
    assert r.json() == {"detail": "Building not found"}
