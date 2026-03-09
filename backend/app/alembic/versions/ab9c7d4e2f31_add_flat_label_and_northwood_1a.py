"""add flat label and northwood 1a

Revision ID: ab9c7d4e2f31
Revises: f4b7c2d9a6e1
Create Date: 2026-03-09 12:40:00.000000

"""

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "ab9c7d4e2f31"
down_revision = "f4b7c2d9a6e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("flat"):
        return

    columns = {column["name"] for column in inspector.get_columns("flat")}
    if "label" not in columns:
        op.add_column("flat", sa.Column("label", sa.String(length=20), nullable=True))

    if not inspector.has_table("building"):
        return

    northwood_id = bind.execute(
        sa.text("SELECT id FROM building WHERE nome = :name LIMIT 1"),
        {"name": "Northwood"},
    ).scalar()
    if not northwood_id:
        return

    existing_flat_id = bind.execute(
        sa.text(
            """
            SELECT id
            FROM flat
            WHERE building_id = :building_id
              AND numero = 1
              AND label = :label
            LIMIT 1
            """
        ),
        {"building_id": northwood_id, "label": "1A"},
    ).scalar()
    if existing_flat_id:
        return

    bind.execute(
        sa.text(
            """
            INSERT INTO flat (
              id,
              numero,
              label,
              status,
              occupied,
              reading_types,
              building_id,
              car1,
              car2,
              car3
            ) VALUES (
              :id,
              :numero,
              :label,
              :status,
              :occupied,
              :reading_types,
              :building_id,
              NULL,
              NULL,
              NULL
            )
            """
        ),
        {
            "id": str(uuid.uuid4()),
            "numero": 1,
            "label": "1A",
            "status": True,
            "occupied": False,
            "reading_types": 0,
            "building_id": northwood_id,
        },
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("flat"):
        return

    if inspector.has_table("building"):
        northwood_id = bind.execute(
            sa.text("SELECT id FROM building WHERE nome = :name LIMIT 1"),
            {"name": "Northwood"},
        ).scalar()
        if northwood_id:
            bind.execute(
                sa.text(
                    """
                    DELETE FROM flat
                    WHERE building_id = :building_id
                      AND numero = 1
                      AND label = :label
                    """
                ),
                {"building_id": northwood_id, "label": "1A"},
            )

    columns = {column["name"] for column in inspector.get_columns("flat")}
    if "label" in columns:
        op.drop_column("flat", "label")
