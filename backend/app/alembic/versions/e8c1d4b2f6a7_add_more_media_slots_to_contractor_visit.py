"""add more media slots to contractor visit

Revision ID: e8c1d4b2f6a7
Revises: d4e8f1a2b3c4
Create Date: 2026-04-01 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "e8c1d4b2f6a7"
down_revision = "d4e8f1a2b3c4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("contractorvisit"):
        return

    columns = {column["name"] for column in inspector.get_columns("contractorvisit")}

    media_columns = (
        ("extra_media_2_name", sa.String(length=255)),
        ("extra_media_2_data", sa.Text()),
        ("extra_media_3_name", sa.String(length=255)),
        ("extra_media_3_data", sa.Text()),
        ("extra_media_4_name", sa.String(length=255)),
        ("extra_media_4_data", sa.Text()),
    )

    for column_name, column_type in media_columns:
        if column_name in columns:
            continue
        op.add_column(
            "contractorvisit",
            sa.Column(column_name, column_type, nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("contractorvisit"):
        return

    columns = {column["name"] for column in inspector.get_columns("contractorvisit")}

    for column_name in (
        "extra_media_4_data",
        "extra_media_4_name",
        "extra_media_3_data",
        "extra_media_3_name",
        "extra_media_2_data",
        "extra_media_2_name",
    ):
        if column_name in columns:
            op.drop_column("contractorvisit", column_name)
