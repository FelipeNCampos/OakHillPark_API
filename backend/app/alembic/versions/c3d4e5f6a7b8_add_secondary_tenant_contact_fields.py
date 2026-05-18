"""add secondary tenant contact fields

Revision ID: c3d4e5f6a7b8
Revises: fb82a4c7d913
Create Date: 2026-05-17 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "c3d4e5f6a7b8"
down_revision = "fb82a4c7d913"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("morador"):
        return

    columns = {column["name"] for column in inspector.get_columns("morador")}
    if "tenant_nome_2" not in columns:
        op.add_column(
            "morador",
            sa.Column("tenant_nome_2", sa.String(length=255), nullable=True),
        )
    if "tenant_email_2" not in columns:
        op.add_column(
            "morador",
            sa.Column("tenant_email_2", sa.String(length=255), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("morador"):
        return

    columns = {column["name"] for column in inspector.get_columns("morador")}
    if "tenant_email_2" in columns:
        op.drop_column("morador", "tenant_email_2")
    if "tenant_nome_2" in columns:
        op.drop_column("morador", "tenant_nome_2")
