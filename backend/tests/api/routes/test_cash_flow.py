import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from io import BytesIO
from unittest.mock import patch

from fastapi.testclient import TestClient
from pypdf import PdfReader
from reportlab.lib import colors
from sqlmodel import Session, select

from app.core.config import cash_flow_share_frontend_host, settings
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


def test_cash_flow_records_store_location_and_reason(
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
            "amount": -42.5,
            "supplier": "OakHill Supplies",
            "description": "Cleaning materials",
            "location": "Northwood 1A",
            "reason": "Emergency spill cleanup",
        },
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["location"] == "Northwood 1A"
    assert created["reason"] == "Emergency spill cleanup"

    update_response = client.patch(
        f"{settings.API_V1_STR}/cash-flow/{created['id']}",
        headers=superuser_token_headers,
        json={"location": "Estate OHP", "reason": "Routine cleaning"},
    )

    assert update_response.status_code == 200
    assert update_response.json()["location"] == "Estate OHP"
    assert update_response.json()["reason"] == "Routine cleaning"

    read_response = client.get(
        f"{settings.API_V1_STR}/cash-flow/",
        headers=superuser_token_headers,
        params={"date_from": "2026-03-01", "date_to": "2026-03-31"},
    )

    assert read_response.status_code == 200
    assert read_response.json()["data"][0]["location"] == "Estate OHP"
    assert read_response.json()["data"][0]["reason"] == "Routine cleaning"


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
    record = db.get(CashFlowRecord, uuid.UUID(response.json()["id"]))
    assert record is not None
    record.payment_number = 26
    record.invoice_media_name = "inv-0021.png"
    db.add(record)
    db.commit()

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
    assert "Invoice #26" in extracted_text


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


def test_cash_flow_share_link_frontend_host_uses_the_environment() -> None:
    assert (
        cash_flow_share_frontend_host(
            environment="local",
            domain="localhost.tiangolo.com",
            local_frontend_host="http://localhost:5173",
        )
        == "http://localhost:5173"
    )
    assert (
        cash_flow_share_frontend_host(
            environment="production",
            domain="oakhillpark.cloud",
            local_frontend_host="http://localhost:5173",
        )
        == "https://dashboard.oakhillpark.cloud"
    )


def test_cash_flow_share_link_exposes_only_its_live_date_range(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    condominio = _create_test_condominio(db)
    _assign_superuser_to_condominio(db, condominio)

    for record_date, amount, description, has_invoice in (
        ("2026-03-01", 100, "Before range", False),
        ("2026-03-10", -25, "Invoice in range", True),
        ("2026-03-31", 50, "Last day in range", False),
        ("2026-04-01", 75, "After range", False),
    ):
        response = client.post(
            f"{settings.API_V1_STR}/cash-flow/",
            headers=superuser_token_headers,
            json={
                "has_invoice": has_invoice,
                "invoice_media_name": "invoice.png" if has_invoice else None,
                "invoice_media_data": (
                    "data:image/png;base64,aGVsbG8=" if has_invoice else None
                ),
                "record_date": record_date,
                "amount": amount,
                "description": description,
            },
        )
        assert response.status_code == 201

    create_link = client.post(
        f"{settings.API_V1_STR}/cash-flow/share-links/",
        headers=superuser_token_headers,
        json={
            "date_from": "2026-03-10",
            "date_to": "2026-03-31",
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        },
    )

    assert create_link.status_code == 201
    payload = create_link.json()
    assert payload["url"].startswith(f"{settings.FRONTEND_HOST}/cash-flow/share/")
    assert payload["date_from"] == "2026-03-10"
    assert payload["date_to"] == "2026-03-31"

    token = payload["url"].rsplit("/", maxsplit=1)[1]
    public_response = client.get(f"{settings.API_V1_STR}/cash-flow/shared/{token}")

    assert public_response.status_code == 200
    public_payload = public_response.json()
    assert public_payload["count"] == 2
    assert public_payload["credits_total"] == 50
    assert public_payload["debits_total"] == -25
    assert public_payload["balance"] == 25
    assert [record["description"] for record in public_payload["data"]] == [
        "Invoice in range",
        "Last day in range",
    ]
    assert public_payload["data"][0]["invoice_media_data"] == "data:image/png;base64,aGVsbG8="
    assert "condominio_id" not in public_payload["data"][0]
    assert "created_by_user_id" not in public_payload["data"][0]


def test_cash_flow_share_link_can_be_listed_and_revoked(
    client: TestClient,
    db: Session,
    superuser_token_headers: dict[str, str],
) -> None:
    condominio = _create_test_condominio(db)
    _assign_superuser_to_condominio(db, condominio)
    create_link = client.post(
        f"{settings.API_V1_STR}/cash-flow/share-links/",
        headers=superuser_token_headers,
        json={
            "date_from": "2026-03-10",
            "date_to": "2026-03-31",
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        },
    )
    assert create_link.status_code == 201

    links_response = client.get(
        f"{settings.API_V1_STR}/cash-flow/share-links/",
        headers=superuser_token_headers,
    )

    assert links_response.status_code == 200
    listed_link = links_response.json()["data"][0]
    assert listed_link["id"] == create_link.json()["id"]
    assert listed_link["url"] == create_link.json()["url"]
    assert listed_link["status"] == "active"

    revoke_response = client.delete(
        f"{settings.API_V1_STR}/cash-flow/share-links/{listed_link['id']}",
        headers=superuser_token_headers,
    )

    assert revoke_response.status_code == 200
    assert revoke_response.json()["status"] == "revoked"
    assert revoke_response.json()["url"] is None

    links_after_revoke = client.get(
        f"{settings.API_V1_STR}/cash-flow/share-links/",
        headers=superuser_token_headers,
    )
    assert links_after_revoke.status_code == 200
    assert links_after_revoke.json()["data"][0]["url"] is None

    hide_response = client.post(
        f"{settings.API_V1_STR}/cash-flow/share-links/{listed_link['id']}/hide",
        headers=superuser_token_headers,
    )
    assert hide_response.status_code == 200

    links_after_hide = client.get(
        f"{settings.API_V1_STR}/cash-flow/share-links/",
        headers=superuser_token_headers,
    )
    assert links_after_hide.status_code == 200
    assert links_after_hide.json()["count"] == 0

    token = listed_link["url"].rsplit("/", maxsplit=1)[1]
    assert client.get(f"{settings.API_V1_STR}/cash-flow/shared/{token}").status_code == 404
