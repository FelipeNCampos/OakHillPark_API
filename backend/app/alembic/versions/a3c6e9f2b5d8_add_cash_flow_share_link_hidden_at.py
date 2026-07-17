"""add hidden timestamp to cash flow share links

Revision ID: a3c6e9f2b5d8
Revises: a2b5c7d9e1f3
Create Date: 2026-07-17 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "a3c6e9f2b5d8"
down_revision = "a2b5c7d9e1f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "cash_flow_share_link",
        sa.Column("hidden_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("cash_flow_share_link", "hidden_at")
