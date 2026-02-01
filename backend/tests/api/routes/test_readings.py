import uuid
from datetime import datetime

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import (
    Building,
    BuildingCreate,
    Condominio,
    CondominioCreate,
    Readings,
    ReadingsCreate,
    ReadingsUpdate,
)


def _create_test_condominio_and_building(db: Session) -> tuple[Condominio, Building]:
    """Helper to create a test condominio and building."""
    condominio_in = CondominioCreate(nome="Test Condominio")
    condominio = Condominio.model_validate(condominio_in)
    db.add(condominio)
    db.flush()
    
    building_in = BuildingCreate(
        nome="Test Building",
        condominio_id=condominio.id
    )
    building = Building.model_validate(building_in)
    db.add(building)
    db.commit()
    db.refresh(building)
    return condominio, building


def _create_test_reading(db: Session, building_id: uuid.UUID) -> Readings:
    """Helper to create a test reading."""
    reading_in = ReadingsCreate(
        tipo=1,
        valor=100,
        building_id=building_id
    )
    reading = Readings.model_validate(reading_in)
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return reading


def test_read_readings(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test reading all readings."""
    _, building = _create_test_condominio_and_building(db)
    reading = _create_test_reading(db, building.id)
    
    r = client.get(
        f"{settings.API_V1_STR}/readings/",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert "data" in data
    assert "count" in data
    assert data["count"] >= 0


def test_read_readings_with_pagination(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test reading readings with pagination."""
    _, building = _create_test_condominio_and_building(db)
    
    # Create multiple readings
    for i in range(15):
        _create_test_reading(db, building.id)
    
    # Test default limit
    r = client.get(
        f"{settings.API_V1_STR}/readings/?skip=0&limit=10",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert len(data["data"]) == 10
    assert data["count"] >= 15


def test_read_readings_without_permission(
    client: TestClient, normal_user_token_headers: dict[str, str]
) -> None:
    """Test that normal users cannot read readings."""
    r = client.get(
        f"{settings.API_V1_STR}/readings/",
        headers=normal_user_token_headers,
    )
    assert r.status_code == 403


def test_read_readings_unauthorized(client: TestClient) -> None:
    """Test reading readings without authentication."""
    r = client.get(f"{settings.API_V1_STR}/readings/")
    assert r.status_code == 401


def test_read_reading_by_id(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test reading a specific reading by ID."""
    _, building = _create_test_condominio_and_building(db)
    reading = _create_test_reading(db, building.id)
    
    r = client.get(
        f"{settings.API_V1_STR}/readings/{reading.id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == str(reading.id)
    assert data["tipo"] == reading.tipo
    assert data["valor"] == reading.valor
    assert data["building_id"] == str(reading.building_id)


def test_read_nonexistent_reading(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Test reading a reading that doesn't exist."""
    nonexistent_id = uuid.uuid4()
    r = client.get(
        f"{settings.API_V1_STR}/readings/{nonexistent_id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 404
    assert r.json() == {"detail": "Reading not found"}


def test_create_reading(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test creating a new reading."""
    _, building = _create_test_condominio_and_building(db)
    
    data = {
        "tipo": 2,
        "valor": 250,
        "building_id": str(building.id)
    }
    r = client.post(
        f"{settings.API_V1_STR}/readings/",
        headers=superuser_token_headers,
        json=data,
    )
    assert r.status_code == 200
    created_reading = r.json()
    assert created_reading["tipo"] == data["tipo"]
    assert created_reading["valor"] == data["valor"]
    assert created_reading["building_id"] == data["building_id"]
    
    # Verify it was saved to database
    db_reading = db.exec(
        select(Readings).where(Readings.id == uuid.UUID(created_reading["id"]))
    ).first()
    assert db_reading
    assert db_reading.tipo == data["tipo"]
    assert db_reading.valor == data["valor"]


def test_create_reading_without_permission(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    """Test that normal users cannot create readings."""
    _, building = _create_test_condominio_and_building(db)
    
    data = {
        "tipo": 3,
        "valor": 300,
        "building_id": str(building.id)
    }
    r = client.post(
        f"{settings.API_V1_STR}/readings/",
        headers=normal_user_token_headers,
        json=data,
    )
    assert r.status_code == 403


def test_update_reading(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test updating a reading."""
    _, building = _create_test_condominio_and_building(db)
    reading = _create_test_reading(db, building.id)
    
    update_data = {
        "tipo": 2,
        "valor": 500,
        "building_id": str(building.id)
    }
    r = client.patch(
        f"{settings.API_V1_STR}/readings/{reading.id}",
        headers=superuser_token_headers,
        json=update_data,
    )
    assert r.status_code == 200
    updated_reading = r.json()
    assert updated_reading["tipo"] == update_data["tipo"]
    assert updated_reading["valor"] == update_data["valor"]


def test_update_reading_partial(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test partial update of a reading."""
    _, building = _create_test_condominio_and_building(db)
    reading = _create_test_reading(db, building.id)
    
    update_data = {"valor": 777}
    r = client.patch(
        f"{settings.API_V1_STR}/readings/{reading.id}",
        headers=superuser_token_headers,
        json=update_data,
    )
    assert r.status_code == 200
    updated_reading = r.json()
    assert updated_reading["valor"] == 777
    assert updated_reading["tipo"] == reading.tipo  # Should remain unchanged


def test_update_nonexistent_reading(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test updating a reading that doesn't exist."""
    _, building = _create_test_condominio_and_building(db)
    nonexistent_id = uuid.uuid4()
    
    update_data = {
        "tipo": 1,
        "valor": 999,
        "building_id": str(building.id)
    }
    r = client.patch(
        f"{settings.API_V1_STR}/readings/{nonexistent_id}",
        headers=superuser_token_headers,
        json=update_data,
    )
    assert r.status_code == 404
    assert r.json() == {"detail": "Reading not found"}


def test_delete_reading(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test deleting a reading."""
    _, building = _create_test_condominio_and_building(db)
    reading = _create_test_reading(db, building.id)
    reading_id = reading.id
    
    r = client.delete(
        f"{settings.API_V1_STR}/readings/{reading_id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200


def test_delete_nonexistent_reading(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Test deleting a reading that doesn't exist."""
    nonexistent_id = uuid.uuid4()
    r = client.delete(
        f"{settings.API_V1_STR}/readings/{nonexistent_id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 404
    assert r.json() == {"detail": "Reading not found"}
