"""add weather to tasks

Revision ID: d2f8a7c9b1e4
Revises: b7d2c9e4a1f6
Create Date: 2026-06-20 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "d2f8a7c9b1e4"
down_revision = "b7d2c9e4a1f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    task_columns = {column["name"] for column in inspector.get_columns("task")}

    if "weather" not in task_columns:
        op.add_column(
            "task",
            sa.Column(
                "weather",
                sa.String(length=20),
                nullable=False,
                server_default="sun",
            ),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    task_columns = {column["name"] for column in inspector.get_columns("task")}

    if "weather" in task_columns:
        op.drop_column("task", "weather")
