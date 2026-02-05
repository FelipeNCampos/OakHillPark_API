"""add condominio_id to user

Revision ID: 008_add_condominio_to_user
Revises: 007_add_default_cleaner
Create Date: 2026-02-04

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "008_add_condominio_to_user"
down_revision = "007_add_default_cleaner"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add condominio_id column as nullable first
    op.add_column(
        "user",
        sa.Column("condominio_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    
    # Add foreign key constraint
    op.create_foreign_key(
        "fk_user_condominio_id",
        "user",
        "condominio",
        ["condominio_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_user_condominio_id", "user", type_="foreignkey")
    op.drop_column("user", "condominio_id")
