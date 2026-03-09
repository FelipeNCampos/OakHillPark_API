from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, delete, select

from app.core.config import settings
from app.core.db import engine, init_db
from app.main import app
from app.models import (
    Acess,
    Building,
    Condominio,
    Flat,
    Funcionario,
    Morador,
    Readings,
    Task,
    TaskMessage,
    User,
)
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import get_superuser_token_headers


@pytest.fixture(scope="session", autouse=True)
def db() -> Generator[Session, None, None]:
    """Database session for all tests with cleanup at the end."""
    with Session(engine) as session:
        init_db(session)
        yield session
        
        # Clean up only test data at the end of test session
        test_condominio_ids = session.exec(
            select(Condominio.id).where(Condominio.nome.like("%Test%"))
        ).all()

        if test_condominio_ids:
            users_linked_to_test_condos = session.exec(
                select(User).where(User.condominio_id.in_(test_condominio_ids))
            ).all()
            for user in users_linked_to_test_condos:
                user.condominio_id = None
                session.add(user)
            session.commit()

        test_building_ids = select(Building.id).where(Building.nome.like("%Test%"))
        test_acess_ids = (
            select(Acess.id)
            .join(Building, Acess.building_id == Building.id)
            .where(Building.nome.like("%Test%"))
        )

        # Delete test buildings (those with "Test" in the name)
        session.exec(delete(Acess).where(Acess.id.in_(test_acess_ids)))
        session.exec(delete(Readings).where(Readings.building_id.in_(test_building_ids)))
        session.exec(delete(Morador))  # All moradores are test data
        session.exec(delete(Flat).where(Flat.building_id.in_(test_building_ids)))
        session.exec(delete(Building).where(Building.nome.like("%Test%")))
        session.exec(delete(Condominio).where(Condominio.nome.like("%Test%")))
        session.exec(delete(TaskMessage))
        session.exec(delete(Task))
        # Keep initial funcionarios but delete test ones if any
        session.exec(delete(Funcionario).where(
            ~Funcionario.nome.in_(["Cleaner", "Caretaker"])
        ))
        # Keep superuser and test user, delete others
        session.exec(delete(User).where(
            ~User.email.in_([settings.FIRST_SUPERUSER, settings.EMAIL_TEST_USER])
        ))
        session.commit()


@pytest.fixture(scope="module")
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def superuser_token_headers(client: TestClient) -> dict[str, str]:
    return get_superuser_token_headers(client)


@pytest.fixture(scope="module")
def normal_user_token_headers(client: TestClient, db: Session) -> dict[str, str]:
    return authentication_token_from_email(
        client=client, email=settings.EMAIL_TEST_USER, db=db
    )
