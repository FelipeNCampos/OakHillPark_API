import uuid

from sqlmodel import Session, select

from app.initial_data import ensure_maintenance_schedule_seed
from app.models import (
    Condominio,
    CondominioCreate,
    ContractorMaintenance,
    ContractorMaintenanceCategory,
)


def test_maintenance_seed_creates_each_mock_once(db: Session) -> None:
    condominio = Condominio.model_validate(
        CondominioCreate(nome=f"Test maintenance seed {uuid.uuid4()}")
    )
    db.add(condominio)
    db.commit()
    db.refresh(condominio)

    ensure_maintenance_schedule_seed(db, condominio)
    ensure_maintenance_schedule_seed(db, condominio)

    seeded_items = db.exec(
        select(ContractorMaintenance).where(
            ContractorMaintenance.condominio_id == condominio.id,
            ContractorMaintenance.notes.contains("Mock seed data only"),
        )
    ).all()
    seeded_categories = db.exec(
        select(ContractorMaintenanceCategory).where(
            ContractorMaintenanceCategory.condominio_id == condominio.id,
        )
    ).all()

    assert len(seeded_items) == 30
    assert len(seeded_categories) == 5
    assert sum(item.last_completed_at is not None for item in seeded_items) == 27
    assert sum(item.last_completed_at is None for item in seeded_items) == 3
