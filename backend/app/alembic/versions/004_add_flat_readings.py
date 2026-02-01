"""Add reading_types to Flat and create FlatReading table

Revision ID: 004_add_flat_readings
Revises: 003_add_sn_fields
Create Date: 2026-02-01 13:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import uuid

# revision identifiers, used by Alembic.
revision = '004_add_flat_readings'
down_revision = '003_add_sn_fields'
branch_labels = None
depends_on = None


def upgrade():
    # Add reading_types column to flat table
    op.add_column('flat', sa.Column('reading_types', sa.Integer(), nullable=False, server_default='3'))
    
    # Create flat_reading table
    op.create_table(
        'flatreading',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('data', sa.DateTime(timezone=True), nullable=False),
        sa.Column('tipo', sa.Integer(), nullable=False),
        sa.Column('valor', sa.Integer(), nullable=False),
        sa.Column('flat_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.ForeignKeyConstraint(['flat_id'], ['flat.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_flatreading_flat_id'), 'flatreading', ['flat_id'], unique=False)


def downgrade():
    # Drop flat_reading table
    op.drop_index(op.f('ix_flatreading_flat_id'), table_name='flatreading')
    op.drop_table('flatreading')
    
    # Remove reading_types column from flat table
    op.drop_column('flat', 'reading_types')
