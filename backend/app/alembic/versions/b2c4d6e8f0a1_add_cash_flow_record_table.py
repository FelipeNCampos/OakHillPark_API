"""add cash flow record table

Revision ID: b2c4d6e8f0a1
Revises: a7c3e4d5f6b1
Create Date: 2026-04-26 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "b2c4d6e8f0a1"
down_revision = "a7c3e4d5f6b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("cash_flow_record"):
        return

    op.create_table(
        "cash_flow_record",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("payment_number", sa.Integer(), nullable=False),
        sa.Column("has_invoice", sa.Boolean(), nullable=False),
        sa.Column("invoice_media_name", sa.String(length=255), nullable=True),
        sa.Column("invoice_media_data", sa.Text(), nullable=True),
        sa.Column("record_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Float(), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=False),
        sa.Column("flat", sa.String(length=100), nullable=False),
        sa.Column("condominio_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["condominio_id"], ["condominio.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_cash_flow_record_condominio_id",
        "cash_flow_record",
        ["condominio_id"],
        unique=False,
    )
    op.create_index(
        "ix_cash_flow_record_payment_number",
        "cash_flow_record",
        ["payment_number"],
        unique=False,
    )
    op.create_index(
        "ix_cash_flow_record_record_date",
        "cash_flow_record",
        ["record_date"],
        unique=False,
    )
    op.create_index(
        "ix_cash_flow_record_flat",
        "cash_flow_record",
        ["flat"],
        unique=False,
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("cash_flow_record"):
        return

    indexes = {index["name"] for index in inspector.get_indexes("cash_flow_record")}
    for index_name in (
        "ix_cash_flow_record_flat",
        "ix_cash_flow_record_record_date",
        "ix_cash_flow_record_payment_number",
        "ix_cash_flow_record_condominio_id",
    ):
        if index_name in indexes:
            op.drop_index(index_name, table_name="cash_flow_record")
    op.drop_table("cash_flow_record")
