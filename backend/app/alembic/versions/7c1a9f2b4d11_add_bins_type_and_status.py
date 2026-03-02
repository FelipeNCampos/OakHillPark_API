"""add bins collection type and status

Revision ID: 7c1a9f2b4d11
Revises: 9f3d1dcb2b8a
Create Date: 2026-02-28 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "7c1a9f2b4d11"
down_revision = "9f3d1dcb2b8a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("binmisscollection"):
        return

    columns = {column["name"] for column in inspector.get_columns("binmisscollection")}

    if "collection_type" not in columns:
        op.add_column(
            "binmisscollection",
            sa.Column(
                "collection_type",
                sa.String(length=20),
                nullable=False,
                server_default="general",
            ),
        )
        op.execute(
            "UPDATE binmisscollection SET collection_type = 'general' WHERE collection_type IS NULL"
        )
        op.alter_column("binmisscollection", "collection_type", server_default=None)

    if "collection_status" not in columns:
        op.add_column(
            "binmisscollection",
            sa.Column(
                "collection_status",
                sa.String(length=20),
                nullable=False,
                server_default="miss",
            ),
        )
        op.execute(
            "UPDATE binmisscollection SET collection_status = CASE WHEN miss_collection THEN 'miss' ELSE 'late' END WHERE collection_status IS NULL"
        )
        op.alter_column("binmisscollection", "collection_status", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("binmisscollection"):
        return

    columns = {column["name"] for column in inspector.get_columns("binmisscollection")}
    if "collection_status" in columns:
        op.drop_column("binmisscollection", "collection_status")
    if "collection_type" in columns:
        op.drop_column("binmisscollection", "collection_type")
