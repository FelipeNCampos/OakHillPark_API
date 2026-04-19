"""add caretaker monthly goals

Revision ID: f5e6d7c8b9a0
Revises: f1b2c3d4e5a6
Create Date: 2026-04-19 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "f5e6d7c8b9a0"
down_revision = "f1b2c3d4e5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("caretakermonthlygoal"):
        return

    op.create_table(
        "caretakermonthlygoal",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("month_start", sa.Date(), nullable=False),
        sa.Column("target_hours", sa.Float(), nullable=False, server_default="0"),
        sa.Column("condominio_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["condominio_id"], ["condominio.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_caretakermonthlygoal_month_start",
        "caretakermonthlygoal",
        ["month_start"],
        unique=False,
    )
    op.create_index(
        "ix_caretakermonthlygoal_condominio_id",
        "caretakermonthlygoal",
        ["condominio_id"],
        unique=False,
    )
    op.create_index(
        "ix_caretakermonthlygoal_condominio_month_start",
        "caretakermonthlygoal",
        ["condominio_id", "month_start"],
        unique=True,
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("caretakermonthlygoal"):
        return

    op.drop_index(
        "ix_caretakermonthlygoal_condominio_month_start",
        table_name="caretakermonthlygoal",
    )
    op.drop_index(
        "ix_caretakermonthlygoal_condominio_id",
        table_name="caretakermonthlygoal",
    )
    op.drop_index(
        "ix_caretakermonthlygoal_month_start",
        table_name="caretakermonthlygoal",
    )
    op.drop_table("caretakermonthlygoal")
