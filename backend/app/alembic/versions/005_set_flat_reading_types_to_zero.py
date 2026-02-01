"""set flat reading types to zero

Revision ID: 005_set_flat_reading_types_to_zero
Revises: 004_add_flat_readings
Create Date: 2026-02-01

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '005_flat_read_zero'
down_revision = '004_add_flat_readings'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Update all existing flats to have reading_types = 0
    op.execute("UPDATE flat SET reading_types = 0")
    
    # Alter column default
    op.alter_column('flat', 'reading_types',
                    existing_type=sa.Integer(),
                    server_default='0',
                    existing_nullable=False)


def downgrade() -> None:
    # Revert default back to 3
    op.alter_column('flat', 'reading_types',
                    existing_type=sa.Integer(),
                    server_default='3',
                    existing_nullable=False)
