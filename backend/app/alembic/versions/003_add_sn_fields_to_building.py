"""Add electricity_sn and gas_sn fields to Building model

Revision ID: 003_add_sn_fields
Revises: 002_add_reading_types
Create Date: 2026-02-01 12:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '003_add_sn_fields'
down_revision = '002_add_reading_types'
branch_labels = None
depends_on = None


def upgrade():
    # Add electricity_sn and gas_sn columns to building table
    op.add_column('building', sa.Column('electricity_sn', sa.String(length=255), nullable=True))
    op.add_column('building', sa.Column('gas_sn', sa.String(length=255), nullable=True))


def downgrade():
    # Remove electricity_sn and gas_sn columns from building table
    op.drop_column('building', 'electricity_sn')
    op.drop_column('building', 'gas_sn')
