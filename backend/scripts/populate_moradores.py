"""
Script to populate the database with moradores (residents) data.
This script reads from contact list and creates moradores associated with their flats.
"""
import csv
import logging
import uuid
from pathlib import Path

from sqlmodel import Session, select

from app.core.db import engine
from app.models import Building, Flat, Morador

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


CSV_PATH = Path(__file__).resolve().parents[2] / "contact list.csv"


def _normalize_value(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if cleaned.upper() in {"NA", "N/A"}:
        return None
    return cleaned


def _normalize_building(name: str | None) -> str | None:
    cleaned = _normalize_value(name)
    if not cleaned:
        return None
    if cleaned == "Oak":
        return "Oak Lodge"
    return cleaned


def _parse_flat_number(raw: str | None) -> int | None:
    cleaned = _normalize_value(raw)
    if not cleaned:
        return None
    digits = "".join(char for char in cleaned if char.isdigit())
    if not digits:
        return None
    return int(digits)


def _header_key(value: str) -> str:
    return value.strip().lower().replace(" ", "_").replace("'", "")


def load_moradores_data(csv_path: Path) -> list[tuple[str, int, int, str, str, str | None, str | None]]:
    """Load moradores from the contact list CSV with cargo by role."""
    if not csv_path.exists():
        logger.error(f"Contact list not found at {csv_path}")
        return []

    moradores: list[tuple[str, int, int, str, str, str | None, str | None]] = []

    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle)
        header: list[str] | None = None

        for row in reader:
            if not row or all(not cell.strip() for cell in row):
                continue
            if header is None:
                if any(cell.strip().upper() == "BUILDING" for cell in row):
                    header = row
                continue

            header_map = {_header_key(value): idx for idx, value in enumerate(header)}

            def get_value(key: str) -> str | None:
                idx = header_map.get(key)
                if idx is None or idx >= len(row):
                    return None
                return row[idx]

            building = _normalize_building(get_value("building"))
            flat_number = _parse_flat_number(get_value("flat"))

            if not building or flat_number is None:
                logger.warning(f"Skipping row with invalid building/flat: {row}")
                continue

            def add_if_present(cargo: int, name_key: str, phone_key: str, email_key: str, landline: str | None = None) -> None:
                name = _normalize_value(get_value(name_key))
                if not name or name.upper() == "OWNER":
                    return
                mobile = _normalize_value(get_value(phone_key)) or ""
                email = _normalize_value(get_value(email_key))
                moradores.append((building, flat_number, cargo, name, mobile, landline, email))

            landline = _normalize_value(get_value("landline"))
            add_if_present(0, "owner_1", "mobile_1", "email_1", landline)
            add_if_present(1, "owner_2", "phone_2", "email_2")
            add_if_present(2, "tenant", "phone", "email")
            add_if_present(3, "agents_name", "agents_phone", "agents_email")

    return moradores


def populate_moradores() -> None:
    """Populate moradores from contact list data."""
    with Session(engine) as session:
        logger.info("Starting moradores population...")

        count = 0
        moradores_data = load_moradores_data(CSV_PATH)

        for building_name, flat_number, cargo, nome, mobile, landline, email in moradores_data:
            # Find building
            building = session.exec(
                select(Building).where(Building.nome == building_name)
            ).first()

            if not building:
                logger.warning(f"Building '{building_name}' not found, skipping morador {nome}")
                continue

            # Find flat
            flat = session.exec(
                select(Flat).where(
                    (Flat.building_id == building.id) & 
                    (Flat.numero == flat_number)
                )
            ).first()

            if not flat:
                logger.warning(f"Flat {flat_number} in {building_name} not found, skipping morador {nome}")
                continue

            # Check if morador already exists
            existing = session.exec(
                select(Morador).where(
                    (Morador.flat_id == flat.id)
                    & (Morador.nome == nome)
                    & (Morador.cargo == cargo)
                )
            ).first()

            if existing:
                logger.info(f"Morador {nome} already exists in {building_name} {flat_number}, skipping")
                continue

            # Create morador
            morador = Morador(
                id=uuid.uuid4(),
                flat_id=flat.id,
                cargo=cargo,
                nome=nome,
                mobile=mobile or "",
                landiline=landline or None,
                email=email or None,
            )
            session.add(morador)
            count += 1
            logger.info(f"Added morador: {nome} to {building_name} Flat {flat_number}")

        session.commit()
        logger.info(f"Successfully populated {count} moradores!")


if __name__ == "__main__":
    populate_moradores()
