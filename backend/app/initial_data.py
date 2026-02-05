import logging

from sqlmodel import Session, select

from app.core.db import engine, init_db
from app.models import Acess, Building, Condominio, Flat, Funcionario

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def init() -> None:
    with Session(engine) as session:
        init_db(session)


def create_initial_data() -> None:
    """Create initial data for the application."""
    with Session(engine) as session:
        # Check if condominio already exists
        condominio = session.exec(
            select(Condominio).where(Condominio.nome == "Oak Hill Park")
        ).first()
        if condominio:
            logger.info("Initial data already exists, skipping creation")
            return
        # Create condominio
        condominio = Condominio(nome="Oak Hill Park")
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
        }

        buildings = {}
        # Create buildings
        for building_name, num_flats in buildings_data.items():
            # Set reading_types based on building
            # Office has only Normal (2), others have Low + Normal (1 + 2 = 3)
            reading_types = 2 if building_name == "Office" else 3

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
                "is_default": False,
                "mobile": 0,
                "email": None,
            },
        ]

        funcionarios = {}
        for func_data in funcionarios_data:
            funcionario = Funcionario(
                **func_data,
                condominio_id=condominio.id
            )
            session.add(funcionario)
            session.flush()
            funcionarios[func_data["nome"]] = funcionario
            logger.info(f"Created funcionario: {func_data['nome']} (cargo={func_data['cargo']})")

        session.commit()

        # Create Access records linking funcionarios to buildings
        # Each funcionario has access to all buildings
        for func_name, funcionario in funcionarios.items():
            for _, building in buildings.items():
                acess = Acess(
                    status=True,
                    operacao=0,
                    building_id=building.id,
                    funcionario_id=funcionario.id
                )
                session.add(acess)
            logger.info(f"Created {len(buildings)} access records for {func_name}")

        session.commit()
        logger.info("Initial data created successfully")


def main() -> None:
    logger.info("Creating initial data")
    init()
    logger.info("Creating base data for Oak Hill Park")
    create_initial_data()
    logger.info("Initial data setup complete")


if __name__ == "__main__":
    main()

