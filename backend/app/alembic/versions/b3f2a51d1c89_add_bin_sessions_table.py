"""add bin sessions table

Revision ID: b3f2a51d1c89
Revises: 7c1a9f2b4d11
Create Date: 2026-02-28 16:20:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "b3f2a51d1c89"
down_revision = "7c1a9f2b4d11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("binsession"):
        return

    op.create_table(
        "binsession",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.Boolean(), nullable=False),
        sa.Column("data", sa.DateTime(timezone=True), nullable=False),
        sa.Column("operacao", sa.Integer(), nullable=False),
        sa.Column("building_id", sa.Uuid(), nullable=False),
        sa.Column("funcionario_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["building_id"], ["building.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["funcionario_id"], ["funcionario.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("binsession"):
        op.drop_table("binsession")
