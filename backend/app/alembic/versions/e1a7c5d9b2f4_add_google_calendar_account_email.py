"""store the Google account email used for Calendar synchronization

Revision ID: e1a7c5d9b2f4
Revises: d9e6f4b2a8c1
Create Date: 2026-09-02 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "e1a7c5d9b2f4"
down_revision = "d9e6f4b2a8c1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {
        column["name"]
        for column in inspector.get_columns("googlecalendarconnection")
    }
    if "account_email" not in columns:
        op.add_column(
            "googlecalendarconnection",
            sa.Column("account_email", sa.String(length=320), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {
        column["name"]
        for column in inspector.get_columns("googlecalendarconnection")
    }
    if "account_email" in columns:
        op.drop_column("googlecalendarconnection", "account_email")
