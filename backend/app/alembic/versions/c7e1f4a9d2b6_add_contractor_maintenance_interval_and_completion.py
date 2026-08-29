"""add contractor maintenance schedule configuration

Revision ID: c7e1f4a9d2b6
Revises: b5e8f2a6c4d1
Create Date: 2026-08-29 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "c7e1f4a9d2b6"
down_revision = "b5e8f2a6c4d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("contractormaintenance"):
        return

    columns = {
        column["name"] for column in inspector.get_columns("contractormaintenance")
    }
    if "frequency_unit" not in columns:
        op.add_column(
            "contractormaintenance",
            sa.Column(
                "frequency_unit",
                sa.String(length=10),
                nullable=False,
                server_default="days",
            ),
        )
    if "frequency_value" not in columns:
        op.add_column(
            "contractormaintenance",
            sa.Column("frequency_value", sa.Integer(), nullable=True),
        )
        op.execute(
            "UPDATE contractormaintenance "
            "SET frequency_value = frequency_days "
            "WHERE frequency_value IS NULL"
        )
        op.alter_column("contractormaintenance", "frequency_value", nullable=False)
    if "last_completed_at" not in columns:
        op.add_column(
            "contractormaintenance",
            sa.Column("last_completed_at", sa.DateTime(timezone=True), nullable=True),
        )

    inspector = inspect(bind)
    if not inspector.has_table("contractormaintenancefilter"):
        op.create_table(
            "contractormaintenancefilter",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("field", sa.String(length=30), nullable=False),
            sa.Column("value", sa.String(length=255), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("maintenance_id", sa.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(
                ["maintenance_id"],
                ["contractormaintenance.id"],
                ondelete="CASCADE",
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_contractormaintenancefilter_maintenance_id",
            "contractormaintenancefilter",
            ["maintenance_id"],
        )
        op.create_index(
            "ix_contractormaintenancefilter_maintenance_field",
            "contractormaintenancefilter",
            ["maintenance_id", "field"],
            unique=True,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("contractormaintenance"):
        return

    if inspector.has_table("contractormaintenancefilter"):
        op.drop_table("contractormaintenancefilter")

    columns = {
        column["name"] for column in inspector.get_columns("contractormaintenance")
    }
    for column in ("last_completed_at", "frequency_value", "frequency_unit"):
        if column in columns:
            op.drop_column("contractormaintenance", column)
