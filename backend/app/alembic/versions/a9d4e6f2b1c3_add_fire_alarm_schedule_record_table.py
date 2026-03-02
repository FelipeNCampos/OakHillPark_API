"""add fire alarm schedule record table

Revision ID: a9d4e6f2b1c3
Revises: f4b7c2d9a6e1
Create Date: 2026-03-01 20:55:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "a9d4e6f2b1c3"
down_revision = "f4b7c2d9a6e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("fire_alarm_schedule_record"):
        return

    op.create_table(
        "fire_alarm_schedule_record",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("schedule_type", sa.String(length=50), nullable=False),
        sa.Column("test_date", sa.Date(), nullable=False),
        sa.Column("time", sa.String(length=5), nullable=False),
        sa.Column("building_label", sa.String(length=100), nullable=False),
        sa.Column("call_point", sa.String(length=20), nullable=True),
        sa.Column("location", sa.String(length=100), nullable=True),
        sa.Column("action_required", sa.Boolean(), nullable=False),
        sa.Column("comments", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_fire_alarm_schedule_record_schedule_type",
        "fire_alarm_schedule_record",
        ["schedule_type"],
    )
    op.create_index(
        "ix_fire_alarm_schedule_record_test_date",
        "fire_alarm_schedule_record",
        ["test_date"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("fire_alarm_schedule_record"):
        return

    indexes = {index["name"] for index in inspector.get_indexes("fire_alarm_schedule_record")}
    if "ix_fire_alarm_schedule_record_schedule_type" in indexes:
        op.drop_index(
            "ix_fire_alarm_schedule_record_schedule_type",
            table_name="fire_alarm_schedule_record",
        )
    if "ix_fire_alarm_schedule_record_test_date" in indexes:
        op.drop_index(
            "ix_fire_alarm_schedule_record_test_date",
            table_name="fire_alarm_schedule_record",
        )
    op.drop_table("fire_alarm_schedule_record")

