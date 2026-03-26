"""add fire alarm external certificate table

Revision ID: c6e4a8f1d2b3
Revises: b7c4d9e1f2a3
Create Date: 2026-03-26 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "c6e4a8f1d2b3"
down_revision = "b7c4d9e1f2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("fire_alarm_external_certificate"):
        return

    op.create_table(
        "fire_alarm_external_certificate",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("condominio_id", sa.Uuid(), nullable=False),
        sa.Column("certificate_date", sa.Date(), nullable=False),
        sa.Column("certificate_time", sa.String(length=5), nullable=False),
        sa.Column("company", sa.String(length=255), nullable=False),
        sa.Column("professional", sa.String(length=255), nullable=False),
        sa.Column("media_1_name", sa.String(length=255), nullable=True),
        sa.Column("media_1_data", sa.Text(), nullable=True),
        sa.Column("media_2_name", sa.String(length=255), nullable=True),
        sa.Column("media_2_data", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["condominio_id"], ["condominio.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_fire_alarm_external_certificate_condominio_id",
        "fire_alarm_external_certificate",
        ["condominio_id"],
        unique=False,
    )
    op.create_index(
        "ix_fire_alarm_external_certificate_certificate_date",
        "fire_alarm_external_certificate",
        ["certificate_date"],
        unique=False,
    )
    op.create_index(
        "ix_fire_alarm_external_certificate_company",
        "fire_alarm_external_certificate",
        ["company"],
        unique=False,
    )
    op.create_index(
        "ix_fire_alarm_external_certificate_professional",
        "fire_alarm_external_certificate",
        ["professional"],
        unique=False,
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("fire_alarm_external_certificate"):
        return

    indexes = {
        index["name"]
        for index in inspector.get_indexes("fire_alarm_external_certificate")
    }
    if "ix_fire_alarm_external_certificate_professional" in indexes:
        op.drop_index(
            "ix_fire_alarm_external_certificate_professional",
            table_name="fire_alarm_external_certificate",
        )
    if "ix_fire_alarm_external_certificate_company" in indexes:
        op.drop_index(
            "ix_fire_alarm_external_certificate_company",
            table_name="fire_alarm_external_certificate",
        )
    if "ix_fire_alarm_external_certificate_certificate_date" in indexes:
        op.drop_index(
            "ix_fire_alarm_external_certificate_certificate_date",
            table_name="fire_alarm_external_certificate",
        )
    if "ix_fire_alarm_external_certificate_condominio_id" in indexes:
        op.drop_index(
            "ix_fire_alarm_external_certificate_condominio_id",
            table_name="fire_alarm_external_certificate",
        )
    op.drop_table("fire_alarm_external_certificate")
