from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlmodel import Session, delete

from app.core.config import settings
from app.core.db import engine, init_db
from app.main import app
from app.models import Acess, Building, Condominio, Flat, Funcionario, Morador, Readings, User
from tests.utils.user import authentication_token_from_email
from tests.utils.utils import get_superuser_token_headers


@pytest.fixture(scope="session", autouse=True)
def db() -> Generator[Session, None, None]:
    """Database session for all tests with cleanup at the end."""
    with Session(engine) as session:
        init_db(session)
        yield session
        
        # Clean up only test data at the end of test session
        # Delete test buildings (those with "Test" in the name)
        session.exec(delete(Acess).where(Acess.id.in_(
            session.query(Acess.id).join(Building).filter(Building.nome.like("%Test%"))
        )))
        session.exec(delete(Readings).where(Readings.building_id.in_(
            session.query(Building.id).filter(Building.nome.like("%Test%"))
        )))
        session.exec(delete(Morador))  # All moradores are test data
        session.exec(delete(Flat).where(Flat.building_id.in_(
            session.query(Building.id).filter(Building.nome.like("%Test%"))
        )))
        session.exec(delete(Building).where(Building.nome.like("%Test%")))
        session.exec(delete(Condominio).where(Condominio.nome.like("%Test%")))
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
