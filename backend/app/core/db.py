from sqlalchemy import inspect, text
from sqlmodel import Session, create_engine, select

from app import crud
from app.core.config import settings
from app.models import Building, Condominio, Flat, User, UserCreate

engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))


def _ensure_flat_label_schema(session: Session) -> None:
    bind = session.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("flat"):
        return

    columns = {column["name"] for column in inspector.get_columns("flat")}
    if "label" not in columns:
        session.execute(text("ALTER TABLE flat ADD COLUMN label VARCHAR(20)"))
        session.commit()

    if not inspector.has_table("building"):
        return

    northwood = session.exec(select(Building).where(Building.nome == "Northwood")).first()
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
            occupied=False,
            reading_types=0,
        )
    )
    session.commit()


# make sure all SQLModel models are imported (app.models) before initializing DB
# otherwise, SQLModel might fail to initialize relationships properly
# for more details: https://github.com/fastapi/full-stack-fastapi-template/issues/28


def init_db(session: Session) -> None:
    # Tables should be created with Alembic migrations
    # But if you don't want to use migrations, create
    # the tables un-commenting the next lines
    # from sqlmodel import SQLModel

    # This works because the models are already imported and registered from app.models
    # SQLModel.metadata.create_all(engine)

    _ensure_flat_label_schema(session)

    user = session.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    if not user:
        # Get the first condominio to associate with the superuser
        condominio = session.exec(select(Condominio)).first()
        condominio_id = condominio.id if condominio else None

        user_in = UserCreate(
            email=settings.FIRST_SUPERUSER,
            password=settings.FIRST_SUPERUSER_PASSWORD,
            is_superuser=True,
            cargo=3,
            condominio_id=condominio_id,
        )
        user = crud.create_user(session=session, user_create=user_in)

    caretaker_user = session.exec(
        select(User).where(User.email == settings.CARETAKER_USER_EMAIL)
    ).first()
    if not caretaker_user:
        condominio = session.exec(select(Condominio)).first()
        condominio_id = condominio.id if condominio else None
        caretaker_in = UserCreate(
            email=settings.CARETAKER_USER_EMAIL,
            password=settings.CARETAKER_USER_PASSWORD,
            is_superuser=False,
            cargo=1,
            condominio_id=condominio_id,
        )
        crud.create_user(session=session, user_create=caretaker_in)
