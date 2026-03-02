"""reminder multi weekday mask

Revision ID: f4b7c2d9a6e1
Revises: e2a6b9c4f1d7
Create Date: 2026-03-01 17:20:00.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "f4b7c2d9a6e1"
down_revision = "e2a6b9c4f1d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("reminder"):
        return

    columns = {column["name"] for column in inspector.get_columns("reminder")}
    indexes = {index["name"] for index in inspector.get_indexes("reminder")}

    if "weekday_mask" not in columns:
        op.add_column(
            "reminder",
            sa.Column("weekday_mask", sa.Integer(), nullable=True),
        )

    if "weekday" in columns:
        op.execute(
            sa.text(
                """
                UPDATE reminder
                SET weekday_mask = (1 << weekday)
                WHERE weekday IS NOT NULL
                  AND (weekday_mask IS NULL OR weekday_mask = 0)
                """
            )
        )

    op.execute(
        sa.text(
            """
            UPDATE reminder
            SET weekday_mask = 2
            WHERE weekday_mask IS NULL OR weekday_mask = 0
            """
        )
    )

    op.alter_column("reminder", "weekday_mask", nullable=False)

    if "weekday" in columns:
        op.drop_column("reminder", "weekday")

    if "ix_reminder_weekday" in indexes:
        op.drop_index("ix_reminder_weekday", table_name="reminder")
    if "ix_reminder_weekday_mask" not in indexes:
        op.create_index("ix_reminder_weekday_mask", "reminder", ["weekday_mask"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("reminder"):
        return

    columns = {column["name"] for column in inspector.get_columns("reminder")}
    indexes = {index["name"] for index in inspector.get_indexes("reminder")}

    if "weekday" not in columns:
        op.add_column("reminder", sa.Column("weekday", sa.Integer(), nullable=True))

    if "weekday_mask" in columns:
        op.execute(
            sa.text(
                """
                UPDATE reminder
                SET weekday = CASE
                  WHEN (weekday_mask & 1) != 0 THEN 0
                  WHEN (weekday_mask & 2) != 0 THEN 1
                  WHEN (weekday_mask & 4) != 0 THEN 2
                  WHEN (weekday_mask & 8) != 0 THEN 3
                  WHEN (weekday_mask & 16) != 0 THEN 4
                  WHEN (weekday_mask & 32) != 0 THEN 5
                  ELSE 6
                END
                """
            )
        )
        op.alter_column("reminder", "weekday", nullable=False)

    if "ix_reminder_weekday_mask" in indexes:
        op.drop_index("ix_reminder_weekday_mask", table_name="reminder")
    if "ix_reminder_weekday" not in indexes:
        op.create_index("ix_reminder_weekday", "reminder", ["weekday"])

    if "weekday_mask" in columns:
        op.drop_column("reminder", "weekday_mask")
