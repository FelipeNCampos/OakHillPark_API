"""Drop item table and add condo-related models

Revision ID: 3b7f0c5e1c2a
Revises: fe56fa70289e
Create Date: 2026-02-01 06:02:30.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "3b7f0c5e1c2a"
down_revision = "fe56fa70289e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')

    op.drop_table("item")

    op.create_table(
        "condominio",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column("nome", sa.String(length=255), nullable=False),
    )

    op.create_table(
        "building",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column("nome", sa.String(length=255), nullable=False),
        sa.Column(
            "condominio_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["condominio_id"],
            ["condominio.id"],
            ondelete="CASCADE",
        ),
    )

    op.create_table(
        "flat",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column("numero", sa.Integer(), nullable=False),
        sa.Column("status", sa.Boolean(), nullable=False),
        sa.Column(
            "building_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["building_id"],
            ["building.id"],
            ondelete="CASCADE",
        ),
    )

    op.create_table(
        "morador",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column("cargo", sa.Integer(), nullable=False),
        sa.Column("nome", sa.String(length=255), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("mobile", sa.Integer(), nullable=False),
        sa.Column("car1", sa.String(length=50), nullable=True),
        sa.Column("car2", sa.String(length=50), nullable=True),
        sa.Column("car3", sa.String(length=50), nullable=True),
        sa.Column(
            "flat_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["flat_id"],
            ["flat.id"],
            ondelete="CASCADE",
        ),
    )

    op.create_table(
        "funcionario",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column("status", sa.Boolean(), nullable=False),
        sa.Column("nome", sa.String(length=255), nullable=False),
        sa.Column("mobile", sa.Integer(), nullable=False),
        sa.Column("cargo", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column(
            "condominio_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["condominio_id"],
            ["condominio.id"],
            ondelete="CASCADE",
        ),
    )

    op.create_table(
        "acess",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column("status", sa.Boolean(), nullable=False),
        sa.Column("data", sa.DateTime(timezone=True), nullable=False),
        sa.Column("operacao", sa.Integer(), nullable=False),
        sa.Column(
            "building_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["building_id"],
            ["building.id"],
            ondelete="CASCADE",
        ),
    )

    op.create_table(
        "readings",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column("data", sa.DateTime(timezone=True), nullable=False),
        sa.Column("tipo", sa.Integer(), nullable=False),
        sa.Column("valor", sa.Integer(), nullable=False),
        sa.Column(
            "building_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["building_id"],
            ["building.id"],
            ondelete="CASCADE",
        ),
    )


def downgrade() -> None:
    op.drop_table("readings")
    op.drop_table("acess")
    op.drop_table("funcionario")
    op.drop_table("morador")
    op.drop_table("flat")
    op.drop_table("building")
    op.drop_table("condominio")

    op.create_table(
        "item",
        sa.Column("description", sa.String(), nullable=True),
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            nullable=False,
            server_default=sa.text("uuid_generate_v4()"),
        ),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["owner_id"], ["user.id"]),
    )