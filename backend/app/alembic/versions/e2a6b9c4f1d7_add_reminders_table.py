"""add reminders table

Revision ID: e2a6b9c4f1d7
Revises: d1f4c3b2a901
Create Date: 2026-03-01 16:50:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "e2a6b9c4f1d7"
down_revision = "d1f4c3b2a901"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("reminder"):
        return

    op.create_table(
        "reminder",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("weekday_mask", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("action_sms", sa.Boolean(), nullable=False),
        sa.Column("sms_to", sa.String(length=20), nullable=True),
        sa.Column("sms_message", sa.String(length=1600), nullable=True),
        sa.Column("action_task", sa.Boolean(), nullable=False),
        sa.Column("task_title", sa.String(length=255), nullable=True),
        sa.Column("task_description", sa.Text(), nullable=True),
        sa.Column("condominio_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("last_triggered_on", sa.Date(), nullable=True),
        sa.Column("last_triggered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["condominio_id"], ["condominio.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reminder_condominio_id", "reminder", ["condominio_id"])
    op.create_index("ix_reminder_weekday_mask", "reminder", ["weekday_mask"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("reminder"):
        return

    indexes = {index["name"] for index in inspector.get_indexes("reminder")}
    if "ix_reminder_weekday_mask" in indexes:
        op.drop_index("ix_reminder_weekday_mask", table_name="reminder")
    if "ix_reminder_condominio_id" in indexes:
        op.drop_index("ix_reminder_condominio_id", table_name="reminder")
    op.drop_table("reminder")
