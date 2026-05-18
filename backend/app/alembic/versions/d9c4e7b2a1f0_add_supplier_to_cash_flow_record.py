"""add supplier to cash flow record

Revision ID: d9c4e7b2a1f0
Revises: c3d4e5f6a7b8
Create Date: 2026-05-18 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "d9c4e7b2a1f0"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("cash_flow_record"):
        return

    columns = {column["name"] for column in inspector.get_columns("cash_flow_record")}
    if "supplier" not in columns:
        op.add_column(
            "cash_flow_record",
            sa.Column(
                "supplier",
                sa.String(length=255),
                nullable=False,
                server_default="",
            ),
        )
        op.alter_column(
            "cash_flow_record",
            "supplier",
            server_default=None,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("cash_flow_record"):
        return

    columns = {column["name"] for column in inspector.get_columns("cash_flow_record")}
    if "supplier" in columns:
        op.drop_column("cash_flow_record", "supplier")
