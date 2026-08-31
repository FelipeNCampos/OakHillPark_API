"""add Google Calendar integration tables

Revision ID: c8d4e2a1f6b7
Revises: c7e1f4a9d2b6, d3e7f1a9c5b2
Create Date: 2026-08-31 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "c8d4e2a1f6b7"
down_revision = ("c7e1f4a9d2b6", "d3e7f1a9c5b2")
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not inspector.has_table("googlecalendarconnection"):
        op.create_table(
            "googlecalendarconnection",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("calendar_id", sa.String(length=512), nullable=True),
            sa.Column("refresh_token_encrypted", sa.Text(), nullable=True),
            sa.Column("status", sa.String(length=40), nullable=False),
            sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_error", sa.String(length=500), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("user_id"),
        )
        op.create_index(
            "ix_googlecalendarconnection_status",
            "googlecalendarconnection",
            ["status"],
        )

    if not inspector.has_table("googlecalendaroauthstate"):
        op.create_table(
            "googlecalendaroauthstate",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("state_hash", sa.String(length=64), nullable=False),
            sa.Column("user_id", sa.Uuid(), nullable=False),
            sa.Column("code_verifier", sa.String(length=160), nullable=False),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("state_hash"),
        )
        op.create_index(
            "ix_googlecalendaroauthstate_user_id",
            "googlecalendaroauthstate",
            ["user_id"],
        )

    if not inspector.has_table("googlecalendarsyncjob"):
        op.create_table(
            "googlecalendarsyncjob",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("connection_id", sa.Uuid(), nullable=False),
            sa.Column("contractor_history_id", sa.Uuid(), nullable=True),
            sa.Column("kind", sa.String(length=30), nullable=False),
            sa.Column("dedupe_key", sa.String(length=200), nullable=False),
            sa.Column("status", sa.String(length=30), nullable=False),
            sa.Column("attempts", sa.Integer(), nullable=False),
            sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_error", sa.String(length=500), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.ForeignKeyConstraint(
                ["connection_id"], ["googlecalendarconnection.id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("dedupe_key"),
        )
        op.create_index(
            "ix_googlecalendarsyncjob_connection_id",
            "googlecalendarsyncjob",
            ["connection_id"],
        )
        op.create_index(
            "ix_googlecalendarsyncjob_contractor_history_id",
            "googlecalendarsyncjob",
            ["contractor_history_id"],
        )
        op.create_index(
            "ix_googlecalendarsyncjob_status",
            "googlecalendarsyncjob",
            ["status"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("googlecalendarsyncjob"):
        op.drop_table("googlecalendarsyncjob")
    if inspector.has_table("googlecalendaroauthstate"):
        op.drop_table("googlecalendaroauthstate")
    if inspector.has_table("googlecalendarconnection"):
        op.drop_table("googlecalendarconnection")
