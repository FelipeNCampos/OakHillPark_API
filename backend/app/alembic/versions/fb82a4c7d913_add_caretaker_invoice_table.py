"""add caretaker invoice table

Revision ID: fb82a4c7d913
Revises: fa7c1d9e3b62
Create Date: 2026-05-04 10:30:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "fb82a4c7d913"
down_revision = "fa7c1d9e3b62"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("caretaker_invoice"):
        return

    op.create_table(
        "caretaker_invoice",
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
    op.create_index(
        "ix_caretaker_invoice_invoice_date",
        "caretaker_invoice",
        ["invoice_date"],
    )
    op.create_index(
        "ix_caretaker_invoice_condominio_id",
        "caretaker_invoice",
        ["condominio_id"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("caretaker_invoice"):
        op.drop_index(
            "ix_caretaker_invoice_condominio_id",
            table_name="caretaker_invoice",
        )
        op.drop_index(
            "ix_caretaker_invoice_invoice_date",
            table_name="caretaker_invoice",
        )
        op.drop_table("caretaker_invoice")
