"""add Estate OHP contractor location

Revision ID: f6a2c8d4e1b9
Revises: e3a9b4c7d2f1
Create Date: 2026-07-16 00:00:00.000000
"""

import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "f6a2c8d4e1b9"
down_revision = "e3a9b4c7d2f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("building") or not inspector.has_table("condominio"):
        return

    condominio_ids = bind.execute(sa.text("SELECT id FROM condominio")).scalars()
    for condominio_id in condominio_ids:
        exists = bind.execute(
            sa.text(
                "SELECT 1 FROM building "
                "WHERE condominio_id = :condominio_id AND nome = :name"
            ),
            {"condominio_id": condominio_id, "name": "Estate OHP"},
        ).first()
        if not exists:
            bind.execute(
                sa.text(
                    "INSERT INTO building "
                    "(id, nome, condominio_id, reading_types) "
                    "VALUES (:id, :name, :condominio_id, :reading_types)"
                ),
                {
                    "id": uuid.uuid4(),
                    "name": "Estate OHP",
                    "condominio_id": condominio_id,
                    "reading_types": 0,
                },
            )


def downgrade() -> None:
    # Keep existing Estate OHP records intact: by this point they can be
    # referenced by operational data and deleting them would cascade data loss.
    pass
