"""add morador twilio sms flag

Revision ID: f2b6d4c8a1e9
Revises: e4f1a9c2b7d3
Create Date: 2026-03-26 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect, text

# revision identifiers, used by Alembic.
revision = "f2b6d4c8a1e9"
down_revision = "e4f1a9c2b7d3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("morador"):
        return

    columns = {column["name"] for column in inspector.get_columns("morador")}
    if "receives_twilio_sms" not in columns:
        op.add_column(
            "morador",
            sa.Column(
                "receives_twilio_sms",
                sa.Boolean(),
                nullable=False,
                server_default=sa.true(),
            ),
        )
        op.execute(text("UPDATE morador SET receives_twilio_sms = TRUE"))
        op.alter_column("morador", "receives_twilio_sms", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("morador"):
        return

    columns = {column["name"] for column in inspector.get_columns("morador")}
    if "receives_twilio_sms" in columns:
        op.drop_column("morador", "receives_twilio_sms")
