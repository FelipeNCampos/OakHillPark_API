import logging
import csv
import uuid
from datetime import date
from pathlib import Path

from sqlmodel import Session, select

from app import crud
from app.core.db import engine, init_db
from app.models import (
    Building,
    Condominio,
    FireAlarmScheduleRecord,
    Flat,
    Funcionario,
    User,
    UserCreate,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DEFAULT_MANAGER_EMAIL = "oakhillporter@gmail.com"
DEFAULT_MANAGER_PASSWORD = "Oakhill@8610"
DEFAULT_MANAGER_NAME = "Luiz Fernandes"
OAK_HILL_PARK_CONDOMINIO_ID = uuid.UUID("cef60679-a1e5-4815-9a81-7621cb5a5fa5")
FIRE_ALARM_SEED_FILE = Path(__file__).resolve().parents[1] / "data" / "fire_alarm_schedule_seed.csv"


def ensure_northwood_flat_1a(session: Session, condominio: Condominio) -> None:
    northwood = session.exec(
        select(Building).where(
            Building.condominio_id == condominio.id,
            Building.nome == "Northwood",
        )
    ).first()
    if not northwood:
        return

    existing = session.exec(
        select(Flat).where(
            Flat.building_id == northwood.id,
            Flat.numero == 1,
            Flat.label == "1A",
        )
    ).first()
    if existing:
        return

    session.add(
        Flat(
            numero=1,
            label="1A",
            status=True,
            building_id=northwood.id,
        )
    )
    session.commit()
    logger.info("Ensured Northwood flat 1A exists")


def ensure_cleaner_building(session: Session, condominio: Condominio) -> None:
    existing_cleaner = session.exec(
        select(Building).where(
            Building.condominio_id == condominio.id,
            Building.nome == "Cleaner",
        )
    ).first()
    if existing_cleaner:
        return

    legacy_general = session.exec(
        select(Building).where(
            Building.condominio_id == condominio.id,
            Building.nome == "General",
        )
    ).first()
    if legacy_general:
        legacy_general.nome = "Cleaner"
        session.add(legacy_general)
        session.commit()
        logger.info("Renamed legacy General building to Cleaner")
        return

    session.add(
        Building(
            nome="Cleaner",
            condominio_id=condominio.id,
            reading_types=0,
        )
    )
    session.commit()
    logger.info("Ensured Cleaner building exists")


def ensure_caretaker_building(session: Session, condominio: Condominio) -> None:
    existing_caretaker = session.exec(
        select(Building).where(
            Building.condominio_id == condominio.id,
            Building.nome == "Caretaker",
        )
    ).first()
    if existing_caretaker:
        return

    session.add(
        Building(
            nome="Caretaker",
            condominio_id=condominio.id,
            reading_types=0,
        )
    )
    session.commit()
    logger.info("Ensured Caretaker building exists")


def init() -> None:
    with Session(engine) as session:
        init_db(session)


def ensure_default_manager_user(session: Session, condominio: Condominio) -> None:
    manager_user = session.exec(
        select(User).where(User.email == DEFAULT_MANAGER_EMAIL)
    ).first()
    if manager_user:
        manager_user.full_name = DEFAULT_MANAGER_NAME
        manager_user.cargo = 2
        manager_user.condominio_id = condominio.id
        manager_user.is_active = True
        session.add(manager_user)
        session.commit()
        logger.info("Ensured default manager user exists and is linked to Oak Hill Park")
        return

    manager_in = UserCreate(
        email=DEFAULT_MANAGER_EMAIL,
        password=DEFAULT_MANAGER_PASSWORD,
        full_name=DEFAULT_MANAGER_NAME,
        is_superuser=False,
        cargo=2,
        condominio_id=condominio.id,
    )
    crud.create_user(session=session, user_create=manager_in)
    session.commit()
    logger.info("Created default manager user for Oak Hill Park")


def create_initial_data() -> None:
    """Create initial data for the application."""
    with Session(engine) as session:
        # Check if condominio already exists
        condominio = session.get(Condominio, OAK_HILL_PARK_CONDOMINIO_ID)
        if not condominio:
            condominio = session.exec(
                select(Condominio).where(Condominio.nome == "Oak Hill Park")
            ).first()
        if condominio:
            cleaner = session.exec(
                select(Funcionario).where(
                    Funcionario.condominio_id == condominio.id,
                    Funcionario.cargo == 0,
                    Funcionario.nome == "Cleaner",
                )
            ).first()
            if cleaner:
                cleaner.status = True
                cleaner.is_default = True
                session.add(cleaner)

            caretaker = session.exec(
                select(Funcionario).where(
                    Funcionario.condominio_id == condominio.id,
                    Funcionario.cargo == 1,
                    Funcionario.nome == "Caretaker",
                )
            ).first()
            if caretaker:
                caretaker.status = True
                caretaker.is_default = True
                session.add(caretaker)

            session.commit()
            ensure_northwood_flat_1a(session, condominio)
            ensure_cleaner_building(session, condominio)
            ensure_caretaker_building(session, condominio)
            ensure_fire_alarm_schedule_seed(session)
            ensure_default_manager_user(session, condominio)
            logger.info("Initial data already exists, ensured default staff are active")
            return
        # Create condominio
        condominio = Condominio(
            id=OAK_HILL_PARK_CONDOMINIO_ID,
            nome="Oak Hill Park",
        )
        session.add(condominio)
        session.flush()
        # Buildings data: name -> number of flats
        buildings_data = {
            "Falcon": 12,
            "Martlett": 16,
            "Merlin": 11,
            "Northwood": 12,
            "Oak Lodge": 14,
            "Office": 0,  # Office doesn't have flats
            "Cleaner": 0,
            "Caretaker": 0,
        }

        buildings = {}
        # Create buildings
        for building_name, num_flats in buildings_data.items():
            # Set reading_types based on building
            # Office has only Normal (2)
            # Merlin, Northwood and Oak Lodge start with all reading types enabled (7)
            # Others have Low + Normal (1 + 2 = 3)
            if building_name == "Office":
                reading_types = 2
            elif building_name in {"Cleaner", "Caretaker"}:
                reading_types = 0
            elif building_name in {"Merlin", "Northwood", "Oak Lodge"}:
                reading_types = 7
            else:
                reading_types = 3

            building = Building(
                nome=building_name,
                condominio_id=condominio.id,
                reading_types=reading_types
            )
            session.add(building)
            session.flush()
            buildings[building_name] = building

            # Create flats for this building
            for flat_number in range(1, num_flats + 1):
                flat = Flat(
                    numero=flat_number,
                    status=True,
                    building_id=building.id
                )
                session.add(flat)

            if building_name == "Northwood":
                session.add(
                    Flat(
                        numero=1,
                        label="1A",
                        status=True,
                        building_id=building.id,
                    )
                )

        session.commit()
        logger.info(f"Created condominio: {condominio.nome}")
        logger.info(f"Created {len(buildings)} buildings with flats")

        # Create funcionarios
        funcionarios_data = [
            {
                "nome": "Cleaner",
                "cargo": 0,
                "status": True,
                "is_default": True,
                "mobile": 0,
                "email": None,
            },
            {
                "nome": "Caretaker",
                "cargo": 1,
                "status": True,
                "is_default": True,
                "mobile": 0,
                "email": None,
            },
        ]

        for func_data in funcionarios_data:
            funcionario = Funcionario(
                **func_data,
                condominio_id=condominio.id
            )
            session.add(funcionario)
            logger.info(f"Created funcionario: {func_data['nome']} (cargo={func_data['cargo']})")

        session.commit()
        logger.info("Initial data created successfully")
        ensure_fire_alarm_schedule_seed(session)
        ensure_default_manager_user(session, condominio)


def ensure_fire_alarm_schedule_seed(session: Session) -> None:
    existing = session.exec(select(FireAlarmScheduleRecord.id)).first()
    if existing:
        return
    if not FIRE_ALARM_SEED_FILE.exists():
        logger.warning("Fire alarm seed file not found: %s", FIRE_ALARM_SEED_FILE)
        return

    with FIRE_ALARM_SEED_FILE.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        payload = []
        seen_keys: set[tuple[str, str]] = set()
        for row in reader:
            normalized = {str(k).strip(): (v or "").strip() for k, v in row.items()}

            date_br = normalized.get("Date", "")
            building_label = normalized.get("Building", "")
            if not date_br or not building_label:
                continue

            key = (date_br, building_label)
            if key in seen_keys:
                continue
            seen_keys.add(key)

            payload.append(normalized)

    created = 0
    for item in payload:
        test_date_raw = item.get("Date", "")
        if not test_date_raw:
            continue
        try:
            day, month, year = str(test_date_raw).split("/")
            parsed_date = date(int(year), int(month), int(day))
        except ValueError:
            continue

        action_value = str(item.get("Further action required", "")).strip().lower()
        action_required = action_value in {"yes", "y", "true", "1"}
        raw_comment = str(item.get("Comments", "")).strip()
        comments = None if not raw_comment or raw_comment.lower() == "none" else raw_comment

        record = FireAlarmScheduleRecord(
            schedule_type="fire_alarm",
            test_date=parsed_date,
            time=str(item.get("Time", "")).strip(),
            building_label=str(item.get("Building", "")).strip(),
            call_point=str(item.get("Call Point", "")).strip() or None,
            location=str(item.get("Location", "")).strip() or None,
            action_required=action_required,
            comments=comments,
        )
        session.add(record)
        created += 1

    if created:
        session.commit()
        logger.info("Seeded %s fire alarm schedule records", created)


def main() -> None:
    logger.info("Creating initial data")
    init()
    logger.info("Creating base data for Oak Hill Park")
    create_initial_data()
    logger.info("Initial data setup complete")


if __name__ == "__main__":
    main()

