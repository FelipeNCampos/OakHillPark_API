"""add notification history table

Revision ID: f9a4c2b7d1e6
Revises: f8d3b2a1c4e5
Create Date: 2026-03-15 12:10:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "f9a4c2b7d1e6"
down_revision = "f8d3b2a1c4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("notificationhistory"):
        return

    op.create_table(
        "notificationhistory",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("notification_type", sa.String(length=20), nullable=False),
        sa.Column("recipient_to", sa.String(length=255), nullable=False),
        sa.Column("message", sa.String(length=2000), nullable=False),
        sa.Column("delivery_status", sa.String(length=50), nullable=False),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("provider_message_id", sa.String(length=255), nullable=True),
        sa.Column("error_message", sa.String(length=1000), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_notificationhistory_created_at",
        "notificationhistory",
        ["created_at"],
    )
    op.create_index(
        "ix_notificationhistory_notification_type",
        "notificationhistory",
        ["notification_type"],
    )
    op.create_index(
        "ix_notificationhistory_recipient_to",
        "notificationhistory",
        ["recipient_to"],
    )
    op.create_index(
        "ix_notificationhistory_delivery_status",
        "notificationhistory",
        ["delivery_status"],
    )
    op.create_index(
        "ix_notificationhistory_success",
        "notificationhistory",
        ["success"],
    )
    op.create_index(
        "ix_notificationhistory_provider_message_id",
        "notificationhistory",
        ["provider_message_id"],
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("notificationhistory"):
        op.drop_index("ix_notificationhistory_provider_message_id", table_name="notificationhistory")
        op.drop_index("ix_notificationhistory_success", table_name="notificationhistory")
        op.drop_index("ix_notificationhistory_delivery_status", table_name="notificationhistory")
        op.drop_index("ix_notificationhistory_recipient_to", table_name="notificationhistory")
        op.drop_index("ix_notificationhistory_notification_type", table_name="notificationhistory")
        op.drop_index("ix_notificationhistory_created_at", table_name="notificationhistory")
        op.drop_table("notificationhistory")
