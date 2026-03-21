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


def _ensure_morador_sms_schema(session: Session) -> None:
    bind = session.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("morador"):
        return

    columns = {column["name"] for column in inspector.get_columns("morador")}
    if "receives_flat_reading_sms" not in columns:
        session.execute(
            text(
                "ALTER TABLE morador "
                "ADD COLUMN receives_flat_reading_sms BOOLEAN NOT NULL DEFAULT FALSE"
            )
        )
        session.commit()
        session.execute(
            text(
                "UPDATE morador "
                "SET receives_flat_reading_sms = TRUE "
                "WHERE cargo = 0"
            )
        )
        session.commit()


def ensure_notification_history_schema(session: Session) -> None:
    bind = session.get_bind()
    inspector = inspect(bind)
    if not inspector.has_table("notificationhistory"):
        session.execute(
            text(
                """
                CREATE TABLE notificationhistory (
                    id UUID PRIMARY KEY,
                    created_at TIMESTAMPTZ NOT NULL,
                    updated_at TIMESTAMPTZ NOT NULL,
                    notification_type VARCHAR(20) NOT NULL,
                    recipient_to VARCHAR(255) NOT NULL,
                    message VARCHAR(2000) NOT NULL,
                    delivery_status VARCHAR(50) NOT NULL,
                    success BOOLEAN NOT NULL,
                    provider_message_id VARCHAR(255),
                    error_message VARCHAR(1000)
                )
                """
            )
        )
        session.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_notificationhistory_created_at "
                "ON notificationhistory (created_at)"
            )
        )
        session.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_notificationhistory_notification_type "
                "ON notificationhistory (notification_type)"
            )
        )
        session.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_notificationhistory_recipient_to "
                "ON notificationhistory (recipient_to)"
            )
        )
        session.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_notificationhistory_delivery_status "
                "ON notificationhistory (delivery_status)"
            )
        )
        session.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_notificationhistory_success "
                "ON notificationhistory (success)"
            )
        )
        session.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_notificationhistory_provider_message_id "
                "ON notificationhistory (provider_message_id)"
            )
        )
        session.commit()


def ensure_contractor_visit_schema(session: Session) -> None:
    bind = session.get_bind()
    inspector = inspect(bind)
    if inspector.has_table("contractorvisit"):
        return

    session.execute(
        text(
            """
            CREATE TABLE contractorvisit (
                id UUID PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                company VARCHAR(255) NOT NULL,
                car_reg VARCHAR(50) NOT NULL,
                block VARCHAR(100) NOT NULL,
                mobile VARCHAR(30) NOT NULL,
                in_at TIMESTAMPTZ NOT NULL,
                out_at TIMESTAMPTZ,
                condominio_id UUID NOT NULL REFERENCES condominio (id) ON DELETE CASCADE
            )
            """
        )
    )
    session.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_contractorvisit_condominio_id "
            "ON contractorvisit (condominio_id)"
        )
    )
    session.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_contractorvisit_in_at "
            "ON contractorvisit (in_at)"
        )
    )
    session.execute(
        text(
            "CREATE INDEX IF NOT EXISTS ix_contractorvisit_out_at "
            "ON contractorvisit (out_at)"
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
    _ensure_morador_sms_schema(session)
    ensure_notification_history_schema(session)
    ensure_contractor_visit_schema(session)

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

    test_user = session.exec(
        select(User).where(User.email == settings.EMAIL_TEST_USER)
    ).first()
    if not test_user:
        condominio = session.exec(select(Condominio)).first()
        condominio_id = condominio.id if condominio else None
        test_user_in = UserCreate(
            email=settings.EMAIL_TEST_USER,
            password="changethis",
            is_superuser=False,
            cargo=1,
            condominio_id=condominio_id,
        )
        crud.create_user(session=session, user_create=test_user_in)
    elif (not test_user.is_superuser) and test_user.cargo < 1:
        test_user.cargo = 1
        test_user.is_active = True
        session.add(test_user)
        session.commit()
