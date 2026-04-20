import uuid

from fastapi.testclient import TestClient
from sqlmodel import Session

from app.core.config import settings
from app.models import (
    Building,
    BuildingCreate,
    Condominio,
    CondominioCreate,
    Flat,
    FlatCreate,
    Morador,
    MoradorCreate,
)
from tests.utils.utils import random_email


def _create_test_condominio_flat(db: Session) -> tuple[Condominio, Building, Flat]:
    """Helper to create test condominio, building, and flat."""
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
    db.flush()

    flat_in = FlatCreate(
        numero=101,
        status=False,
        building_id=building.id
    )
    flat = Flat.model_validate(flat_in)
    db.add(flat)
    db.commit()
    db.refresh(flat)
    return condominio, building, flat


def _create_test_morador(db: Session, flat_id: uuid.UUID) -> Morador:
    """Helper to create a test morador."""
    morador_in = MoradorCreate(
        cargo=1,
        nome="Test Morador",
        email=random_email(),
        mobile="1234567890",
        receives_flat_reading_sms=False,
        flat_id=flat_id
    )
    morador = Morador.model_validate(morador_in)
    db.add(morador)
    db.commit()
    db.refresh(morador)
    return morador


def test_read_moradores(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test reading all moradores."""
    _, _, flat = _create_test_condominio_flat(db)
    morador = _create_test_morador(db, flat.id)

    r = client.get(
        f"{settings.API_V1_STR}/moradores/",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert "data" in data
    assert "count" in data
    assert data["count"] >= 1
    assert any(m["id"] == str(morador.id) for m in data["data"])


def test_read_moradores_unauthorized(client: TestClient) -> None:
    """Test reading moradores without authentication."""
    r = client.get(f"{settings.API_V1_STR}/moradores/")
    assert r.status_code == 401


def test_read_morador_by_id(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test reading a specific morador by ID."""
    _, _, flat = _create_test_condominio_flat(db)
    flat.car1 = "ABC1234"
    db.add(flat)
    db.commit()
    db.refresh(flat)
    morador = _create_test_morador(db, flat.id)

    r = client.get(
        f"{settings.API_V1_STR}/moradores/{morador.id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == str(morador.id)
    assert data["nome"] == morador.nome
    assert data["cargo"] == morador.cargo
    assert data["email"] == morador.email
    assert data["flat_id"] == str(morador.flat_id)
    assert data["receives_flat_reading_sms"] is False
    assert data["receives_twilio_sms"] is False
    assert data["car1"] == "ABC1234"


def test_read_nonexistent_morador(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Test reading a morador that doesn't exist."""
    nonexistent_id = uuid.uuid4()
    r = client.get(
        f"{settings.API_V1_STR}/moradores/{nonexistent_id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 404
    assert r.json() == {"detail": "Morador not found"}


def test_create_morador(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test creating a new morador."""
    _, _, flat = _create_test_condominio_flat(db)

    email = random_email()
    data = {
        "cargo": 1,
        "nome": "New Morador",
        "email": email,
        "mobile": "987654",
        "car1": "XYZ9999",
        "flat_id": str(flat.id)
    }
    r = client.post(
        f"{settings.API_V1_STR}/moradores/",
        headers=superuser_token_headers,
        json=data,
    )
    assert r.status_code == 200
    created_morador = r.json()
    assert created_morador["nome"] == data["nome"]
    assert created_morador["cargo"] == data["cargo"]
    assert created_morador["email"] == data["email"]
    assert created_morador["receives_flat_reading_sms"] is False
    assert created_morador["receives_twilio_sms"] is False
    assert created_morador["car1"] == data["car1"]
    db.refresh(flat)
    assert flat.car1 == data["car1"]


def test_create_morador_without_permission(
    client: TestClient, normal_user_token_headers: dict[str, str], db: Session
) -> None:
    """Test that normal users cannot create moradores."""
    _, _, flat = _create_test_condominio_flat(db)

    data = {
        "cargo": 1,
        "nome": "Unauthorized Morador",
        "email": random_email(),
        "mobile": 111111111,
        "flat_id": str(flat.id)
    }
    r = client.post(
        f"{settings.API_V1_STR}/moradores/",
        headers=normal_user_token_headers,
        json=data,
    )
    assert r.status_code == 403


def test_update_morador(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test updating a morador."""
    _, _, flat = _create_test_condominio_flat(db)
    morador = _create_test_morador(db, flat.id)

    new_email = random_email()
    update_data = {
        "cargo": 3,
        "nome": "Updated Morador",
        "email": new_email,
        "mobile": "555555555",
        "car1": "UPD1111",
        "flat_id": str(flat.id)
    }
    r = client.patch(
        f"{settings.API_V1_STR}/moradores/{morador.id}",
        headers=superuser_token_headers,
        json=update_data,
    )
    assert r.status_code == 200
    updated_morador = r.json()
    assert updated_morador["nome"] == update_data["nome"]
    assert updated_morador["cargo"] == update_data["cargo"]
    assert updated_morador["email"] == update_data["email"]
    assert updated_morador["car1"] == update_data["car1"]
    db.refresh(flat)
    assert flat.car1 == update_data["car1"]


def test_read_moradores_returns_flat_car_plates(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    _, _, flat = _create_test_condominio_flat(db)
    flat.car1 = "PLATE101"
    flat.car2 = "PLATE202"
    db.add(flat)
    db.commit()
    db.refresh(flat)
    morador = _create_test_morador(db, flat.id)

    response = client.get(
        f"{settings.API_V1_STR}/moradores/",
        headers=superuser_token_headers,
    )

    assert response.status_code == 200
    listed = next(
        item
        for item in response.json()["data"]
        if item["id"] == str(morador.id)
    )
    assert listed["car1"] == "PLATE101"
    assert listed["car2"] == "PLATE202"


def test_update_morador_sms_preference(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    _, _, flat = _create_test_condominio_flat(db)
    morador = _create_test_morador(db, flat.id)

    response = client.patch(
        f"{settings.API_V1_STR}/moradores/{morador.id}",
        headers=superuser_token_headers,
        json={"receives_flat_reading_sms": True},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["receives_flat_reading_sms"] is True


def test_update_morador_to_labeled_flat(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    _, building, flat = _create_test_condominio_flat(db)
    labeled_flat = Flat.model_validate(
        FlatCreate(
            numero=101,
            label="1A",
            status=True,
            building_id=building.id,
        )
    )
    db.add(labeled_flat)
    db.commit()
    db.refresh(labeled_flat)

    morador = _create_test_morador(db, flat.id)

    response = client.patch(
        f"{settings.API_V1_STR}/moradores/{morador.id}",
        headers=superuser_token_headers,
        json={"flat_id": str(labeled_flat.id)},
    )
    assert response.status_code == 200
    assert response.json()["flat_id"] == str(labeled_flat.id)

    list_response = client.get(
        f"{settings.API_V1_STR}/moradores/",
        headers=superuser_token_headers,
    )
    assert list_response.status_code == 200
    listed = next(
        item
        for item in list_response.json()["data"]
        if item["id"] == str(morador.id)
    )
    assert listed["flat_numero"] == 101
    assert listed["flat_label"] == "1A"


def test_update_morador_partial(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test partial update of a morador."""
    _, _, flat = _create_test_condominio_flat(db)
    morador = _create_test_morador(db, flat.id)

    update_data = {"cargo": 0}
    r = client.patch(
        f"{settings.API_V1_STR}/moradores/{morador.id}",
        headers=superuser_token_headers,
        json=update_data,
    )
    assert r.status_code == 200
    updated_morador = r.json()
    assert updated_morador["cargo"] == 0
    assert updated_morador["nome"] == morador.nome  # Should remain unchanged


def test_update_nonexistent_morador(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test updating a morador that doesn't exist."""
    _, _, flat = _create_test_condominio_flat(db)
    nonexistent_id = uuid.uuid4()

    update_data = {
        "cargo": 1,
        "nome": "Ghost Morador",
        "email": random_email(),
        "flat_id": str(flat.id)
    }
    r = client.patch(
        f"{settings.API_V1_STR}/moradores/{nonexistent_id}",
        headers=superuser_token_headers,
        json=update_data,
    )
    assert r.status_code == 404
    assert r.json() == {"detail": "Morador not found"}


def test_delete_morador(
    client: TestClient, superuser_token_headers: dict[str, str], db: Session
) -> None:
    """Test deleting a morador."""
    _, _, flat = _create_test_condominio_flat(db)
    morador = _create_test_morador(db, flat.id)
    morador_id = morador.id

    r = client.delete(
        f"{settings.API_V1_STR}/moradores/{morador_id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 200


def test_delete_nonexistent_morador(
    client: TestClient, superuser_token_headers: dict[str, str]
) -> None:
    """Test deleting a morador that doesn't exist."""
    nonexistent_id = uuid.uuid4()
    r = client.delete(
        f"{settings.API_V1_STR}/moradores/{nonexistent_id}",
        headers=superuser_token_headers,
    )
    assert r.status_code == 404
    assert r.json() == {"detail": "Morador not found"}
