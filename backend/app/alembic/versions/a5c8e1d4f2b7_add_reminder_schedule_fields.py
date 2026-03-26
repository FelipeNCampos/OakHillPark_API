"""add reminder schedule fields

Revision ID: a5c8e1d4f2b7
Revises: f2b6d4c8a1e9
Create Date: 2026-03-26 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "a5c8e1d4f2b7"
down_revision = "f2b6d4c8a1e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("reminder"):
        return

    columns = {column["name"] for column in inspector.get_columns("reminder")}

    if "schedule_unit" not in columns:
        op.add_column(
            "reminder",
            sa.Column(
                "schedule_unit",
                sa.String(length=20),
                nullable=False,
                server_default="week",
            ),
        )
        op.alter_column("reminder", "schedule_unit", server_default=None)

    if "schedule_mode" not in columns:
        op.add_column(
            "reminder",
            sa.Column(
                "schedule_mode",
                sa.String(length=20),
                nullable=False,
                server_default="fixed",
            ),
        )
        op.alter_column("reminder", "schedule_mode", server_default=None)

    if "interval_value" not in columns:
        op.add_column(
            "reminder",
            sa.Column("interval_value", sa.Integer(), nullable=True),
        )

    if "month_mask" not in columns:
        op.add_column(
            "reminder",
            sa.Column("month_mask", sa.Integer(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("reminder"):
        return

    columns = {column["name"] for column in inspector.get_columns("reminder")}
    if "month_mask" in columns:
        op.drop_column("reminder", "month_mask")
    if "interval_value" in columns:
        op.drop_column("reminder", "interval_value")
    if "schedule_mode" in columns:
        op.drop_column("reminder", "schedule_mode")
    if "schedule_unit" in columns:
        op.drop_column("reminder", "schedule_unit")
