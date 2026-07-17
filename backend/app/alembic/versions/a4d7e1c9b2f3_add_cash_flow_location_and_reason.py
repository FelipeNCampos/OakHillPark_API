"""add location and reason to cash flow records

Revision ID: a4d7e1c9b2f3
Revises: a3c6e9f2b5d8
Create Date: 2026-07-17 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "a4d7e1c9b2f3"
down_revision = "a3c6e9f2b5d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("cash_flow_record"):
        return

    columns = {column["name"] for column in inspector.get_columns("cash_flow_record")}
    for name, length in (("location", 255), ("reason", 500)):
        if name not in columns:
            op.add_column(
                "cash_flow_record",
                sa.Column(name, sa.String(length=length), nullable=False, server_default=""),
            )
            op.alter_column("cash_flow_record", name, server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("cash_flow_record"):
        return

    columns = {column["name"] for column in inspector.get_columns("cash_flow_record")}
    for name in ("reason", "location"):
        if name in columns:
            op.drop_column("cash_flow_record", name)
