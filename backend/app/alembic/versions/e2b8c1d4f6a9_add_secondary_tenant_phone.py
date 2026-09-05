"""add secondary tenant phone

Revision ID: e2b8c1d4f6a9
Revises: e1a7c5d9b2f4
Create Date: 2026-09-04 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "e2b8c1d4f6a9"
down_revision = "e1a7c5d9b2f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("morador"):
        return

    columns = {column["name"] for column in inspector.get_columns("morador")}
    if "tenant_mobile_2" not in columns:
        op.add_column(
            "morador",
            sa.Column("tenant_mobile_2", sa.String(length=20), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("morador"):
        return

    columns = {column["name"] for column in inspector.get_columns("morador")}
    if "tenant_mobile_2" in columns:
        op.drop_column("morador", "tenant_mobile_2")
