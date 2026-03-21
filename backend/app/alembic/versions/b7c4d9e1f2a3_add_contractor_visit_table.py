"""add contractor visit table

Revision ID: b7c4d9e1f2a3
Revises: a1b2c3d4e5f6
Create Date: 2026-03-21 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "b7c4d9e1f2a3"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("contractorvisit"):
        return

    op.create_table(
        "contractorvisit",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("company", sa.String(length=255), nullable=False),
        sa.Column("car_reg", sa.String(length=50), nullable=False),
        sa.Column("block", sa.String(length=100), nullable=False),
        sa.Column("mobile", sa.String(length=30), nullable=False),
        sa.Column("in_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("out_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("condominio_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["condominio_id"], ["condominio.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_contractorvisit_condominio_id",
        "contractorvisit",
        ["condominio_id"],
        unique=False,
    )
    op.create_index(
        "ix_contractorvisit_in_at",
        "contractorvisit",
        ["in_at"],
        unique=False,
    )
    op.create_index(
        "ix_contractorvisit_out_at",
        "contractorvisit",
        ["out_at"],
        unique=False,
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("contractorvisit"):
        return

    indexes = {index["name"] for index in inspector.get_indexes("contractorvisit")}
    if "ix_contractorvisit_out_at" in indexes:
        op.drop_index("ix_contractorvisit_out_at", table_name="contractorvisit")
    if "ix_contractorvisit_in_at" in indexes:
        op.drop_index("ix_contractorvisit_in_at", table_name="contractorvisit")
    if "ix_contractorvisit_condominio_id" in indexes:
        op.drop_index("ix_contractorvisit_condominio_id", table_name="contractorvisit")
    op.drop_table("contractorvisit")
