import base64
import binascii
import re
import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from io import BytesIO

from fastapi import HTTPException, status
from pypdf import PageObject, PdfReader, PdfWriter, Transformation
from pypdf.errors import PdfReadError
from pypdf.generic import RectangleObject
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from sqlmodel import Session, func, select

from app.models import CashFlowRecord
from app.utils import send_email_with_attachment

DATA_URL_PATTERN = re.compile(
    r"^data:(?P<mime>[-\w.+/]+/[-\w.+]+)?;base64,(?P<data>[A-Za-z0-9+/=\s]+)$"
)
NEGATIVE_MONEY_COLOR = colors.HexColor("#cf0e0e")
POSITIVE_MONEY_COLOR = colors.HexColor("#217a4b")


@dataclass
class CashFlowReportRow:
    id: uuid.UUID
    payment_number: int
    has_invoice: bool
    invoice_media_name: str | None
    record_date: date
    amount: Decimal
    supplier: str
    description: str
    balance: Decimal


@dataclass
class CashFlowReportListResponse:
    month: str
    monthly_total: Decimal
    items: list[CashFlowReportRow]


class CashFlowService:
    def __init__(self, session: Session, condominio_id: uuid.UUID) -> None:
        self.session = session
        self.condominio_id = condominio_id

    def list_month(
        self,
        month: str | None,
        search: str | None = None,
    ) -> CashFlowReportListResponse:
        month_label, month_start, month_end = self._parse_month(month)
        return self.list_range(month_label, month_start, month_end, search)

    def list_range(
        self,
        period_label: str,
        start_date: date,
        end_date: date,
        search: str | None = None,
    ) -> CashFlowReportListResponse:
        records = self.session.exec(
            select(CashFlowRecord)
            .where(
                CashFlowRecord.condominio_id == self.condominio_id,
                CashFlowRecord.record_date >= start_date,
                CashFlowRecord.record_date < end_date,
            )
            .order_by(
                CashFlowRecord.record_date.asc(),
                CashFlowRecord.payment_number.asc(),
                CashFlowRecord.created_at.asc(),
                CashFlowRecord.id.asc(),
            )
        ).all()

        query = (search or "").strip().lower()
        opening_balance = self.get_balance_before(start_date)
        running_balance = opening_balance
        period_total = Decimal("0")
        items: list[CashFlowReportRow] = []

        for dynamic_payment_number, record in enumerate(records, start=1):
            amount = Decimal(str(record.amount))
            period_total += amount
            running_balance += amount

            description = record.description or ""
            supplier = record.supplier or ""
            if query and query not in description.lower() and query not in supplier.lower():
                continue

            items.append(
                CashFlowReportRow(
                    id=record.id,
                    payment_number=dynamic_payment_number,
                    has_invoice=record.has_invoice,
                    invoice_media_name=record.invoice_media_name,
                    record_date=record.record_date,
                    amount=amount,
                    supplier=supplier,
                    description=description,
                    balance=running_balance,
                )
            )

        return CashFlowReportListResponse(
            month=period_label,
            monthly_total=period_total,
            items=items,
        )

    def get_balance_before(self, start_date: date) -> Decimal:
        balance = self.session.exec(
            select(func.coalesce(func.sum(CashFlowRecord.amount), 0))
            .where(
                CashFlowRecord.condominio_id == self.condominio_id,
                CashFlowRecord.record_date < start_date,
            )
        ).one()
        return Decimal(str(balance or 0))

    def send_range_report(
        self,
        recipient: str,
        start_month: str | None,
        end_month: str | None,
        search: str | None = None,
        include_invoice_table: bool = False,
    ) -> None:
        period_label, report_data = self.build_range_report_pdf(
            start_month=start_month,
            end_month=end_month,
            search=search,
            include_invoice_table=include_invoice_table,
        )
        report_name = self.report_name
        file_name = self.build_report_file_name(period_label)
        subject = f"{report_name} report {period_label}"
        body = f"<p>Hello,</p><p>Attached is the {report_name.lower()} report for {period_label}.</p>"

        send_email_with_attachment(
            email_to=recipient,
            subject=subject,
            html_content=body,
            file_name=file_name,
            file_bytes=report_data,
            mime_type="application/pdf",
        )

    def build_range_report_pdf(
        self,
        start_month: str | None,
        end_month: str | None,
        search: str | None = None,
        include_invoice_table: bool = False,
    ) -> tuple[str, bytes]:
        period_label, period_start, period_end = self._parse_month_range(
            start_month=start_month,
            end_month=end_month,
        )
        listing = self.list_range(period_label, period_start, period_end, search)
        opening_balance = self.get_balance_before(period_start)
        closing_balance = opening_balance + listing.monthly_total
        report_data = self._build_report_pdf(
            listing,
            opening_balance,
            closing_balance,
            self.report_name,
            search,
            include_invoice_table,
        )
        return period_label, report_data

    @property
    def report_name(self) -> str:
        return "Cashflow"

    @staticmethod
    def build_report_file_name(period_label: str) -> str:
        return f"cashflow-report-{period_label}.pdf"

    def _build_report_pdf(
        self,
        listing: CashFlowReportListResponse,
        opening_balance: Decimal,
        closing_balance: Decimal,
        report_title: str,
        search: str | None,
        include_invoice_table: bool,
    ) -> bytes:
        writer = PdfWriter()
        summary_pdf = self._build_report_summary_pdf(
            listing,
            opening_balance,
            closing_balance,
            report_title,
            search,
            include_invoice_table,
        )
        for page in PdfReader(BytesIO(summary_pdf)).pages:
            writer.add_page(page)

        for item in listing.items:
            record = self.session.get(CashFlowRecord, item.id)
            if not record or not record.has_invoice or not record.invoice_media_data:
                continue

            try:
                mime_type, media_bytes = self._decode_media_data(record.invoice_media_data)
                self._append_media_pages(
                    writer,
                    media_bytes,
                    mime_type,
                    invoice_label=f"Invoice #{item.payment_number}",
                )
            except HTTPException:
                fallback_pdf = self._placeholder_pdf_page("Unable to render invoice media")
                for page in PdfReader(BytesIO(fallback_pdf)).pages:
                    writer.add_page(page)

        output = BytesIO()
        writer.write(output)
        return output.getvalue()

    @staticmethod
    def _build_report_summary_pdf(
        listing: CashFlowReportListResponse,
        opening_balance: Decimal,
        closing_balance: Decimal,
        report_title: str,
        search: str | None,
        include_invoice_table: bool,
    ) -> bytes:
        output = BytesIO()
        doc = SimpleDocTemplate(
            output,
            pagesize=A4,
            leftMargin=14 * mm,
            rightMargin=14 * mm,
            topMargin=14 * mm,
            bottomMargin=14 * mm,
        )
        styles = getSampleStyleSheet()
        story = [
            Paragraph(f"{report_title} Report", styles["Title"]),
            Paragraph(f"Period: {listing.month}", styles["Normal"]),
            Paragraph(
                f"Filter: {search.strip()}"
                if search and search.strip()
                else "Filter: All records",
                styles["Normal"],
            ),
            Spacer(1, 8),
        ]

        summary_rows = [["Balance", CashFlowService._money_cell(closing_balance)]]
        story.append(
            CashFlowService._styled_table(summary_rows, [90 * mm, 55 * mm], has_header=False)
        )
        story.append(Spacer(1, 12))

        rows: list[list[object]] = [
            ["Payment #", "Invoice", "Date", "Amount", "Supplier", "Comments", "Balance"]
        ]
        table_body_style = CashFlowService._table_body_paragraph_style()
        rows.extend(
            [
                [
                    f"#{item.payment_number}",
                    "Yes" if item.has_invoice else "No",
                    CashFlowService._format_date(item.record_date),
                    CashFlowService._money_cell(item.amount),
                    CashFlowService._paragraph_cell(item.supplier or "", table_body_style),
                    CashFlowService._paragraph_cell(item.description or "", table_body_style),
                    CashFlowService._money_cell(item.balance),
                ]
                for item in listing.items
            ]
        )
        if len(rows) == 1:
            rows.append(
                [
                    "-",
                    "No",
                    "-",
                    CashFlowService._money_cell(Decimal("0")),
                    "-",
                    "Balance carried forward",
                    CashFlowService._money_cell(closing_balance),
                ]
            )

        story.append(
            CashFlowService._styled_table(
                rows,
                [16 * mm, 18 * mm, 22 * mm, 22 * mm, 35 * mm, 46 * mm, 22 * mm],
            )
        )

        if include_invoice_table:
            story.append(Spacer(1, 14))
            story.append(Paragraph("Invoices", styles["Heading2"]))
            invoice_rows: list[list[object]] = [
                ["Payment #", "Date", "File", "Supplier", "Comments"]
            ]
            invoice_body_style = CashFlowService._table_body_paragraph_style()
            invoice_rows.extend(
                [
                    [
                        f"#{item.payment_number}",
                        CashFlowService._format_date(item.record_date),
                        item.invoice_media_name or "invoice",
                        CashFlowService._paragraph_cell(
                            item.supplier or "", invoice_body_style
                        ),
                        CashFlowService._paragraph_cell(
                            item.description or "", invoice_body_style
                        ),
                    ]
                    for item in listing.items
                    if item.has_invoice
                ]
            )
            if len(invoice_rows) == 1:
                invoice_rows.append(["-", "-", "No invoice media in this period.", "-", "-"])

            story.append(
                CashFlowService._styled_table(
                    invoice_rows,
                    [20 * mm, 22 * mm, 42 * mm, 35 * mm, 56 * mm],
                )
            )

        doc.build(story)
        return output.getvalue()

    @staticmethod
    def _styled_table(
        rows: list[list[object]],
        widths: list[float],
        has_header: bool = True,
    ) -> Table:
        table = Table(rows, colWidths=widths, repeatRows=1 if has_header else 0)
        style = [
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#E5E0DC")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ]
        if has_header:
            style.extend(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#8C7569")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ]
            )
        else:
            style.extend(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F5F1EE")),
                    ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                ]
            )
        table.setStyle(TableStyle(style))
        return table

    @staticmethod
    def _table_body_paragraph_style() -> ParagraphStyle:
        return ParagraphStyle(
            "CashFlowTableBody",
            fontName="Helvetica",
            fontSize=8,
            leading=9.5,
            textColor=colors.black,
            spaceAfter=0,
            spaceBefore=0,
        )

    @staticmethod
    def _paragraph_cell(value: str, style: ParagraphStyle) -> Paragraph:
        text = value.strip() or "-"
        return Paragraph(text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"), style)

    @staticmethod
    def _money_cell(value: Decimal) -> Paragraph:
        text_color = colors.black
        if value < 0:
            text_color = NEGATIVE_MONEY_COLOR
        elif value > 0:
            text_color = POSITIVE_MONEY_COLOR

        return CashFlowService._paragraph_cell(
            CashFlowService._format_money(value),
            ParagraphStyle(
                "CashFlowMoneyCell",
                parent=CashFlowService._table_body_paragraph_style(),
                textColor=text_color,
            ),
        )

    @staticmethod
    def _append_media_pages(
        writer: PdfWriter,
        data: bytes,
        mime_type: str,
        invoice_label: str,
    ) -> None:
        if mime_type == "application/pdf":
            try:
                reader = PdfReader(BytesIO(data))
                for page in reader.pages:
                    writer.add_page(
                        CashFlowService._compose_media_page(
                            source_page=page,
                            invoice_label=invoice_label,
                        )
                    )
                return
            except (PdfReadError, ValueError, TypeError):
                pass

        if mime_type.startswith("image/"):
            try:
                media_pdf = CashFlowService._image_to_labeled_pdf_page(data, invoice_label)
                for page in PdfReader(BytesIO(media_pdf)).pages:
                    writer.add_page(page)
                return
            except OSError:
                pass

        fallback_pdf = CashFlowService._placeholder_pdf_page("Unable to render invoice media")
        for page in PdfReader(BytesIO(fallback_pdf)).pages:
            writer.add_page(page)

    @staticmethod
    def _compose_media_page(
        source_page: PageObject,
        invoice_label: str,
    ) -> PageObject:
        page_width, page_height = A4
        target_page = PageObject.create_blank_page(width=page_width, height=page_height)
        header_height, body_x, body_y, body_width, body_height = (
            CashFlowService._media_frame(page_width, page_height)
        )
        media_box = source_page.mediabox
        source_width = float(media_box.width)
        source_height = float(media_box.height)
        if source_width <= 0 or source_height <= 0:
            CashFlowService._merge_overlay_page(
                target_page,
                CashFlowService._invoice_label_overlay(invoice_label),
            )
            return target_page
        scale = min(body_width / source_width, body_height / source_height)
        draw_width = source_width * scale
        draw_height = source_height * scale
        x_offset = body_x + (body_width - draw_width) / 2
        y_offset = body_y + (body_height - draw_height) / 2
        source_page.cropbox = RectangleObject(media_box)
        transformation = Transformation().scale(scale).translate(x_offset, y_offset)
        target_page.merge_transformed_page(source_page, transformation)
        CashFlowService._merge_overlay_page(
            target_page,
            CashFlowService._invoice_label_overlay(
                invoice_label, page_width=page_width, page_height=page_height
            ),
        )
        return target_page

    @staticmethod
    def _image_to_labeled_pdf_page(data: bytes, invoice_label: str) -> bytes:
        output = BytesIO()
        page_width, page_height = A4
        header_height, body_x, body_y, body_width, body_height = CashFlowService._media_frame(
            page_width, page_height
        )
        image = ImageReader(BytesIO(data))
        image_width, image_height = image.getSize()
        scale = min(body_width / image_width, body_height / image_height)
        draw_width = image_width * scale
        draw_height = image_height * scale
        x = body_x + (body_width - draw_width) / 2
        y = body_y + (body_height - draw_height) / 2

        pdf = canvas.Canvas(output, pagesize=A4)
        pdf.setFillColor(NEGATIVE_MONEY_COLOR)
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(14 * mm, page_height - header_height + (header_height * 0.35), invoice_label)
        pdf.drawImage(
            image,
            x,
            y,
            width=draw_width,
            height=draw_height,
            preserveAspectRatio=True,
            mask="auto",
        )
        pdf.showPage()
        pdf.save()
        return output.getvalue()

    @staticmethod
    def _invoice_label_overlay(
        invoice_label: str,
        *,
        page_width: float = A4[0],
        page_height: float = A4[1],
    ) -> bytes:
        output = BytesIO()
        header_height, _, _, _, _ = CashFlowService._media_frame(page_width, page_height)
        pdf = canvas.Canvas(output, pagesize=(page_width, page_height))
        pdf.setFillColor(NEGATIVE_MONEY_COLOR)
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(14 * mm, page_height - header_height + (header_height * 0.35), invoice_label)
        pdf.save()
        return output.getvalue()

    @staticmethod
    def _merge_overlay_page(target_page: PageObject, overlay_pdf: bytes) -> None:
        overlay_page = PdfReader(BytesIO(overlay_pdf)).pages[0]
        target_page.merge_page(overlay_page)

    @staticmethod
    def _media_frame(
        page_width: float,
        page_height: float,
    ) -> tuple[float, float, float, float, float]:
        header_height = page_height * 0.07
        side_margin = 8 * mm
        bottom_margin = 8 * mm
        body_x = side_margin
        body_y = bottom_margin
        body_width = page_width - (side_margin * 2)
        body_height = max(page_height - header_height - bottom_margin, 1)
        return header_height, body_x, body_y, body_width, body_height

    @staticmethod
    def _placeholder_pdf_page(message: str) -> bytes:
        output = BytesIO()
        page_width, page_height = A4
        pdf = canvas.Canvas(output, pagesize=A4)
        pdf.setFont("Helvetica", 11)
        pdf.drawCentredString(page_width / 2, page_height / 2, message)
        pdf.showPage()
        pdf.save()
        return output.getvalue()

    @staticmethod
    def _format_money(value: Decimal) -> str:
        return f"£ {value:,.2f}"

    @staticmethod
    def _format_date(value: date) -> str:
        return value.strftime("%d-%m-%Y")

    @staticmethod
    def _parse_month(month: str | None) -> tuple[str, date, date]:
        if month is None or not month.strip():
            today = date.today()
            month_start = date(today.year, today.month, 1)
            month_label = f"{today.year:04d}-{today.month:02d}"
        else:
            try:
                year_str, month_str = month.split("-", maxsplit=1)
                year = int(year_str)
                month_value = int(month_str)
                month_start = date(year, month_value, 1)
                month_label = f"{year:04d}-{month_value:02d}"
            except (TypeError, ValueError) as exc:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Invalid month format. Use YYYY-MM",
                ) from exc

        if month_start.month == 12:
            month_end = date(month_start.year + 1, 1, 1)
        else:
            month_end = date(month_start.year, month_start.month + 1, 1)

        return month_label, month_start, month_end

    @classmethod
    def _parse_month_range(
        cls,
        start_month: str | None,
        end_month: str | None,
    ) -> tuple[str, date, date]:
        if not start_month or not end_month:
            today = date.today()
            default_month = f"{today.year:04d}-{today.month:02d}"
            start_month = start_month or default_month
            end_month = end_month or start_month

        start_label, start_date, _ = cls._parse_month(start_month)
        end_label, end_start, end_exclusive = cls._parse_month(end_month)
        if start_date > end_start:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Start month must be before or equal to end month",
            )

        period_label = start_label if start_label == end_label else f"{start_label}_to_{end_label}"
        return period_label, start_date, end_exclusive

    @staticmethod
    def _decode_media_data(value: str) -> tuple[str, bytes]:
        stripped = value.strip()
        match = DATA_URL_PATTERN.fullmatch(stripped)
        if not match:
            raise HTTPException(status_code=422, detail="Invalid invoice_media_data")

        try:
            file_bytes = base64.b64decode(match.group("data"), validate=True)
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(status_code=422, detail="Invalid invoice_media_data") from exc

        if not file_bytes:
            raise HTTPException(status_code=422, detail="Empty invoice_media_data")

        mime_type = match.group("mime") or "application/octet-stream"
        return mime_type, file_bytes
