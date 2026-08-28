"""add caretaker monthly goals enabled setting

Revision ID: d3e7f1a9c5b2
Revises: c1e8f4a6b2d9
Create Date: 2026-08-28 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "d3e7f1a9c5b2"
down_revision = "c1e8f4a6b2d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("condominio"):
        return

    columns = {column["name"] for column in inspector.get_columns("condominio")}
    if "caretaker_monthly_goals_enabled" not in columns:
        op.add_column(
            "condominio",
            sa.Column(
                "caretaker_monthly_goals_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("condominio"):
        return

    columns = {column["name"] for column in inspector.get_columns("condominio")}
    if "caretaker_monthly_goals_enabled" in columns:
        op.drop_column("condominio", "caretaker_monthly_goals_enabled")
