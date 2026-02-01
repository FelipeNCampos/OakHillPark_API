"""Add reading_types field to Building model

Revision ID: 002_add_reading_types
Revises: 001_initial
Create Date: 2026-02-01 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '002_add_reading_types'
down_revision = '001_initial'
branch_labels = None
depends_on = None


def upgrade():
    # Add reading_types column to building table with default value of 3 (Low + Normal)
    op.add_column('building', sa.Column('reading_types', sa.Integer(), nullable=False, server_default='3'))


def downgrade():
    # Remove reading_types column from building table
    op.drop_column('building', 'reading_types')
