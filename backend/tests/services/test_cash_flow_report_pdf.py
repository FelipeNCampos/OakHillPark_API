import uuid
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph

from app.services.cash_flow_service import (
    CashFlowReportListResponse,
    CashFlowReportRow,
    CashFlowService,
)


@pytest.fixture(scope="session")
def db() -> None:
    """Keep pure PDF layout tests independent from the database fixture."""


def test_cash_flow_report_wraps_long_supplier_inside_its_own_cell() -> None:
    listing = CashFlowReportListResponse(
        month="2026-03",
        monthly_total=Decimal("-1"),
        items=[
            CashFlowReportRow(
                id=uuid.uuid4(),
                payment_number=1,
                has_invoice=False,
                invoice_media_name=None,
                record_date=date(2026, 3, 12),
                amount=Decimal("-1"),
                supplier="Very long supplier name that must wrap inside the supplier cell",
                description="Short comment",
                balance=Decimal("-1"),
            )
        ],
    )

    with patch.object(
        CashFlowService,
        "_styled_table",
        wraps=CashFlowService._styled_table,
    ) as styled_table:
        CashFlowService._build_report_summary_pdf(
            listing=listing,
            opening_balance=Decimal("0"),
            closing_balance=Decimal("-1"),
            report_title="Cashflow",
            search=None,
            include_invoice_table=False,
        )

    report_rows = styled_table.call_args_list[1].args[0]
    supplier_cell = report_rows[1][4]

    assert isinstance(supplier_cell, Paragraph)
    assert supplier_cell.wrap(35 * mm, 1000)[1] > supplier_cell.style.leading
