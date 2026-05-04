"""add cleaner invoice table

Revision ID: fa7c1d9e3b62
Revises: e9b1c6d4a2f8
Create Date: 2026-05-04 10:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "fa7c1d9e3b62"
down_revision = "e9b1c6d4a2f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("cleaner_invoice"):
        return

    op.create_table(
        "cleaner_invoice",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("invoice_date", sa.Date(), nullable=False),
        sa.Column("media_name", sa.String(length=255), nullable=True),
        sa.Column("media_data", sa.Text(), nullable=False),
        sa.Column("condominio_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["condominio_id"],
            ["condominio.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_cleaner_invoice_invoice_date", "cleaner_invoice", ["invoice_date"])
    op.create_index("ix_cleaner_invoice_condominio_id", "cleaner_invoice", ["condominio_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("cleaner_invoice"):
        op.drop_index("ix_cleaner_invoice_condominio_id", table_name="cleaner_invoice")
        op.drop_index("ix_cleaner_invoice_invoice_date", table_name="cleaner_invoice")
        op.drop_table("cleaner_invoice")
