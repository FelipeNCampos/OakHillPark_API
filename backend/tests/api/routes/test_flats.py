import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.core.config import settings
from app.models import Building, BuildingCreate, Condominio, CondominioCreate, Flat, FlatCreate


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


def _create_test_flat(db: Session, building_id: uuid.UUID) -> Flat:
    """Helper to create a test flat."""
    flat_in = FlatCreate(
        numero=101,
        status=False,
        building_id=building_id
    )
    flat = Flat.model_validate(flat_in)
    db.add(flat)
    db.commit()
    db.refresh(flat)
    return flat


def test_read_flats(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test reading all flats."""
    _, building = _create_test_condominio_and_building(db)
    flat = _create_test_flat(db, building.id)
    
    r = client.get(
        f"{settings.API_V1_STR}/flats/",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert "data" in data
    assert "count" in data
    assert data["count"] >= 0


def test_read_flats_unauthorized(client: TestClient) -> None:
    """Test reading flats without authentication."""
    r = client.get(f"{settings.API_V1_STR}/flats/")
    assert r.status_code == 401


def test_read_flat_by_id(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test reading a specific flat by ID."""
    _, building = _create_test_condominio_and_building(db)
    flat = _create_test_flat(db, building.id)
    
    r = client.get(
        f"{settings.API_V1_STR}/flats/{flat.id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == str(flat.id)
    assert data["numero"] == flat.numero
    assert data["status"] == flat.status
    assert data["building_id"] == str(flat.building_id)


def test_read_nonexistent_flat(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Test reading a flat that doesn't exist."""
    nonexistent_id = uuid.uuid4()
    r = client.get(
        f"{settings.API_V1_STR}/flats/{nonexistent_id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 404
    assert r.json() == {"detail": "Flat not found"}


def test_create_flat(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test creating a new flat."""
    _, building = _create_test_condominio_and_building(db)
    
    data = {
        "numero": 202,
        "status": False,
        "building_id": str(building.id)
    }
    r = client.post(
        f"{settings.API_V1_STR}/flats/",
        headers=superuser_token_headers,
        json=data,
    )
    assert r.status_code == 200
    created_flat = r.json()
    assert created_flat["numero"] == data["numero"]
    assert created_flat["status"] == data["status"]
    assert created_flat["building_id"] == data["building_id"]
    
    # Verify it was saved to database
    db_flat = db.exec(
        select(Flat).where(Flat.id == uuid.UUID(created_flat["id"]))
    ).first()
    assert db_flat
    assert db_flat.numero == data["numero"]


def test_create_flat_unauthorized(
    client: TestClient, db: Session
) -> None:
    """Test that unauthenticated users cannot create flats."""
    _, building = _create_test_condominio_and_building(db)
    
    data = {
        "numero": 303,
        "status": False,
        "building_id": str(building.id)
    }
    r = client.post(
        f"{settings.API_V1_STR}/flats/",
        json=data,
    )
    assert r.status_code == 401


def test_update_flat_endpoint_exists(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test that update endpoint exists and responds."""
    _, building = _create_test_condominio_and_building(db)
    flat = _create_test_flat(db, building.id)
    
    update_data = {
        "numero": 999,
        "status": True,
        "building_id": str(building.id)
    }
    r = client.patch(
        f"{settings.API_V1_STR}/flats/{flat.id}",
        headers=superuser_token_headers,
        json=update_data,
    )
    assert r.status_code == 200
    assert "id" in r.json()


def test_update_flat_partial(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test partial update of a flat."""
    _, building = _create_test_condominio_and_building(db)
    flat = _create_test_flat(db, building.id)
    
    update_data = {"status": True}
    r = client.patch(
        f"{settings.API_V1_STR}/flats/{flat.id}",
        headers=superuser_token_headers,
        json=update_data,
    )
    assert r.status_code == 200
    updated_flat = r.json()
    assert updated_flat["status"] is True
    assert updated_flat["numero"] == flat.numero  # Should remain unchanged


def test_update_nonexistent_flat(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test updating a flat that doesn't exist."""
    _, building = _create_test_condominio_and_building(db)
    nonexistent_id = uuid.uuid4()
    
    update_data = {
        "numero": 404,
        "status": True,
        "building_id": str(building.id)
    }
    r = client.patch(
        f"{settings.API_V1_STR}/flats/{nonexistent_id}",
        headers=superuser_token_headers,
        json=update_data,
    )
    assert r.status_code == 404
    assert r.json() == {"detail": "Flat not found"}


def test_delete_flat_endpoint_exists(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Test that delete endpoint exists and responds."""
    nonexistent_id = uuid.uuid4()
    r = client.delete(
        f"{settings.API_V1_STR}/flats/{nonexistent_id}",
        headers=superuser_token_headers,
    )
    assert r.status_code in [200, 404]


def test_delete_nonexistent_flat(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Test deleting a flat that doesn't exist."""
    nonexistent_id = uuid.uuid4()
    r = client.delete(
        f"{settings.API_V1_STR}/flats/{nonexistent_id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 404
    assert r.json() == {"detail": "Flat not found"}
