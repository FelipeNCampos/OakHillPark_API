import base64
import uuid
from collections.abc import Iterator
from datetime import date
from decimal import Decimal
from io import BytesIO
from typing import Any
from unittest.mock import patch

import pytest
from PIL import Image
from pypdf import PdfReader
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph
from sqlalchemy import event
from sqlmodel import Session, create_engine

from app.api.routes.cash_flow import generate_cash_flow_report
from app.models import CashFlowRecord, User
from app.services.cash_flow_service import (
    INVOICE_BATCH_SIZE,
    CashFlowReportListResponse,
    CashFlowReportRow,
    CashFlowService,
)


@pytest.fixture(scope="session")
def db() -> None:
    """Keep pure PDF layout tests independent from the database fixture."""


@pytest.fixture
def report_session() -> Iterator[Session]:
    engine = create_engine("sqlite://")
    CashFlowRecord.__table__.create(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def _record(condominio_id: uuid.UUID, number: int, **values: Any) -> CashFlowRecord:
    return CashFlowRecord(
        condominio_id=condominio_id,
        created_by_user_id=uuid.uuid4(),
        payment_number=number,
        **{"record_date": date(2026, 3, 12), "amount": -1, **values},
    )


@pytest.mark.parametrize("invoice_count", [0, 1, INVOICE_BATCH_SIZE + 1])
def test_report_batches_queries_and_preserves_invoice_order(
    report_session: Session, invoice_count: int
) -> None:
    condominio_id = uuid.uuid4()
    invoice_pdf = CashFlowService._placeholder_pdf_page("Original invoice")
    media = "data:application/pdf;base64," + base64.b64encode(invoice_pdf).decode()
    report_session.add_all(
        [
            _record(condominio_id, number, has_invoice=True, invoice_media_data=media)
            for number in reversed(range(1, invoice_count + 1))
        ]
        + [_record(condominio_id, invoice_count + 1)]
    )
    report_session.commit()
    statements: list[str] = []

    def capture_sql(_conn: Any, _cursor: Any, statement: str, *_args: Any) -> None:
        statements.append(statement)

    event.listen(report_session.get_bind(), "before_cursor_execute", capture_sql)
    _, data = CashFlowService(report_session, condominio_id).build_range_report_pdf(
        "2026-03", "2026-03", include_invoice_table=True
    )

    assert (
        len(statements)
        == 2 + (invoice_count + INVOICE_BATCH_SIZE - 1) // INVOICE_BATCH_SIZE
    )
    # The summary may inspect whether media exists, but must not transfer it.
    assert "cash_flow_record.invoice_media_data," not in statements[0]
    assert "cash_flow_record.invoice_media_data \n" not in statements[0]
    invoice_pages = [
        page.extract_text()
        for page in PdfReader(BytesIO(data)).pages
        if "Original invoice" in page.extract_text()
    ]
    assert len(invoice_pages) == invoice_count
    for number, text in enumerate(invoice_pages, start=1):
        assert f"Invoice #{number}\n" in text


def test_report_search_keeps_balances_and_excludes_other_invoices(
    report_session: Session,
) -> None:
    condominio_id = uuid.uuid4()
    report_session.add_all(
        [
            _record(condominio_id, 1, record_date=date(2026, 2, 1), amount=100),
            _record(
                condominio_id,
                1,
                amount=-10,
                supplier="Hidden",
                has_invoice=True,
                invoice_media_data="invalid excluded attachment",
            ),
            _record(
                condominio_id,
                2,
                amount=-20,
                supplier="Selected",
                has_invoice=True,
                invoice_media_data="invalid included attachment",
            ),
            _record(
                uuid.uuid4(),
                1,
                amount=9000,
                supplier="Selected",
                has_invoice=True,
                invoice_media_data="invalid other tenant attachment",
            ),
            _record(condominio_id, 1, record_date=date(2026, 4, 1), amount=500),
        ]
    )
    report_session.commit()
    service = CashFlowService(report_session, condominio_id)
    listing = service.list_month("2026-03", "selected")
    assert listing.opening_balance == Decimal("100")
    assert listing.monthly_total == Decimal("-30")
    assert len(listing.items) == 1
    assert listing.items[0].balance == Decimal("70")

    _, data = service.build_range_report_pdf("2026-03", "2026-03", "selected")
    pages = PdfReader(BytesIO(data)).pages
    assert len(pages) == 2
    assert "Selected" in pages[0].extract_text()
    assert "Hidden" not in pages[0].extract_text()
    assert "70.00" in pages[0].extract_text()
    assert "Unable to render invoice media" in pages[1].extract_text()


def test_report_empty_month_carries_opening_balance(report_session: Session) -> None:
    condominio_id = uuid.uuid4()
    report_session.add(
        _record(condominio_id, 1, record_date=date(2026, 2, 1), amount=1000)
    )
    report_session.commit()
    _, data = CashFlowService(report_session, condominio_id).build_range_report_pdf(
        "2026-03", "2026-03"
    )
    text = PdfReader(BytesIO(data)).pages[0].extract_text()
    assert "Balance carried forward" in text
    assert "1,000.00" in text


@pytest.mark.parametrize("include_invoice_table", [False, True])
@pytest.mark.parametrize("has_invoice", [False, True])
def test_preview_always_embeds_images_and_every_pdf_page(
    report_session: Session, include_invoice_table: bool, has_invoice: bool
) -> None:
    tenant = uuid.uuid4()
    image_data = BytesIO()
    Image.new("RGB", (24, 16), (12, 120, 220)).save(image_data, format="PNG")
    pdf_data = BytesIO()
    pdf = canvas.Canvas(pdf_data)
    for text in ("Invoice first page", "Invoice second page"):
        pdf.drawString(50, 500, text)
        pdf.showPage()
    pdf.save()
    for number, mime, data in (
        (26, "image/png", image_data.getvalue()),
        (27, "application/pdf", pdf_data.getvalue()),
    ):
        report_session.add(
            _record(
                tenant,
                number,
                has_invoice=has_invoice,
                invoice_media_data=f"data:{mime};base64,"
                + base64.b64encode(data).decode(),
            )
        )
    report_session.commit()
    response = generate_cash_flow_report(
        session=report_session,
        current_user=User(condominio_id=tenant, is_superuser=True),
        start_month="2026-03",
        end_month="2026-03",
        include_invoice_table=include_invoice_table,
    )
    assert response.media_type == "application/pdf"
    assert response.headers["content-disposition"].startswith("inline;")
    pages = PdfReader(BytesIO(response.body)).pages
    assert len(pages) == 4
    assert "Invoice #26" in pages[1].extract_text()
    assert len(pages[1].images) == 1
    assert pages[1].images[0].image.convert("RGB").getpixel((0, 0)) == (12, 120, 220)
    assert "Invoice #27" in pages[2].extract_text()
    assert "Invoice first page" in pages[2].extract_text()
    assert "Invoice #27" in pages[3].extract_text()
    assert "Invoice second page" in pages[3].extract_text()


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
