"""add task building to reminders

Revision ID: b7d2c9e4a1f6
Revises: e6b9a2c4d8f1
Create Date: 2026-06-09 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "b7d2c9e4a1f6"
down_revision = "e6b9a2c4d8f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("reminder"):
        return

    columns = {column["name"] for column in inspector.get_columns("reminder")}
    if "task_building_id" not in columns:
        op.add_column("reminder", sa.Column("task_building_id", sa.Uuid(), nullable=True))

    foreign_keys = {fk["name"] for fk in inspector.get_foreign_keys("reminder")}
    if "fk_reminder_task_building_id_building" not in foreign_keys:
        op.create_foreign_key(
            "fk_reminder_task_building_id_building",
            "reminder",
            "building",
            ["task_building_id"],
            ["id"],
            ondelete="SET NULL",
        )

    indexes = {index["name"] for index in inspector.get_indexes("reminder")}
    if "ix_reminder_task_building_id" not in indexes:
        op.create_index(
            "ix_reminder_task_building_id",
            "reminder",
            ["task_building_id"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("reminder"):
        return

    indexes = {index["name"] for index in inspector.get_indexes("reminder")}
    if "ix_reminder_task_building_id" in indexes:
        op.drop_index("ix_reminder_task_building_id", table_name="reminder")

    foreign_keys = {fk["name"] for fk in inspector.get_foreign_keys("reminder")}
    if "fk_reminder_task_building_id_building" in foreign_keys:
        op.drop_constraint(
            "fk_reminder_task_building_id_building",
            "reminder",
            type_="foreignkey",
        )

    columns = {column["name"] for column in inspector.get_columns("reminder")}
    if "task_building_id" in columns:
        op.drop_column("reminder", "task_building_id")
