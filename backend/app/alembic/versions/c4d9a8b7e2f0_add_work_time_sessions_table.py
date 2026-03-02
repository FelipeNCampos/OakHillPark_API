"""add work time sessions table

Revision ID: c4d9a8b7e2f0
Revises: b3f2a51d1c89
Create Date: 2026-03-01 11:20:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "c4d9a8b7e2f0"
down_revision = "b3f2a51d1c89"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("worktimesession"):
        return

    op.create_table(
        "worktimesession",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.Boolean(), nullable=False),
        sa.Column("data", sa.DateTime(timezone=True), nullable=False),
        sa.Column("operacao", sa.Integer(), nullable=False),
        sa.Column("funcionario_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(
            ["funcionario_id"], ["funcionario.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("worktimesession"):
        op.drop_table("worktimesession")
