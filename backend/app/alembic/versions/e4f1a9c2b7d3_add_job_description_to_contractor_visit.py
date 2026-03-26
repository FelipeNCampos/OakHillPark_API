"""add job description to contractor visit

Revision ID: e4f1a9c2b7d3
Revises: c6e4a8f1d2b3
Create Date: 2026-03-26 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "e4f1a9c2b7d3"
down_revision = "c6e4a8f1d2b3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("contractorvisit"):
        return

    columns = {column["name"] for column in inspector.get_columns("contractorvisit")}
    if "job_description" not in columns:
        op.add_column(
            "contractorvisit",
            sa.Column(
                "job_description",
                sa.String(length=255),
                nullable=False,
                server_default="",
            ),
        )
        op.alter_column(
            "contractorvisit",
            "job_description",
            server_default=None,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("contractorvisit"):
        return

    columns = {column["name"] for column in inspector.get_columns("contractorvisit")}
    if "job_description" in columns:
        op.drop_column("contractorvisit", "job_description")
