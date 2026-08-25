"""add work time session pair id

Revision ID: c1e8f4a6b2d9
Revises: b5e8f2a6c4d1
Create Date: 2026-08-25 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "c1e8f4a6b2d9"
down_revision = "b5e8f2a6c4d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("worktimesession")}
    if "session_id" not in columns:
        op.add_column("worktimesession", sa.Column("session_id", sa.Uuid(), nullable=True))
    indexes = {index["name"] for index in inspector.get_indexes("worktimesession")}
    if "ix_worktimesession_session_id" not in indexes:
        op.create_index("ix_worktimesession_session_id", "worktimesession", ["session_id"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    indexes = {index["name"] for index in inspector.get_indexes("worktimesession")}
    if "ix_worktimesession_session_id" in indexes:
        op.drop_index("ix_worktimesession_session_id", table_name="worktimesession")
    columns = {column["name"] for column in inspector.get_columns("worktimesession")}
    if "session_id" in columns:
        op.drop_column("worktimesession", "session_id")
