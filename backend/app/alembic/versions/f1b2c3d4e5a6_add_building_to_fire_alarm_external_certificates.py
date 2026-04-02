"""add building to fire alarm external certificates

Revision ID: f1b2c3d4e5a6
Revises: e8c1d4b2f6a7
Create Date: 2026-04-01 00:00:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision = "f1b2c3d4e5a6"
down_revision = "e8c1d4b2f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("fire_alarm_external_certificate"):
        return

    columns = {
        column["name"]
        for column in inspector.get_columns("fire_alarm_external_certificate")
    }
    if "building_id" not in columns:
        op.add_column(
            "fire_alarm_external_certificate",
            sa.Column("building_id", sa.Uuid(), nullable=True),
        )

    foreign_keys = {
        foreign_key["name"]
        for foreign_key in inspector.get_foreign_keys("fire_alarm_external_certificate")
    }
    if "fk_fire_alarm_external_certificate_building_id_building" not in foreign_keys:
        op.create_foreign_key(
            "fk_fire_alarm_external_certificate_building_id_building",
            "fire_alarm_external_certificate",
            "building",
            ["building_id"],
            ["id"],
            ondelete="SET NULL",
        )

    indexes = {
        index["name"]
        for index in inspector.get_indexes("fire_alarm_external_certificate")
    }
    if "ix_fire_alarm_external_certificate_building_id" not in indexes:
        op.create_index(
            "ix_fire_alarm_external_certificate_building_id",
            "fire_alarm_external_certificate",
            ["building_id"],
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
    if "ix_fire_alarm_external_certificate_building_id" in indexes:
        op.drop_index(
            "ix_fire_alarm_external_certificate_building_id",
            table_name="fire_alarm_external_certificate",
        )

    foreign_keys = {
        foreign_key["name"]
        for foreign_key in inspector.get_foreign_keys("fire_alarm_external_certificate")
    }
    if "fk_fire_alarm_external_certificate_building_id_building" in foreign_keys:
        op.drop_constraint(
            "fk_fire_alarm_external_certificate_building_id_building",
            "fire_alarm_external_certificate",
            type_="foreignkey",
        )

    columns = {
        column["name"]
        for column in inspector.get_columns("fire_alarm_external_certificate")
    }
    if "building_id" in columns:
        op.drop_column("fire_alarm_external_certificate", "building_id")
