"""add task code

Revision ID: d1f4c3b2a901
Revises: c4d9a8b7e2f0
Create Date: 2026-03-01 00:00:01.000000

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "d1f4c3b2a901"
down_revision = "c4d9a8b7e2f0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not inspector.has_table("task"):
        return

    columns = {column["name"] for column in inspector.get_columns("task")}
    if "code" not in columns:
        op.add_column("task", sa.Column("code", sa.String(length=32), nullable=True))

    # Backfill existing rows with sequential codes per condominio.
    op.execute(
        sa.text(
            """
            WITH ordered AS (
                SELECT
                    id,
                    condominio_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY condominio_id
                        ORDER BY created_at ASC, id ASC
                    ) AS seq
                FROM task
            )
            UPDATE task AS t
            SET code = 'task-' || LPAD(ordered.seq::text, 3, '0')
            FROM ordered
            WHERE t.id = ordered.id
              AND (t.code IS NULL OR t.code = '');
            """
        )
    )

    op.alter_column("task", "code", existing_type=sa.String(length=32), nullable=False)

    indexes = {index["name"] for index in inspector.get_indexes("task")}
    if "ix_task_code" not in indexes:
        op.create_index("ix_task_code", "task", ["code"], unique=False)

    unique_constraints = {
        constraint["name"] for constraint in inspector.get_unique_constraints("task")
    }
    if "uq_task_condominio_code" not in unique_constraints:
        op.create_unique_constraint(
            "uq_task_condominio_code",
            "task",
            ["condominio_id", "code"],
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not inspector.has_table("task"):
        return

    unique_constraints = {
        constraint["name"] for constraint in inspector.get_unique_constraints("task")
    }
    if "uq_task_condominio_code" in unique_constraints:
        op.drop_constraint("uq_task_condominio_code", "task", type_="unique")

    indexes = {index["name"] for index in inspector.get_indexes("task")}
    if "ix_task_code" in indexes:
        op.drop_index("ix_task_code", table_name="task")

    columns = {column["name"] for column in inspector.get_columns("task")}
    if "code" in columns:
        op.drop_column("task", "code")
