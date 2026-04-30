"""add building to tasks

Revision ID: a7c3e4d5f6b1
Revises: f5e6d7c8b9a0
Create Date: 2026-04-20 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "a7c3e4d5f6b1"
down_revision = "f5e6d7c8b9a0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("task")}
    foreign_keys = {
        foreign_key["name"] for foreign_key in inspector.get_foreign_keys("task")
    }

    if "building_id" not in columns:
        op.add_column("task", sa.Column("building_id", sa.Uuid(), nullable=True))

    if "fk_task_building_id_building" not in foreign_keys:
        op.create_foreign_key(
            "fk_task_building_id_building",
            "task",
            "building",
            ["building_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("task")}
    foreign_keys = {
        foreign_key["name"] for foreign_key in inspector.get_foreign_keys("task")
    }

    if "fk_task_building_id_building" in foreign_keys:
        op.drop_constraint("fk_task_building_id_building", "task", type_="foreignkey")

    if "building_id" in columns:
        op.drop_column("task", "building_id")
