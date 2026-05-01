"""renumber cash flow payments by month

Revision ID: e9b1c6d4a2f8
Revises: d7e3f9a2c5b1
Create Date: 2026-05-01 00:00:00.000000

"""

from alembic import op
from sqlalchemy import inspect, text

# revision identifiers, used by Alembic.
revision = "e9b1c6d4a2f8"
down_revision = "d7e3f9a2c5b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("cash_flow_record"):
        return

    bind.execute(
        text(
            """
            WITH ranked_records AS (
                SELECT
                    id,
                    ROW_NUMBER() OVER (
                        PARTITION BY condominio_id, DATE_TRUNC('month', record_date)
                        ORDER BY record_date ASC, created_at ASC, id ASC
                    ) AS payment_number
                FROM cash_flow_record
            )
            UPDATE cash_flow_record
            SET payment_number = ranked_records.payment_number
            FROM ranked_records
            WHERE cash_flow_record.id = ranked_records.id
            """
        )
    )


def downgrade() -> None:
    pass
