"""change mobile type from int to varchar

Revision ID: 006_mobile_varchar
Revises: 005_flat_read_zero
Create Date: 2026-02-02

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '006_mobile_varchar'
down_revision = '005_flat_read_zero'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Alter column type from INTEGER to VARCHAR(20)
    op.alter_column('morador', 'mobile',
                    existing_type=sa.Integer(),
                    type_=sa.String(length=20),
                    existing_nullable=False)


def downgrade() -> None:
    # Revert back to INTEGER
    op.alter_column('morador', 'mobile',
                    existing_type=sa.String(length=20),
                    type_=sa.Integer(),
                    existing_nullable=False)
