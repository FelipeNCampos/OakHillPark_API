"""add morador flat reading sms flag

Revision ID: f8d3b2a1c4e5
Revises: c4d9a8b7e2f0
Create Date: 2026-03-15 11:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "f8d3b2a1c4e5"
down_revision = "c4d9a8b7e2f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("morador"):
        return

    columns = {column["name"] for column in inspector.get_columns("morador")}
    if "receives_flat_reading_sms" not in columns:
        op.add_column(
            "morador",
            sa.Column(
                "receives_flat_reading_sms",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            ),
        )

    op.execute(
        sa.text(
            "UPDATE morador "
            "SET receives_flat_reading_sms = TRUE "
            "WHERE cargo = 0"
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("morador"):
        return

    columns = {column["name"] for column in inspector.get_columns("morador")}
    if "receives_flat_reading_sms" in columns:
        op.drop_column("morador", "receives_flat_reading_sms")
