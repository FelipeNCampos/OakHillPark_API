"""default morador twilio sms to false

Revision ID: c9f7a6b5d4e3
Revises: b8d2f4a1c6e9
Create Date: 2026-03-26 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect, text

# revision identifiers, used by Alembic.
revision = "c9f7a6b5d4e3"
down_revision = "b8d2f4a1c6e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("morador"):
        return

    columns = {column["name"] for column in inspector.get_columns("morador")}
    if "receives_twilio_sms" not in columns:
        return

    op.execute(text("UPDATE morador SET receives_twilio_sms = FALSE"))
    op.alter_column(
        "morador",
        "receives_twilio_sms",
        existing_type=sa.Boolean(),
        existing_nullable=False,
        server_default=sa.false(),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("morador"):
        return

    columns = {column["name"] for column in inspector.get_columns("morador")}
    if "receives_twilio_sms" not in columns:
        return

    op.execute(text("UPDATE morador SET receives_twilio_sms = TRUE"))
    op.alter_column(
        "morador",
        "receives_twilio_sms",
        existing_type=sa.Boolean(),
        existing_nullable=False,
        server_default=None,
    )
