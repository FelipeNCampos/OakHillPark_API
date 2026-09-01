"""add contractor maintenance references to Calendar sync jobs

Revision ID: d9e6f4b2a8c1
Revises: c8d4e2a1f6b7
Create Date: 2026-09-01 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "d9e6f4b2a8c1"
down_revision = "c8d4e2a1f6b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {
        column["name"] for column in inspector.get_columns("googlecalendarsyncjob")
    }
    if "contractor_maintenance_id" not in columns:
        op.add_column(
            "googlecalendarsyncjob",
            sa.Column("contractor_maintenance_id", sa.Uuid(), nullable=True),
        )
    indexes = {
        index["name"] for index in inspector.get_indexes("googlecalendarsyncjob")
    }
    if "ix_googlecalendarsyncjob_contractor_maintenance_id" not in indexes:
        op.create_index(
            "ix_googlecalendarsyncjob_contractor_maintenance_id",
            "googlecalendarsyncjob",
            ["contractor_maintenance_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    indexes = {
        index["name"] for index in inspector.get_indexes("googlecalendarsyncjob")
    }
    if "ix_googlecalendarsyncjob_contractor_maintenance_id" in indexes:
        op.drop_index(
            "ix_googlecalendarsyncjob_contractor_maintenance_id",
            table_name="googlecalendarsyncjob",
        )
    columns = {
        column["name"] for column in inspector.get_columns("googlecalendarsyncjob")
    }
    if "contractor_maintenance_id" in columns:
        op.drop_column("googlecalendarsyncjob", "contractor_maintenance_id")
