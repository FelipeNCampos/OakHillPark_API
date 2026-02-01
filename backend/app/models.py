import uuid
from datetime import datetime, timezone

from pydantic import EmailStr
from sqlalchemy import DateTime
from sqlmodel import Field, Relationship, SQLModel


def get_datetime_utc() -> datetime:
    return datetime.now(timezone.utc)


# Shared properties
class UserBase(SQLModel):
    email: EmailStr = Field(unique=True, index=True, max_length=255)
    is_active: bool = True
    is_superuser: bool = False
    full_name: str | None = Field(default=None, max_length=255)
    cargo: int = Field(default=0, ge=0, le=3)


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)
    cargo: int = Field(default=0, ge=0, le=3)


# Properties to receive via API on update, all are optional
class UserUpdate(UserBase):
    email: EmailStr | None = Field(default=None, max_length=255)  # type: ignore
    password: str | None = Field(default=None, min_length=8, max_length=128)
    cargo: int | None = Field(default=None, ge=0, le=3)


class UserUpdateMe(SQLModel):
    full_name: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)


class UpdatePassword(SQLModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


# Database model, database table inferred from class name
class User(UserBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    hashed_password: str
    created_at: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )


# Properties to return via API, id is always required
class UserPublic(UserBase):
    id: uuid.UUID
    created_at: datetime | None = None


class UsersPublic(SQLModel):
    data: list[UserPublic]
    count: int


# Condo models
class Condominio(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    nome: str = Field(default="OakHillPark", max_length=255)
    buildings: list["Building"] = Relationship(
        back_populates="condominio", cascade_delete=True
    )
    funcionarios: list["Funcionario"] = Relationship(
        back_populates="condominio", cascade_delete=True
    )


class Building(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    nome: str = Field(default="OakHillPark", max_length=255)
    condominio_id: uuid.UUID = Field(
        foreign_key="condominio.id", nullable=False, ondelete="CASCADE"
    )
    condominio: Condominio | None = Relationship(back_populates="buildings")
    flats: list["Flat"] = Relationship(back_populates="building", cascade_delete=True)
    acessos: list["Acess"] = Relationship(
        back_populates="building", cascade_delete=True
    )
    readings: list["Readings"] = Relationship(
        back_populates="building", cascade_delete=True
    )


class Flat(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    numero: int = Field(default=0)
    status: bool = Field(default=False)
    building_id: uuid.UUID = Field(
        foreign_key="building.id", nullable=False, ondelete="CASCADE"
    )
    building: Building | None = Relationship(back_populates="flats")
    moradores: list["Morador"] = Relationship(
        back_populates="flat", cascade_delete=True
    )


class Morador(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    cargo: int = Field(default=0)
    nome: str = Field(default="", max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)
    mobile: int = Field(default=0)
    car1: str | None = Field(default=None, max_length=50)
    car2: str | None = Field(default=None, max_length=50)
    car3: str | None = Field(default=None, max_length=50)
    flat_id: uuid.UUID = Field(
        foreign_key="flat.id", nullable=False, ondelete="CASCADE"
    )
    flat: Flat | None = Relationship(back_populates="moradores")


class Funcionario(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    status: bool = Field(default=True)
    nome: str = Field(default="", max_length=255)
    mobile: int = Field(default=0)
    cargo: int = Field(default=0)
    email: EmailStr | None = Field(default=None, max_length=255)
    condominio_id: uuid.UUID = Field(
        foreign_key="condominio.id", nullable=False, ondelete="CASCADE"
    )
    condominio: Condominio | None = Relationship(back_populates="funcionarios")
    acessos: list["Acess"] = Relationship(
        back_populates="funcionario", cascade_delete=True
    )


class Acess(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    status: bool = Field(default=True)
    data: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    operacao: int = Field(default=0)
    building_id: uuid.UUID = Field(
        foreign_key="building.id", nullable=False, ondelete="CASCADE"
    )
    building: Building | None = Relationship(back_populates="acessos")
    funcionario_id: uuid.UUID = Field(
        foreign_key="funcionario.id", nullable=False, ondelete="CASCADE"
    )
    funcionario: Funcionario | None = Relationship(back_populates="acessos")


class Readings(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    data: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    tipo: int = Field(default=0)
    valor: int
    building_id: uuid.UUID = Field(
        foreign_key="building.id", nullable=False, ondelete="CASCADE"
    )
    building: Building | None = Relationship(back_populates="readings")


# Generic message
class Message(SQLModel):
    message: str


# JSON payload containing access token
class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token
class TokenPayload(SQLModel):
    sub: str | None = None


class NewPassword(SQLModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class CondominioBase(SQLModel):
    nome: str = Field(default="OakHillPark", max_length=255)


class CondominioCreate(CondominioBase):
    pass


class CondominioUpdate(SQLModel):
    nome: str | None = Field(default=None, max_length=255)


class CondominioPublic(CondominioBase):
    id: uuid.UUID


class CondominiosPublic(SQLModel):
    data: list[CondominioPublic]
    count: int


class BuildingBase(SQLModel):
    nome: str = Field(default="OakHillPark", max_length=255)
    condominio_id: uuid.UUID


class BuildingCreate(BuildingBase):
    pass


class BuildingUpdate(SQLModel):
    nome: str | None = Field(default=None, max_length=255)
    condominio_id: uuid.UUID | None = None


class BuildingPublic(BuildingBase):
    id: uuid.UUID


class BuildingsPublic(SQLModel):
    data: list[BuildingPublic]
    count: int


class FlatBase(SQLModel):
    numero: int = Field(default=0)
    status: bool = Field(default=False)
    building_id: uuid.UUID


class FlatCreate(FlatBase):
    pass


class FlatUpdate(SQLModel):
    numero: int | None = None
    status: bool | None = None
    building_id: uuid.UUID | None = None


class FlatPublic(FlatBase):
    id: uuid.UUID


class FlatsPublic(SQLModel):
    data: list[FlatPublic]
    count: int


class MoradorBase(SQLModel):
    cargo: int = Field(default=0)
    nome: str = Field(default="", max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)
    mobile: int = Field(default=0)
    car1: str | None = Field(default=None, max_length=50)
    car2: str | None = Field(default=None, max_length=50)
    car3: str | None = Field(default=None, max_length=50)
    flat_id: uuid.UUID


class MoradorCreate(MoradorBase):
    pass


class MoradorUpdate(SQLModel):
    cargo: int | None = None
    nome: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)
    mobile: int | None = None
    car1: str | None = Field(default=None, max_length=50)
    car2: str | None = Field(default=None, max_length=50)
    car3: str | None = Field(default=None, max_length=50)
    flat_id: uuid.UUID | None = None


class MoradorPublic(MoradorBase):
    id: uuid.UUID


class MoradoresPublic(SQLModel):
    data: list[MoradorPublic]
    count: int


class FuncionarioBase(SQLModel):
    status: bool = Field(default=True)
    nome: str = Field(default="", max_length=255)
    mobile: int = Field(default=0)
    cargo: int = Field(default=0)
    email: EmailStr | None = Field(default=None, max_length=255)
    condominio_id: uuid.UUID


class FuncionarioCreate(FuncionarioBase):
    pass


class FuncionarioUpdate(SQLModel):
    status: bool | None = None
    nome: str | None = Field(default=None, max_length=255)
    mobile: int | None = None
    cargo: int | None = None
    email: EmailStr | None = Field(default=None, max_length=255)
    condominio_id: uuid.UUID | None = None


class FuncionarioPublic(FuncionarioBase):
    id: uuid.UUID


class FuncionariosPublic(SQLModel):
    data: list[FuncionarioPublic]
    count: int


class AcessBase(SQLModel):
    status: bool = Field(default=True)
    data: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    operacao: int = Field(default=0)
    building_id: uuid.UUID


class AcessCreate(AcessBase):
    pass


class AcessUpdate(SQLModel):
    status: bool | None = None
    data: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    operacao: int | None = None
    building_id: uuid.UUID | None = None


class AcessPublic(AcessBase):
    id: uuid.UUID


class AcessesPublic(SQLModel):
    data: list[AcessPublic]
    count: int


class ReadingsBase(SQLModel):
    data: datetime | None = Field(
        default_factory=get_datetime_utc,
        sa_type=DateTime(timezone=True),  # type: ignore
    )
    tipo: int = Field(default=0)
    valor: int
    building_id: uuid.UUID


class ReadingsCreate(ReadingsBase):
    pass


class ReadingsUpdate(SQLModel):
    data: datetime | None = Field(default=None, sa_type=DateTime(timezone=True))
    tipo: int | None = None
    valor: int | None = None
    building_id: uuid.UUID | None = None


class ReadingsPublic(ReadingsBase):
    id: uuid.UUID


class ReadingsPublicList(SQLModel):
    data: list[ReadingsPublic]
    count: int
