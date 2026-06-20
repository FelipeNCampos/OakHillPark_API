"""enable northwood 1 garage readings

Revision ID: e3a9b4c7d2f1
Revises: d2f8a7c9b1e4
Create Date: 2026-06-20 00:00:01.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "e3a9b4c7d2f1"
down_revision = "d2f8a7c9b1e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("flat") or not inspector.has_table("building"):
        return

    bind.execute(
        sa.text(
            """
            UPDATE flat
            SET reading_types = reading_types | 8
            WHERE numero = 1
              AND (label IS NULL OR label = '')
              AND building_id IN (
                SELECT id FROM building WHERE lower(nome) = 'northwood'
              )
            """
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("flat") or not inspector.has_table("building"):
        return

    bind.execute(
        sa.text(
            """
            UPDATE flat
            SET reading_types = reading_types & ~8
            WHERE numero = 1
              AND (label IS NULL OR label = '')
              AND building_id IN (
                SELECT id FROM building WHERE lower(nome) = 'northwood'
              )
            """
        )
    )
