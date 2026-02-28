"""add bin miss collection table

Revision ID: 2a6b6e8cb1c7
Revises: ec2ae5cfd92a
Create Date: 2026-02-27 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "2a6b6e8cb1c7"
down_revision = "ec2ae5cfd92a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("binmisscollection"):
        return

    op.create_table(
        "binmisscollection",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("data", sa.DateTime(timezone=True), nullable=False),
        sa.Column("miss_collection", sa.Boolean(), nullable=False),
        sa.Column("building_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["building_id"], ["building.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("binmisscollection"):
        op.drop_table("binmisscollection")
