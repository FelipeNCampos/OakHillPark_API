"""add cash flow share links

Revision ID: a2b5c7d9e1f3
Revises: f6a2c8d4e1b9
Create Date: 2026-07-16 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "a2b5c7d9e1f3"
down_revision = "f6a2c8d4e1b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cash_flow_share_link",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("token_encrypted", sa.String(length=512), nullable=False),
        sa.Column("date_from", sa.Date(), nullable=False),
        sa.Column("date_to", sa.Date(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("condominio_id", sa.Uuid(), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["condominio_id"], ["condominio.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(
        "ix_cash_flow_share_link_condominio_id",
        "cash_flow_share_link",
        ["condominio_id"],
        unique=False,
    )
    op.create_index(
        "ix_cash_flow_share_link_token_hash",
        "cash_flow_share_link",
        ["token_hash"],
        unique=False,
    )
    op.create_index(
        "ix_cash_flow_share_link_expires_at",
        "cash_flow_share_link",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_cash_flow_share_link_expires_at", table_name="cash_flow_share_link")
    op.drop_index("ix_cash_flow_share_link_token_hash", table_name="cash_flow_share_link")
    op.drop_index("ix_cash_flow_share_link_condominio_id", table_name="cash_flow_share_link")
    op.drop_table("cash_flow_share_link")
