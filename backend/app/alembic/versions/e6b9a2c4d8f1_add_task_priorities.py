"""add task priorities

Revision ID: e6b9a2c4d8f1
Revises: d9c4e7b2a1f0
Create Date: 2026-06-01 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision = "e6b9a2c4d8f1"
down_revision = "d9c4e7b2a1f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    task_columns = {column["name"] for column in inspector.get_columns("task")}
    if "priority" not in task_columns:
        op.add_column(
            "task",
            sa.Column("priority", sa.Integer(), nullable=False, server_default="2"),
        )

    reminder_columns = {
        column["name"] for column in inspector.get_columns("reminder")
    }
    if "task_priority" not in reminder_columns:
        op.add_column(
            "reminder",
            sa.Column("task_priority", sa.Integer(), nullable=False, server_default="2"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    reminder_columns = {
        column["name"] for column in inspector.get_columns("reminder")
    }
    if "task_priority" in reminder_columns:
        op.drop_column("reminder", "task_priority")

    task_columns = {column["name"] for column in inspector.get_columns("task")}
    if "priority" in task_columns:
        op.drop_column("task", "priority")
