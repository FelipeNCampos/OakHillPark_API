"""add extra media to contractor visit

Revision ID: b8d2f4a1c6e9
Revises: a5c8e1d4f2b7
Create Date: 2026-03-26 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "b8d2f4a1c6e9"
down_revision = "a5c8e1d4f2b7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("contractorvisit"):
        return

    columns = {column["name"] for column in inspector.get_columns("contractorvisit")}

    if "extra_media_name" not in columns:
        op.add_column(
            "contractorvisit",
            sa.Column("extra_media_name", sa.String(length=255), nullable=True),
        )

    if "extra_media_data" not in columns:
        op.add_column(
            "contractorvisit",
            sa.Column("extra_media_data", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("contractorvisit"):
        return

    columns = {column["name"] for column in inspector.get_columns("contractorvisit")}

    if "extra_media_data" in columns:
        op.drop_column("contractorvisit", "extra_media_data")
    if "extra_media_name" in columns:
        op.drop_column("contractorvisit", "extra_media_name")
