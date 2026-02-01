"""Add cargo to user

Revision ID: 4c2d1f6a8b10
Revises: 3b7f0c5e1c2a
Create Date: 2026-02-01 06:10:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = "4c2d1f6a8b10"
down_revision = "3b7f0c5e1c2a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column("cargo", sa.Integer(), server_default="0", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("user", "cargo")
