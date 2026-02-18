"""
Populate moradores and flat car permits from versioned JSON seed data.
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from pathlib import Path
from typing import Any

from sqlmodel import Session, select

from app.core.db import engine
from app.models import Building, Flat, Morador

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SEED_PATH = PROJECT_ROOT / "backend" / "data" / "moradores_seed.json"


def _normalize_value(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if cleaned.upper() in {"NA", "N/A"}:
        return None
    return cleaned


def _truncate(value: str | None, max_len: int) -> str | None:
    if value is None:
        return None
    return value[:max_len]


def _normalize_mobile(value: str | None) -> str:
    cleaned = _normalize_value(value)
    if not cleaned:
        return ""
    for separator in ("/", ";"):
        if separator in cleaned:
            cleaned = cleaned.split(separator)[0].strip()
    return _truncate(cleaned, 20) or ""


def _normalize_email(value: str | None) -> str | None:
    cleaned = _normalize_value(value)
    if not cleaned:
        return None
    for separator in ("/", ";"):
        if separator in cleaned:
            cleaned = cleaned.split(separator)[0].strip()
    if "@" not in cleaned:
        return None
    return _truncate(cleaned, 255)


def _resolve_seed_path() -> Path:
    env_path = os.getenv("MORADORES_SEED_PATH")
    if env_path:
        candidate = Path(env_path)
        if candidate.exists():
            return candidate
        raise FileNotFoundError(f"MORADORES_SEED_PATH not found: {candidate}")

    if DEFAULT_SEED_PATH.exists():
        return DEFAULT_SEED_PATH

    raise FileNotFoundError(f"Moradores seed JSON not found at {DEFAULT_SEED_PATH}")


def load_seed_data(seed_path: Path) -> dict[str, Any]:
    raw = seed_path.read_text(encoding="utf-8")
    data = json.loads(raw)
    flats = data.get("flats")
    if not isinstance(flats, list):
        raise ValueError("Invalid moradores seed: 'flats' must be a list")
    return data


def populate_moradores() -> None:
    seed_path = _resolve_seed_path()
    seed_data = load_seed_data(seed_path)
    logger.info(f"Starting moradores population from {seed_path}")

    created = 0
    updated = 0

    with Session(engine) as session:
        for flat_entry in seed_data["flats"]:
            building_name = _normalize_value(flat_entry.get("building"))
            flat_number = flat_entry.get("flat_number")
            if not building_name or not isinstance(flat_number, int):
                logger.warning(f"Skipping invalid seed flat entry: {flat_entry}")
                continue

            building = session.exec(
                select(Building).where(Building.nome == building_name)
            ).first()
            if not building:
                logger.warning(f"Building '{building_name}' not found, skipping")
                continue

            flat = session.exec(
                select(Flat).where(
                    (Flat.building_id == building.id) & (Flat.numero == flat_number)
                )
            ).first()
            if not flat:
                logger.warning(
                    f"Flat {flat_number} in {building_name} not found, skipping"
                )
                continue

            car_permits = flat_entry.get("car_permits", [])
            if isinstance(car_permits, list):
                flat.car1 = _truncate(
                    _normalize_value(car_permits[0] if len(car_permits) > 0 else None),
                    50,
                )
                flat.car2 = _truncate(
                    _normalize_value(car_permits[1] if len(car_permits) > 1 else None),
                    50,
                )
                flat.car3 = _truncate(
                    _normalize_value(car_permits[2] if len(car_permits) > 2 else None),
                    50,
                )
                session.add(flat)

            people = flat_entry.get("people", [])
            if not isinstance(people, list):
                continue

            for person in people:
                if not isinstance(person, dict):
                    continue
                name = _normalize_value(person.get("name"))
                cargo = person.get("cargo")
                if name is None or not isinstance(cargo, int):
                    continue

                mobile = _normalize_mobile(person.get("mobile"))
                email = _normalize_email(person.get("email"))

                existing = session.exec(
                    select(Morador).where(
                        (Morador.flat_id == flat.id)
                        & (Morador.nome == name)
                        & (Morador.cargo == cargo)
                    )
                ).first()

                if existing:
                    changed = False
                    if existing.mobile != mobile:
                        existing.mobile = mobile
                        changed = True
                    if existing.email != email:
                        existing.email = email
                        changed = True
                    if changed:
                        session.add(existing)
                        updated += 1
                    continue

                morador = Morador(
                    id=uuid.uuid4(),
                    flat_id=flat.id,
                    cargo=cargo,
                    nome=name,
                    mobile=mobile,
                    email=email,
                )
                session.add(morador)
                created += 1

        session.commit()

    logger.info(f"Moradores population done. Created={created}, Updated={updated}")


if __name__ == "__main__":
    populate_moradores()
