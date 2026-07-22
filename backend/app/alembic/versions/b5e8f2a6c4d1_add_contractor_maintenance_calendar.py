"""add contractor maintenance calendar

Revision ID: b5e8f2a6c4d1
Revises: a4d7e1c9b2f3
Create Date: 2026-07-21 00:00:00.000000
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect


revision = "b5e8f2a6c4d1"
down_revision = "a4d7e1c9b2f3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not inspector.has_table("contractormaintenancecategory"):
        op.create_table(
            "contractormaintenancecategory",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("name", sa.String(length=100), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("condominio_id", sa.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(["condominio_id"], ["condominio.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_contractormaintenancecategory_condominio_id",
            "contractormaintenancecategory",
            ["condominio_id"],
        )
        op.create_index(
            "ix_contractormaintenancecategory_name",
            "contractormaintenancecategory",
            ["name"],
        )

    if not inspector.has_table("contractormaintenance"):
        op.create_table(
            "contractormaintenance",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("tag", sa.String(length=100), nullable=False),
            sa.Column("report", sa.String(length=255), nullable=False),
            sa.Column("frequency_days", sa.Integer(), nullable=False),
            sa.Column("notes", sa.String(length=2000), nullable=False, server_default=""),
            sa.Column("mobile", sa.String(length=30), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("condominio_id", sa.Uuid(), nullable=False),
            sa.Column("category_id", sa.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(["category_id"], ["contractormaintenancecategory.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["condominio_id"], ["condominio.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_contractormaintenance_condominio_id",
            "contractormaintenance",
            ["condominio_id"],
        )
        op.create_index(
            "ix_contractormaintenance_category_id",
            "contractormaintenance",
            ["category_id"],
        )
        op.create_index(
            "ix_contractormaintenance_mobile",
            "contractormaintenance",
            ["mobile"],
        )

    if not inspector.has_table("contractormaintenancerecord"):
        op.create_table(
            "contractormaintenancerecord",
            sa.Column("id", sa.Uuid(), nullable=False),
            sa.Column("in_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("out_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("condominio_id", sa.Uuid(), nullable=False),
            sa.Column("maintenance_id", sa.Uuid(), nullable=False),
            sa.Column("contractor_visit_id", sa.Uuid(), nullable=False),
            sa.ForeignKeyConstraint(["condominio_id"], ["condominio.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["maintenance_id"], ["contractormaintenance.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["contractor_visit_id"], ["contractorvisit.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_contractormaintenancerecord_maintenance_id",
            "contractormaintenancerecord",
            ["maintenance_id"],
        )
        op.create_index(
            "ix_contractormaintenancerecord_in_at",
            "contractormaintenancerecord",
            ["in_at"],
        )
        op.create_index(
            "ix_contractormaintenancerecord_maintenance_visit",
            "contractormaintenancerecord",
            ["maintenance_id", "contractor_visit_id"],
            unique=True,
        )


def downgrade() -> None:
    op.drop_table("contractormaintenancerecord")
    op.drop_table("contractormaintenance")
    op.drop_table("contractormaintenancecategory")
