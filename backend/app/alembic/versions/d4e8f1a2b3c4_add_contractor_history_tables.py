"""add contractor history tables

Revision ID: d4e8f1a2b3c4
Revises: c9f7a6b5d4e3
Create Date: 2026-03-27 00:00:00.000000

"""

from alembic import op
from sqlalchemy import inspect, text

# revision identifiers, used by Alembic.
revision = "d4e8f1a2b3c4"
down_revision = "c9f7a6b5d4e3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not inspector.has_table("contractorhistorycategory"):
        op.execute(
            text(
                """
                CREATE TABLE contractorhistorycategory (
                    id UUID PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL,
                    condominio_id UUID NOT NULL REFERENCES condominio (id) ON DELETE CASCADE
                )
                """
            )
        )
        op.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_contractorhistorycategory_name "
                "ON contractorhistorycategory (name)"
            )
        )
        op.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_contractorhistorycategory_condominio_id "
                "ON contractorhistorycategory (condominio_id)"
            )
        )

    if inspector.has_table("contractorhistory"):
        columns = {
            column["name"] for column in inspector.get_columns("contractorhistory")
        }
        if "created_new_visit" not in columns:
            op.execute(
                text(
                    "ALTER TABLE contractorhistory "
                    "ADD COLUMN created_new_visit BOOLEAN NOT NULL DEFAULT FALSE"
                )
            )
        columns = {
            column["name"] for column in inspector.get_columns("contractorhistory")
        }
        if "next_enabled" not in columns:
            op.execute(
                text(
                    "ALTER TABLE contractorhistory "
                    "ADD COLUMN next_enabled BOOLEAN NOT NULL DEFAULT FALSE"
                )
            )
        columns = {
            column["name"] for column in inspector.get_columns("contractorhistory")
        }
        if "next_interval_unit" not in columns:
            op.execute(
                text(
                    "ALTER TABLE contractorhistory "
                    "ADD COLUMN next_interval_unit VARCHAR(10)"
                )
            )
        columns = {
            column["name"] for column in inspector.get_columns("contractorhistory")
        }
        if "next_interval_value" not in columns:
            op.execute(
                text(
                    "ALTER TABLE contractorhistory "
                    "ADD COLUMN next_interval_value INTEGER"
                )
            )
        columns = {
            column["name"] for column in inspector.get_columns("contractorhistory")
        }
        if "next_job_at" not in columns:
            op.execute(
                text(
                    "ALTER TABLE contractorhistory "
                    "ADD COLUMN next_job_at TIMESTAMPTZ"
                )
            )
        columns = {
            column["name"] for column in inspector.get_columns("contractorhistory")
        }
        if "next_notify_at" not in columns:
            op.execute(
                text(
                    "ALTER TABLE contractorhistory "
                    "ADD COLUMN next_notify_at TIMESTAMPTZ"
                )
            )
        columns = {
            column["name"] for column in inspector.get_columns("contractorhistory")
        }
        if "next_notification_sent_at" not in columns:
            op.execute(
                text(
                    "ALTER TABLE contractorhistory "
                    "ADD COLUMN next_notification_sent_at TIMESTAMPTZ"
                )
            )
        op.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_contractorhistory_next_notify_at "
                "ON contractorhistory (next_notify_at)"
            )
        )
        return

    op.execute(
        text(
            """
            CREATE TABLE contractorhistory (
                id UUID PRIMARY KEY,
                created_new_visit BOOLEAN NOT NULL DEFAULT FALSE,
                next_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                next_interval_unit VARCHAR(10),
                next_interval_value INTEGER,
                next_job_at TIMESTAMPTZ,
                next_notify_at TIMESTAMPTZ,
                next_notification_sent_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL,
                condominio_id UUID NOT NULL REFERENCES condominio (id) ON DELETE CASCADE,
                contractor_visit_id UUID NOT NULL REFERENCES contractorvisit (id) ON DELETE CASCADE,
                category_id UUID NOT NULL REFERENCES contractorhistorycategory (id) ON DELETE CASCADE
            )
            """
        )
    )
    op.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_contractorhistory_condominio_id "
            "ON contractorhistory (condominio_id)"
        )
    )
    op.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_contractorhistory_contractor_visit_id "
            "ON contractorhistory (contractor_visit_id)"
        )
    )
    op.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_contractorhistory_category_id "
            "ON contractorhistory (category_id)"
        )
    )
    op.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_contractorhistory_created_at "
            "ON contractorhistory (created_at)"
        )
    )
    op.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_contractorhistory_next_notify_at "
            "ON contractorhistory (next_notify_at)"
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if inspector.has_table("contractorhistory"):
        indexes = {index["name"] for index in inspector.get_indexes("contractorhistory")}
        if "ix_contractorhistory_created_at" in indexes:
            op.drop_index("ix_contractorhistory_created_at", table_name="contractorhistory")
        if "ix_contractorhistory_next_notify_at" in indexes:
            op.drop_index(
                "ix_contractorhistory_next_notify_at",
                table_name="contractorhistory",
            )
        if "ix_contractorhistory_category_id" in indexes:
            op.drop_index("ix_contractorhistory_category_id", table_name="contractorhistory")
        if "ix_contractorhistory_contractor_visit_id" in indexes:
            op.drop_index(
                "ix_contractorhistory_contractor_visit_id",
                table_name="contractorhistory",
            )
        if "ix_contractorhistory_condominio_id" in indexes:
            op.drop_index(
                "ix_contractorhistory_condominio_id",
                table_name="contractorhistory",
            )
        op.drop_table("contractorhistory")

    if inspector.has_table("contractorhistorycategory"):
        indexes = {
            index["name"] for index in inspector.get_indexes("contractorhistorycategory")
        }
        if "ix_contractorhistorycategory_condominio_id" in indexes:
            op.drop_index(
                "ix_contractorhistorycategory_condominio_id",
                table_name="contractorhistorycategory",
            )
        if "ix_contractorhistorycategory_name" in indexes:
            op.drop_index(
                "ix_contractorhistorycategory_name",
                table_name="contractorhistorycategory",
            )
        op.drop_table("contractorhistorycategory")
