"""
Export moradores seed data from the contact list CSV into a versioned JSON file.
"""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = PROJECT_ROOT / "backend" / "data" / "moradores_seed.json"


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


def _resolve_csv_path() -> Path:
    exact = PROJECT_ROOT / "contact list.csv"
    if exact.exists():
        return exact

    for pattern in ("*Contact*List*.csv", "*contact*list*.csv"):
        matches = sorted(PROJECT_ROOT.glob(pattern))
        if matches:
            return matches[0]

    raise FileNotFoundError(
        "No contact list CSV found at project root. "
        "Expected 'contact list.csv' or '*Contact*List*.csv'."
    )


def _role_entry(
    *,
    role: str,
    cargo: int,
    name: str | None,
    mobile: str | None,
    email: str | None,
) -> dict[str, str | int | None]:
    return {
        "role": role,
        "cargo": cargo,
        "name": _normalize_value(name),
        "mobile": _normalize_value(mobile),
        "email": _normalize_value(email),
    }


def build_seed_from_csv(csv_path: Path) -> dict[str, object]:
    flats: list[dict[str, object]] = []

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
                continue

            flat_entry: dict[str, object] = {
                "building": building,
                "flat_number": flat_number,
                "status": _normalize_value(get_value("status")),
                "status_2": _normalize_value(get_value("status_2")),
                "car_permits": [
                    _normalize_value(get_value("car_1_permit")),
                    _normalize_value(get_value("car_2_permit")),
                    _normalize_value(get_value("car_3_permit")),
                ],
                "people": [
                    _role_entry(
                        role="owner_1",
                        cargo=0,
                        name=get_value("owner_1"),
                        mobile=get_value("mobile_1"),
                        email=get_value("email_1"),
                    ),
                    _role_entry(
                        role="owner_2",
                        cargo=1,
                        name=get_value("owner_2"),
                        mobile=get_value("phone_2"),
                        email=get_value("email_2"),
                    ),
                    _role_entry(
                        role="tenant",
                        cargo=2,
                        name=get_value("tenant"),
                        mobile=get_value("phone"),
                        email=get_value("email"),
                    ),
                    _role_entry(
                        role="agent",
                        cargo=3,
                        name=get_value("agents_name"),
                        mobile=get_value("agents_phone"),
                        email=get_value("agents_email"),
                    ),
                ],
            }
            flats.append(flat_entry)

    return {
        "source_file": csv_path.name,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "flats": flats,
    }


def export_seed(output_path: Path = DEFAULT_OUTPUT) -> Path:
    csv_path = _resolve_csv_path()
    seed = build_seed_from_csv(csv_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(seed, ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )
    return output_path


def main() -> None:
    output = export_seed()
    print(f"Moradores seed exported to: {output}")


if __name__ == "__main__":
    main()
