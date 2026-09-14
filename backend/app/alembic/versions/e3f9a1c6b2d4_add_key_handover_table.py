"""add key handover table

Revision ID: e3f9a1c6b2d4
Revises: e2b8c1d4f6a9
Create Date: 2026-09-14 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "e3f9a1c6b2d4"
down_revision = "e2b8c1d4f6a9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("keyhandover"):
        return

    op.create_table(
        "keyhandover",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("flat_id", sa.Uuid(), nullable=False),
        sa.Column("key_code", sa.String(length=40), nullable=False),
        sa.Column("holder_name", sa.String(length=255), nullable=False),
        sa.Column("holder_mobile", sa.String(length=30), nullable=False),
        sa.Column("checked_out_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("checked_in_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("returned_by_name", sa.String(length=255), nullable=True),
        sa.Column("returned_by_mobile", sa.String(length=30), nullable=True),
        sa.ForeignKeyConstraint(["flat_id"], ["flat.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_keyhandover_flat_id", "keyhandover", ["flat_id"])
    op.create_index("ix_keyhandover_key_code", "keyhandover", ["key_code"])
    op.execute(
        "CREATE UNIQUE INDEX uq_keyhandover_open_flat "
        "ON keyhandover (flat_id) WHERE checked_in_at IS NULL"
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("keyhandover"):
        op.drop_table("keyhandover")
