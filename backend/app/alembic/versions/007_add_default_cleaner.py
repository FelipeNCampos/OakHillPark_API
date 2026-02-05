"""add default cleaner flag

Revision ID: 007_add_default_cleaner
Revises: 006_mobile_varchar
Create Date: 2026-02-04

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "007_add_default_cleaner"
down_revision = "006_mobile_varchar"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "funcionario",
        sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.alter_column("funcionario", "is_default", server_default=None)


def downgrade() -> None:
    op.drop_column("funcionario", "is_default")
