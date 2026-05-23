import uuid
from datetime import date
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch

from fastapi.testclient import TestClient
from pypdf import PdfReader
from reportlab.lib import colors
from sqlmodel import Session, select

from app.core.config import settings
from app.models import CashFlowRecord, Condominio, CondominioCreate, User
from app.services.cash_flow_service import CashFlowService


def _create_test_condominio(db: Session) -> Condominio:
    condominio = Condominio.model_validate(
        CondominioCreate(nome="Test Cash Flow Condominio")
    )
    db.add(condominio)
    db.commit()
    db.refresh(condominio)
    return condominio


def _assign_superuser_to_condominio(db: Session, condominio: Condominio) -> None:
    superuser = db.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    assert superuser is not None
    superuser.condominio_id = condominio.id
    db.add(superuser)
    db.commit()


def test_create_and_read_cash_flow_records(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    condominio = _create_test_condominio(db)
    _assign_superuser_to_condominio(db, condominio)

    response_a = client.post(
        f"{settings.API_V1_STR}/cash-flow/",
        headers=superuser_token_headers,
        json={
            "has_invoice": True,
            "invoice_media_name": "invoice.png",
            "invoice_media_data": "data:image/png;base64,aGVsbG8=",
            "record_date": "2026-03-01",
            "amount": -610,
            "supplier": "ACME Services",
            "description": "Admin fees",
        },
    )
    response_b = client.post(
        f"{settings.API_V1_STR}/cash-flow/",
        headers=superuser_token_headers,
        json={
            "has_invoice": False,
            "record_date": "2026-03-09",
            "amount": 125,
            "description": "Refund",
        },
    )

    assert response_a.status_code == 201
    assert response_a.json()["payment_number"] == 1
    assert response_a.json()["invoice_media_name"] == "invoice.png"
    assert response_a.json()["supplier"] == "ACME Services"
    assert "flat" not in response_a.json()
    assert response_b.status_code == 201
    assert response_b.json()["payment_number"] == 2

    read_response = client.get(
        f"{settings.API_V1_STR}/cash-flow/",
        headers=superuser_token_headers,
        params={"date_from": "2026-03-01", "date_to": "2026-03-31"},
    )

    assert read_response.status_code == 200
    body = read_response.json()
    assert body["count"] == 2
    assert body["balance"] == -485
    assert body["next_payment_number"] == 3
    assert [record["payment_number"] for record in body["data"]] == [1, 2]
    assert body["data"][0]["supplier"] == "ACME Services"
    assert all("flat" not in record for record in body["data"])


def test_cash_flow_search_matches_supplier(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    condominio = _create_test_condominio(db)
    _assign_superuser_to_condominio(db, condominio)

    create_response = client.post(
        f"{settings.API_V1_STR}/cash-flow/",
        headers=superuser_token_headers,
        json={
            "has_invoice": False,
            "record_date": "2026-03-10",
            "amount": -50,
            "supplier": "Northwind",
            "description": "Monthly service",
        },
    )
    assert create_response.status_code == 201

    response = client.get(
        f"{settings.API_V1_STR}/cash-flow/",
        headers=superuser_token_headers,
        params={
            "date_from": "2026-03-01",
            "date_to": "2026-03-31",
            "search": "northwind",
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["data"][0]["supplier"] == "Northwind"


def test_cash_flow_payment_numbers_are_chronological_within_month(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    condominio = _create_test_condominio(db)
    _assign_superuser_to_condominio(db, condominio)

    response_later = client.post(
        f"{settings.API_V1_STR}/cash-flow/",
        headers=superuser_token_headers,
        json={
            "has_invoice": False,
            "record_date": "2026-03-20",
            "amount": -20,
            "description": "Later payment",
        },
    )
    response_earlier = client.post(
        f"{settings.API_V1_STR}/cash-flow/",
        headers=superuser_token_headers,
        json={
            "has_invoice": False,
            "record_date": "2026-03-19",
            "amount": -19,
            "description": "Earlier payment",
        },
    )

    assert response_later.status_code == 201
    assert response_later.json()["payment_number"] == 1
    assert response_earlier.status_code == 201
    assert response_earlier.json()["payment_number"] == 1

    read_response = client.get(
        f"{settings.API_V1_STR}/cash-flow/",
        headers=superuser_token_headers,
        params={"date_from": "2026-03-01", "date_to": "2026-03-31"},
    )

    assert read_response.status_code == 200
    body = read_response.json()
    assert body["next_payment_number"] == 3
    assert [
        (record["record_date"], record["payment_number"], record["description"])
        for record in body["data"]
    ] == [
        ("2026-03-19", 1, "Earlier payment"),
        ("2026-03-20", 2, "Later payment"),
    ]


def test_cash_flow_payment_numbers_restart_each_month(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    condominio = _create_test_condominio(db)
    _assign_superuser_to_condominio(db, condominio)

    for record_date in ("2026-03-20", "2026-04-01"):
        response = client.post(
            f"{settings.API_V1_STR}/cash-flow/",
            headers=superuser_token_headers,
            json={
                "has_invoice": False,
                "record_date": record_date,
                "amount": -10,
                "description": f"Payment {record_date}",
            },
        )
        assert response.status_code == 201
        assert response.json()["payment_number"] == 1

    march_response = client.get(
        f"{settings.API_V1_STR}/cash-flow/",
        headers=superuser_token_headers,
        params={"date_from": "2026-03-01", "date_to": "2026-03-31"},
    )
    april_response = client.get(
        f"{settings.API_V1_STR}/cash-flow/",
        headers=superuser_token_headers,
        params={"date_from": "2026-04-01", "date_to": "2026-04-30"},
    )

    assert march_response.status_code == 200
    assert april_response.status_code == 200
    assert march_response.json()["data"][0]["payment_number"] == 1
    assert april_response.json()["data"][0]["payment_number"] == 1
    assert march_response.json()["next_payment_number"] == 2
    assert april_response.json()["next_payment_number"] == 2


def test_cash_flow_records_are_scoped_to_condominio(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    condominio_a = _create_test_condominio(db)
    condominio_b = Condominio.model_validate(
        CondominioCreate(nome="Test Cash Flow Other Condominio")
    )
    db.add(condominio_b)
    db.commit()
    db.refresh(condominio_b)

    _assign_superuser_to_condominio(db, condominio_a)
    visible = CashFlowRecord(
        payment_number=1,
        record_date=date(2026, 3, 1),
        amount=-10,
        description="Visible",
        condominio_id=condominio_a.id,
        created_by_user_id=db.exec(
            select(User).where(User.email == settings.FIRST_SUPERUSER)
        ).one().id,
    )
    hidden = CashFlowRecord(
        payment_number=1,
        record_date=date(2026, 3, 1),
        amount=-99,
        description="Hidden",
        condominio_id=condominio_b.id,
        created_by_user_id=visible.created_by_user_id,
    )
    db.add(visible)
    db.add(hidden)
    db.commit()

    response = client.get(
        f"{settings.API_V1_STR}/cash-flow/",
        headers=superuser_token_headers,
        params={"date_from": "2026-03-01", "date_to": "2026-03-31"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["data"][0]["description"] == "Visible"
    assert body["balance"] == -10


def test_delete_cash_flow_record(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    condominio = _create_test_condominio(db)
    _assign_superuser_to_condominio(db, condominio)

    create_response = client.post(
        f"{settings.API_V1_STR}/cash-flow/",
        headers=superuser_token_headers,
        json={
            "has_invoice": False,
            "record_date": "2026-03-15",
            "amount": -42.5,
            "description": "Cleaner",
        },
    )
    assert create_response.status_code == 201
    record_id = create_response.json()["id"]

    delete_response = client.delete(
        f"{settings.API_V1_STR}/cash-flow/{record_id}",
        headers=superuser_token_headers,
    )

    assert delete_response.status_code == 200
    db.expire_all()
    assert db.get(CashFlowRecord, uuid.UUID(record_id)) is None


def test_cash_flow_requires_manager_permissions(
    client: TestClient,
    normal_user_token_headers: dict[str, str],
) -> None:
    response = client.get(
        f"{settings.API_V1_STR}/cash-flow/",
        headers=normal_user_token_headers,
    )

    assert response.status_code == 403


def test_generate_cash_flow_report_pdf(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    condominio = _create_test_condominio(db)
    _assign_superuser_to_condominio(db, condominio)

    response = client.post(
        f"{settings.API_V1_STR}/cash-flow/",
        headers=superuser_token_headers,
        json={
            "has_invoice": True,
            "invoice_media_name": "invoice.png",
            "invoice_media_data": (
                "data:image/png;base64,"
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII="
            ),
            "record_date": "2026-03-12",
            "amount": -88.75,
            "description": "Supplier invoice",
        },
    )
    assert response.status_code == 201

    report_response = client.get(
        f"{settings.API_V1_STR}/cash-flow/report/",
        headers=superuser_token_headers,
        params={
            "start_month": "2026-03",
            "end_month": "2026-03",
            "include_invoice_table": "true",
        },
    )

    assert report_response.status_code == 200
    assert report_response.headers["content-type"] == "application/pdf"
    assert "cashflow-report-2026-03.pdf" in report_response.headers["content-disposition"]
    assert report_response.content.startswith(b"%PDF")

    pdf = PdfReader(BytesIO(report_response.content))
    assert len(pdf.pages) >= 2
    extracted_text = "\n".join(page.extract_text() or "" for page in pdf.pages)
    assert "Invoice #1" in extracted_text


def test_send_cash_flow_report(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    condominio = _create_test_condominio(db)
    _assign_superuser_to_condominio(db, condominio)

    create_response = client.post(
        f"{settings.API_V1_STR}/cash-flow/",
        headers=superuser_token_headers,
        json={
            "has_invoice": False,
            "record_date": "2026-03-15",
            "amount": -42.5,
            "description": "Cleaner",
        },
    )
    assert create_response.status_code == 201

    with patch("app.services.cash_flow_service.send_email_with_attachment") as email_mock:
        response = client.post(
            f"{settings.API_V1_STR}/cash-flow/report/send/",
            headers=superuser_token_headers,
            json={
                "email_to": "resident@example.com",
                "start_month": "2026-03",
                "end_month": "2026-03",
                "search": "Cleaner",
                "include_invoice_table": False,
            },
        )

    assert response.status_code == 201
    assert response.json() == {"message": "Report sent successfully"}
    email_mock.assert_called_once()


def test_generate_cash_flow_report_shows_carried_balance_without_records(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    condominio = _create_test_condominio(db)
    _assign_superuser_to_condominio(db, condominio)

    response = client.post(
        f"{settings.API_V1_STR}/cash-flow/",
        headers=superuser_token_headers,
        json={
            "has_invoice": False,
            "record_date": "2026-02-12",
            "amount": 1000,
            "description": "Opening balance",
        },
    )
    assert response.status_code == 201

    report_response = client.get(
        f"{settings.API_V1_STR}/cash-flow/report/",
        headers=superuser_token_headers,
        params={
            "start_month": "2026-03",
            "end_month": "2026-03",
            "include_invoice_table": "false",
        },
    )

    assert report_response.status_code == 200
    pdf = PdfReader(BytesIO(report_response.content))
    extracted_text = "\n".join(page.extract_text() or "" for page in pdf.pages)
    assert "Balance carried forward" in extracted_text
    assert "1,000.00" in extracted_text


def test_cash_flow_report_money_cells_use_sign_colors() -> None:
    negative_cell = CashFlowService._money_cell(Decimal("-1"))
    positive_cell = CashFlowService._money_cell(Decimal("1"))
    neutral_cell = CashFlowService._money_cell(Decimal("0"))

    assert negative_cell.style.textColor == colors.HexColor("#cf0e0e")
    assert positive_cell.style.textColor == colors.HexColor("#217a4b")
    assert neutral_cell.style.textColor == colors.black
