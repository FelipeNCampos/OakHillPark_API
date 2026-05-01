"""remove cash flow flat

Revision ID: d7e3f9a2c5b1
Revises: b2c4d6e8f0a1
Create Date: 2026-05-01 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "d7e3f9a2c5b1"
down_revision = "b2c4d6e8f0a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("cash_flow_record"):
        return

    indexes = {index["name"] for index in inspector.get_indexes("cash_flow_record")}
    if "ix_cash_flow_record_flat" in indexes:
        op.drop_index("ix_cash_flow_record_flat", table_name="cash_flow_record")

    columns = {column["name"] for column in inspector.get_columns("cash_flow_record")}
    if "flat" in columns:
        op.drop_column("cash_flow_record", "flat")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("cash_flow_record"):
        return

    columns = {column["name"] for column in inspector.get_columns("cash_flow_record")}
    if "flat" not in columns:
        op.add_column(
            "cash_flow_record",
            sa.Column("flat", sa.String(length=100), nullable=False, server_default=""),
        )
        op.alter_column("cash_flow_record", "flat", server_default=None)

    indexes = {index["name"] for index in inspector.get_indexes("cash_flow_record")}
    if "ix_cash_flow_record_flat" not in indexes:
        op.create_index(
            "ix_cash_flow_record_flat",
            "cash_flow_record",
            ["flat"],
            unique=False,
        )
