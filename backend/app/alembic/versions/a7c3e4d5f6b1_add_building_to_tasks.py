"""add building to tasks

Revision ID: a7c3e4d5f6b1
Revises: f5e6d7c8b9a0
Create Date: 2026-04-20 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "a7c3e4d5f6b1"
down_revision = "f5e6d7c8b9a0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("task", sa.Column("building_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_task_building_id_building",
        "task",
        "building",
        ["building_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_task_building_id_building", "task", type_="foreignkey")
    op.drop_column("task", "building_id")
