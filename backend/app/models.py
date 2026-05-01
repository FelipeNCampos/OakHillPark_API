import uuid
from datetime import date, datetime, timezone

from pydantic import EmailStr
from sqlalchemy import DateTime as SQLAlchemyDateTime
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
    condominio_id: uuid.UUID | None = Field(default=None, foreign_key="condominio.id")


# Properties to receive via API on creation
class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)


class UserRegister(SQLModel):
    email: EmailStr = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)
    cargo: int = Field(default=0, ge=0, le=3)
    condominio_id: uuid.UUID | None = Field(default=None)


# Properties to receive via API on update, all are optional
class UserUpdate(UserBase):
    email: EmailStr | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    cargo: int | None = Field(default=None, ge=0, le=3)
    condominio_id: uuid.UUID | None = Field(default=None)


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
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    condominio_id: uuid.UUID | None = Field(default=None, foreign_key="condominio.id")


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
    tasks: list["Task"] = Relationship(back_populates="condominio", cascade_delete=True)
    reminders: list["Reminder"] = Relationship(
        back_populates="condominio", cascade_delete=True
    )
    contractor_visits: list["ContractorVisit"] = Relationship(
        back_populates="condominio", cascade_delete=True
    )
    contractor_history_categories: list["ContractorHistoryCategory"] = Relationship(
        back_populates="condominio", cascade_delete=True
    )
    contractor_histories: list["ContractorHistory"] = Relationship(
        back_populates="condominio", cascade_delete=True
    )
    cash_flow_records: list["CashFlowRecord"] = Relationship(
        back_populates="condominio", cascade_delete=True
    )


class Building(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    nome: str = Field(default="OakHillPark", max_length=255)
    condominio_id: uuid.UUID = Field(
        foreign_key="condominio.id", nullable=False, ondelete="CASCADE"
    )
    # Reading types this building has (bitmask: 1=Low, 2=Normal, 4=Gas)
    reading_types: int = Field(default=3)  # Default: Low (1) + Normal (2)
    # Serial numbers for meters
    electricity_sn: str | None = Field(default=None, max_length=255)
    gas_sn: str | None = Field(default=None, max_length=255)
    condominio: Condominio | None = Relationship(back_populates="buildings")
    flats: list["Flat"] = Relationship(back_populates="building", cascade_delete=True)
    acessos: list["Acess"] = Relationship(
        back_populates="building", cascade_delete=True
    )
    readings: list["Readings"] = Relationship(
        back_populates="building", cascade_delete=True
    )
    bins: list["BinMissCollection"] = Relationship(
        back_populates="building", cascade_delete=True
    )
    bin_sessions: list["BinSession"] = Relationship(
        back_populates="building", cascade_delete=True
    )


class FlatBase(SQLModel):
    numero: int = Field(default=0, ge=0, le=999)
    label: str | None = Field(default=None, max_length=20)
    status: bool = Field(default=False)
    building_id: uuid.UUID
    reading_types: int = Field(default=0, ge=0, le=7)  # Bitmask: 1=Low, 2=Normal, 4=Gas
    car1: str | None = Field(default=None, max_length=50)
    car2: str | None = Field(default=None, max_length=50)
    car3: str | None = Field(default=None, max_length=50)

class Flat(FlatBase, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    occupied: bool = Field(default=False)
    status: bool = Field(default=False) # 0 owner | 1 rented
    reading_types: int = Field(default=0)  # Reading types this flat has (bitmask: 1=Low, 2=Normal, 4=Gas)
    building_id: uuid.UUID = Field(
        foreign_key="building.id", nullable=False, ondelete="CASCADE"
    )
    building: Building | None = Relationship(back_populates="flats")
    moradores: list["Morador"] = Relationship(
        back_populates="flat", cascade_delete=True
    )
    readings: list["FlatReading"] = Relationship(
        back_populates="flat", cascade_delete=True
    )
    car1: str | None = Field(default=None, max_length=50)
    car2: str | None = Field(default=None, max_length=50)
    car3: str | None = Field(default=None, max_length=50)


class Morador(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    cargo: int = Field(default=0, ge=0, le=4)  # 0 owner 1 | 1 owner 2 | 2 tenant | 3 agent
    nome: str = Field(default="", max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)
    mobile: str = Field(default="", max_length=20)
    receives_flat_reading_sms: bool = Field(default=False)
    receives_twilio_sms: bool = Field(default=False)
    flat_id: uuid.UUID = Field(
        foreign_key="flat.id", nullable=False, ondelete="CASCADE"
    )
    flat: Flat | None = Relationship(back_populates="moradores")


class Funcionario(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    status: bool = Field(default=True)
    is_default: bool = Field(default=False)
    nome: str = Field(default="", max_length=255)
    mobile: int = Field(default=0)
    cargo: int = Field(default=0, ge=0, le=2) # 0 cleaner | 1 caretaker | 2 contractor
    email: EmailStr | None = Field(default=None, max_length=255)
    condominio_id: uuid.UUID = Field(
        foreign_key="condominio.id", nullable=False, ondelete="CASCADE"
    )
    condominio: Condominio | None = Relationship(back_populates="funcionarios")
    acessos: list["Acess"] = Relationship(
        back_populates="funcionario", cascade_delete=True
    )
    bin_sessions: list["BinSession"] = Relationship(
        back_populates="funcionario", cascade_delete=True
    )
    work_time_sessions: list["WorkTimeSession"] = Relationship(
        back_populates="funcionario", cascade_delete=True
    )


class Acess(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    status: bool = Field(default=True)
    data: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
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


class BinMissCollection(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    data: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    miss_collection: bool = Field(default=True)
    collection_type: str = Field(default="general", max_length=20)
    collection_status: str = Field(default="miss", max_length=20)
    building_id: uuid.UUID = Field(
        foreign_key="building.id", nullable=False, ondelete="CASCADE"
    )
    building: Building | None = Relationship(back_populates="bins")


class BinSession(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    status: bool = Field(default=True)
    data: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    operacao: int = Field(default=0)
    building_id: uuid.UUID = Field(
        foreign_key="building.id", nullable=False, ondelete="CASCADE"
    )
    funcionario_id: uuid.UUID = Field(
        foreign_key="funcionario.id", nullable=False, ondelete="CASCADE"
    )
    building: Building | None = Relationship(back_populates="bin_sessions")
    funcionario: Funcionario | None = Relationship(back_populates="bin_sessions")


class WorkTimeSession(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    status: bool = Field(default=True)
    data: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    operacao: int = Field(default=0)
    funcionario_id: uuid.UUID = Field(
        foreign_key="funcionario.id", nullable=False, ondelete="CASCADE"
    )
    funcionario: Funcionario | None = Relationship(back_populates="work_time_sessions")


class CaretakerMonthlyGoal(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    month_start: date = Field(index=True)
    target_hours: float = Field(default=0, ge=0)
    condominio_id: uuid.UUID = Field(
        foreign_key="condominio.id", nullable=False, ondelete="CASCADE", index=True
    )
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )


class ContractorVisit(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(default="", max_length=255)
    company: str = Field(default="", max_length=255)
    car_reg: str = Field(default="", max_length=50)
    block: str = Field(default="", max_length=100)
    job_description: str = Field(default="", max_length=255)
    mobile: str = Field(default="", max_length=30)
    extra_media_name: str | None = Field(default=None, max_length=255)
    extra_media_data: str | None = Field(default=None)
    extra_media_2_name: str | None = Field(default=None, max_length=255)
    extra_media_2_data: str | None = Field(default=None)
    extra_media_3_name: str | None = Field(default=None, max_length=255)
    extra_media_3_data: str | None = Field(default=None)
    extra_media_4_name: str | None = Field(default=None, max_length=255)
    extra_media_4_data: str | None = Field(default=None)
    in_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    out_at: datetime | None = Field(
        default=None,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    condominio_id: uuid.UUID = Field(
        foreign_key="condominio.id", nullable=False, ondelete="CASCADE"
    )
    condominio: Condominio | None = Relationship(back_populates="contractor_visits")
    histories: list["ContractorHistory"] = Relationship(
        back_populates="contractor_visit", cascade_delete=True
    )


class ContractorHistoryCategory(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(default="", max_length=100, index=True)
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    condominio_id: uuid.UUID = Field(
        foreign_key="condominio.id", nullable=False, ondelete="CASCADE"
    )
    condominio: Condominio | None = Relationship(
        back_populates="contractor_history_categories"
    )
    histories: list["ContractorHistory"] = Relationship(
        back_populates="category", cascade_delete=True
    )


class ContractorHistory(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_new_visit: bool = Field(default=False)
    next_enabled: bool = Field(default=False)
    next_interval_unit: str | None = Field(default=None, max_length=10)
    next_interval_value: int | None = Field(default=None, ge=1)
    next_job_at: datetime | None = Field(
        default=None,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    next_notify_at: datetime | None = Field(
        default=None,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    next_notification_sent_at: datetime | None = Field(
        default=None,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    condominio_id: uuid.UUID = Field(
        foreign_key="condominio.id", nullable=False, ondelete="CASCADE"
    )
    contractor_visit_id: uuid.UUID = Field(
        foreign_key="contractorvisit.id", nullable=False, ondelete="CASCADE"
    )
    category_id: uuid.UUID = Field(
        foreign_key="contractorhistorycategory.id", nullable=False, ondelete="CASCADE"
    )
    condominio: Condominio | None = Relationship(back_populates="contractor_histories")
    contractor_visit: ContractorVisit | None = Relationship(back_populates="histories")
    category: ContractorHistoryCategory | None = Relationship(back_populates="histories")


class Task(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    code: str = Field(max_length=32, index=True)
    title: str = Field(max_length=255)
    description: str = Field(default="")
    status: str = Field(default="todo", max_length=20)  # todo | in_progress | done
    condominio_id: uuid.UUID = Field(
        foreign_key="condominio.id", nullable=False, ondelete="CASCADE"
    )
    building_id: uuid.UUID | None = Field(
        default=None, foreign_key="building.id", ondelete="SET NULL"
    )
    created_by_user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False)
    assigned_to_user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False)
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    condominio: Condominio | None = Relationship(back_populates="tasks")
    messages: list["TaskMessage"] = Relationship(
        back_populates="task", cascade_delete=True
    )


class TaskMessage(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    task_id: uuid.UUID = Field(
        foreign_key="task.id", nullable=False, ondelete="CASCADE"
    )
    sender_user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False)
    sender_role: str = Field(max_length=20)  # manager | caretaker
    text: str | None = Field(default=None)
    image_data: str | None = Field(default=None)
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    task: Task | None = Relationship(back_populates="messages")


class Reminder(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=255)
    schedule_unit: str = Field(default="week", max_length=20)
    schedule_mode: str = Field(default="fixed", max_length=20)
    interval_value: int | None = Field(default=None)
    weekday_mask: int = Field(default=2, ge=1, le=127)  # bitmask for weekdays
    month_mask: int | None = Field(default=None)
    is_active: bool = Field(default=True)
    action_sms: bool = Field(default=False)
    sms_to: str | None = Field(default=None, max_length=20)
    sms_message: str | None = Field(default=None, max_length=1600)
    action_task: bool = Field(default=False)
    task_title: str | None = Field(default=None, max_length=255)
    task_description: str | None = Field(default=None)
    condominio_id: uuid.UUID = Field(
        foreign_key="condominio.id", nullable=False, ondelete="CASCADE"
    )
    created_by_user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False)
    last_triggered_on: date | None = Field(default=None)
    last_triggered_at: datetime | None = Field(
        default=None,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    updated_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    condominio: Condominio | None = Relationship(back_populates="reminders")


class FireAlarmScheduleRecord(SQLModel, table=True):
    __tablename__ = "fire_alarm_schedule_record"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    schedule_type: str = Field(default="fire_alarm", max_length=50, index=True)
    test_date: date = Field(index=True)
    time: str = Field(default="", max_length=5)
    building_label: str = Field(default="", max_length=100)
    call_point: str | None = Field(default=None, max_length=20)
    location: str | None = Field(default=None, max_length=100)
    action_required: bool = Field(default=False)
    comments: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )


class FireAlarmExternalCertificate(SQLModel, table=True):
    __tablename__ = "fire_alarm_external_certificate"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    condominio_id: uuid.UUID = Field(
        foreign_key="condominio.id", nullable=False, ondelete="CASCADE", index=True
    )
    building_id: uuid.UUID | None = Field(
        default=None, foreign_key="building.id", ondelete="SET NULL", index=True
    )
    certificate_date: date = Field(index=True)
    certificate_time: str = Field(default="", max_length=5)
    company: str = Field(default="", max_length=255, index=True)
    professional: str = Field(default="", max_length=255, index=True)
    media_1_name: str | None = Field(default=None, max_length=255)
    media_1_data: str | None = Field(default=None)
    media_2_name: str | None = Field(default=None, max_length=255)
    media_2_data: str | None = Field(default=None)
    created_by_user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False)
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )


class CashFlowRecord(SQLModel, table=True):
    __tablename__ = "cash_flow_record"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    payment_number: int = Field(index=True)
    has_invoice: bool = Field(default=False)
    invoice_media_name: str | None = Field(default=None, max_length=255)
    invoice_media_data: str | None = Field(default=None)
    record_date: date = Field(index=True)
    amount: float = Field(default=0)
    description: str = Field(default="", max_length=500)
    condominio_id: uuid.UUID = Field(
        foreign_key="condominio.id", nullable=False, ondelete="CASCADE", index=True
    )
    created_by_user_id: uuid.UUID = Field(foreign_key="user.id", nullable=False)
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    condominio: Condominio | None = Relationship(back_populates="cash_flow_records")


class Readings(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    data: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    tipo: int = Field(default=0)
    valor: int
    building_id: uuid.UUID = Field(
        foreign_key="building.id", nullable=False, ondelete="CASCADE"
    )
    building: Building | None = Relationship(back_populates="readings")


class FlatReading(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    data: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    tipo: int = Field(default=0)  # 1=Low, 2=Normal, 4=Gas
    valor: int
    flat_id: uuid.UUID = Field(
        foreign_key="flat.id", nullable=False, ondelete="CASCADE"
    )
    flat: Flat | None = Relationship(back_populates="readings")


class NotificationHistory(SQLModel, table=True):
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    created_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
        index=True,
    )
    updated_at: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    notification_type: str = Field(max_length=20, index=True)  # sms | email
    recipient_to: str = Field(max_length=255, index=True)
    message: str = Field(default="", max_length=2000)
    delivery_status: str = Field(default="pending", max_length=50, index=True)
    success: bool = Field(default=False, index=True)
    provider_message_id: str | None = Field(default=None, max_length=255, index=True)
    error_message: str | None = Field(default=None, max_length=1000)


# Generic message
class Message(SQLModel):
    message: str


class SMSNotificationCreate(SQLModel):
    phone_to: str = Field(
        min_length=9,
        max_length=20,
        description="Phone number in E.164 format, e.g. +15551234567",
    )
    body: str = Field(min_length=1, max_length=1600)


class ReportEmailCreate(SQLModel):
    email_to: EmailStr
    subject: str = Field(min_length=1, max_length=255)
    html_content: str = Field(default="")
    file_name: str = Field(min_length=1, max_length=255)
    file_data_base64: str = Field(min_length=1)


class EmailAttachmentCreate(SQLModel):
    file_name: str = Field(min_length=1, max_length=255)
    file_data_base64: str = Field(min_length=1)
    mime_type: str | None = Field(default=None, max_length=255)


class EmailNotificationCreate(SQLModel):
    email_to: EmailStr
    subject: str = Field(min_length=1, max_length=255)
    html_content: str = Field(default="")
    attachments: list[EmailAttachmentCreate] = []


class NotificationHistoryPublic(SQLModel):
    id: uuid.UUID
    created_at: datetime
    notification_type: str
    recipient_to: str
    message: str
    delivery_status: str
    success: bool
    provider_message_id: str | None = None
    error_message: str | None = None


class NotificationHistoryPublicList(SQLModel):
    data: list[NotificationHistoryPublic]
    count: int


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
    reading_types: int = Field(default=3, ge=0, le=7)  # Bitmask: 1=Low, 2=Normal, 4=Gas
    electricity_sn: str | None = Field(default=None, max_length=255)
    gas_sn: str | None = Field(default=None, max_length=255)


class BuildingCreate(BuildingBase):
    pass


class BuildingUpdate(SQLModel):
    nome: str | None = Field(default=None, max_length=255)
    condominio_id: uuid.UUID | None = None
    reading_types: int | None = Field(default=None, ge=0, le=7)
    electricity_sn: str | None = Field(default=None, max_length=255)
    gas_sn: str | None = Field(default=None, max_length=255)


class BuildingPublic(BuildingBase):
    id: uuid.UUID


class FlatPublicSimple(SQLModel):
    id: uuid.UUID
    numero: int
    label: str | None = None
    status: bool
    building_id: uuid.UUID
    reading_types: int


class BuildingPublicWithFlats(BuildingBase):
    id: uuid.UUID
    flats: list[FlatPublicSimple] = []


class BuildingsPublic(SQLModel):
    data: list[BuildingPublicWithFlats]
    count: int





class FlatCreate(FlatBase):
    pass


class FlatUpdate(SQLModel):
    numero: int | None = None
    label: str | None = Field(default=None, max_length=20)
    status: bool | None = None
    building_id: uuid.UUID | None = None
    reading_types: int | None = Field(default=None, ge=0, le=7)
    car1: str | None = Field(default=None, max_length=50)
    car2: str | None = Field(default=None, max_length=50)
    car3: str | None = Field(default=None, max_length=50)


class FlatPublic(FlatBase):
    id: uuid.UUID


class FlatsPublic(SQLModel):
    data: list[FlatPublic]
    count: int


class FlatReadingBase(SQLModel):
    data: datetime
    tipo: int = Field(default=0)  # 1=Low, 2=Normal, 4=Gas
    valor: int
    flat_id: uuid.UUID


class FlatReadingCreate(FlatReadingBase):
    pass


class FlatReadingUpdate(SQLModel):
    data: datetime | None = None
    tipo: int | None = None
    valor: int | None = None
    flat_id: uuid.UUID | None = None


class FlatReadingPublic(FlatReadingBase):
    id: uuid.UUID


class FlatReadingsPublic(SQLModel):
    data: list[FlatReadingPublic]
    count: int


class MoradorBase(SQLModel):
    cargo: int = Field(default=0)
    nome: str = Field(default="", max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)
    mobile: str = Field(default="", max_length=20)  # Changed to str for phone numbers
    receives_flat_reading_sms: bool = Field(default=False)
    receives_twilio_sms: bool = Field(default=False)
    flat_id: uuid.UUID


class MoradorCreate(MoradorBase):
    car1: str | None = Field(default=None, max_length=50)
    car2: str | None = Field(default=None, max_length=50)
    car3: str | None = Field(default=None, max_length=50)


class MoradorUpdate(SQLModel):
    cargo: int | None = None
    nome: str | None = Field(default=None, max_length=255)
    email: EmailStr | None = Field(default=None, max_length=255)
    mobile: str | None = Field(default=None, max_length=20)
    receives_flat_reading_sms: bool | None = None
    receives_twilio_sms: bool | None = None
    car1: str | None = Field(default=None, max_length=50)
    car2: str | None = Field(default=None, max_length=50)
    car3: str | None = Field(default=None, max_length=50)
    flat_id: uuid.UUID | None = None


class MoradorPublic(MoradorBase):
    id: uuid.UUID
    car1: str | None = None
    car2: str | None = None
    car3: str | None = None


class MoradoresPublic(SQLModel):
    data: list[MoradorPublic]
    count: int


# MoradorPublic with Flat information
class MoradorWithFlatPublic(MoradorBase):
    id: uuid.UUID
    flat_numero: int
    flat_label: str | None = None
    building_nome: str
    reading_types: int  # Bitmask for reading types: 1=Low, 2=Normal, 4=Gas
    car1: str | None = None
    car2: str | None = None
    car3: str | None = None


class MoradoresWithFlatPublic(SQLModel):
    data: list[MoradorWithFlatPublic]
    count: int


class FuncionarioBase(SQLModel):
    status: bool = Field(default=True)
    is_default: bool = Field(default=False)
    nome: str = Field(default="", max_length=255)
    mobile: int = Field(default=0)
    cargo: int = Field(default=0)
    email: EmailStr | None = Field(default=None, max_length=255)
    condominio_id: uuid.UUID


class FuncionarioCreate(FuncionarioBase):
    pass


class FuncionarioUpdate(SQLModel):
    status: bool | None = None
    is_default: bool | None = None
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
    data: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    operacao: int = Field(default=0)
    building_id: uuid.UUID


class AcessCreate(AcessBase):
    pass


class AcessUpdate(SQLModel):
    status: bool | None = None
    data: datetime | None = None
    operacao: int | None = None
    building_id: uuid.UUID | None = None


class AcessPublic(AcessBase):
    id: uuid.UUID
    funcionario_id: uuid.UUID


class AcessesPublic(SQLModel):
    data: list[AcessPublic]
    count: int


class AcessActiveStatus(SQLModel):
    has_open_session: bool
    building_id: uuid.UUID | None = None


class BinMissCollectionCreate(SQLModel):
    building_id: uuid.UUID
    miss_collection: bool = True
    collection_type: str = Field(default="general", max_length=20)
    collection_status: str = Field(default="miss", max_length=20)


class BinMissCollectionUpdate(SQLModel):
    data: datetime | None = None
    miss_collection: bool | None = None
    collection_type: str | None = Field(default=None, max_length=20)
    collection_status: str | None = Field(default=None, max_length=20)


class BinMissCollectionPublic(SQLModel):
    id: uuid.UUID
    data: datetime
    miss_collection: bool
    collection_type: str
    collection_status: str
    building_id: uuid.UUID
    building_nome: str


class BinMissCollectionsPublic(SQLModel):
    data: list[BinMissCollectionPublic]
    count: int


class BinSessionBase(SQLModel):
    status: bool = Field(default=True)
    data: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    operacao: int = Field(default=0)
    building_id: uuid.UUID


class BinSessionCreate(BinSessionBase):
    pass


class BinSessionUpdate(SQLModel):
    data: datetime | None = None


class BinSessionPublic(BinSessionBase):
    id: uuid.UUID
    funcionario_id: uuid.UUID
    building_nome: str


class BinSessionsPublic(SQLModel):
    data: list[BinSessionPublic]
    count: int


class WorkTimeSessionBase(SQLModel):
    status: bool = Field(default=True)
    data: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    operacao: int = Field(default=0)


class WorkTimeSessionCreate(WorkTimeSessionBase):
    pass


class WorkTimeSessionUpdate(SQLModel):
    data: datetime | None = None


class WorkTimeSessionPublic(WorkTimeSessionBase):
    id: uuid.UUID
    funcionario_id: uuid.UUID


class WorkTimeSessionsPublic(SQLModel):
    data: list[WorkTimeSessionPublic]
    count: int


class CaretakerMonthlyGoalCreate(SQLModel):
    month_start: date
    target_hours: float = Field(ge=0)


class CaretakerMonthlyGoalUpdate(SQLModel):
    month_start: date | None = None
    target_hours: float | None = Field(default=None, ge=0)


class CaretakerMonthlyGoalPublic(SQLModel):
    id: uuid.UUID
    month_start: date
    target_hours: float
    condominio_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class CaretakerMonthlyGoalsPublic(SQLModel):
    data: list[CaretakerMonthlyGoalPublic]
    count: int


class CaretakerMonthlyMetricPublic(SQLModel):
    month_start: date
    worked_hours: float
    target_hours: float
    carry_over_hours: float
    effective_target_hours: float
    remaining_hours: float


class CaretakerMonthlyMetricsPublic(SQLModel):
    data: list[CaretakerMonthlyMetricPublic]
    count: int


class ContractorVisitCheckInCreate(SQLModel):
    condominio_id: uuid.UUID
    name: str = Field(min_length=1, max_length=255)
    company: str = Field(min_length=1, max_length=255)
    building_id: uuid.UUID
    job_description: str = Field(min_length=1, max_length=255)
    mobile: str = Field(min_length=1, max_length=30)


class ContractorVisitCheckOutCreate(SQLModel):
    condominio_id: uuid.UUID
    visit_id: uuid.UUID


class ContractorAccessBuildingPublic(SQLModel):
    id: uuid.UUID
    name: str


class ContractorAccessBuildingsPublic(SQLModel):
    data: list[ContractorAccessBuildingPublic]
    count: int


class ContractorVisitPublic(SQLModel):
    id: uuid.UUID
    name: str
    company: str
    building_name: str
    door_code: str | None = None
    job_description: str
    mobile: str
    in_at: datetime
    out_at: datetime | None
    condominio_id: uuid.UUID


class ContractorVisitMediaUpdate(SQLModel):
    extra_media_name: str | None = Field(default=None, max_length=255)
    extra_media_data: str | None = None
    extra_media_2_name: str | None = Field(default=None, max_length=255)
    extra_media_2_data: str | None = None
    extra_media_3_name: str | None = Field(default=None, max_length=255)
    extra_media_3_data: str | None = None
    extra_media_4_name: str | None = Field(default=None, max_length=255)
    extra_media_4_data: str | None = None


class ContractorVisitAdminPublic(SQLModel):
    id: uuid.UUID
    name: str
    company: str
    building_name: str
    job_description: str
    mobile: str
    extra_media_name: str | None
    extra_media_data: str | None
    extra_media_2_name: str | None
    extra_media_2_data: str | None
    extra_media_3_name: str | None
    extra_media_3_data: str | None
    extra_media_4_name: str | None
    extra_media_4_data: str | None
    in_at: datetime
    out_at: datetime | None
    condominio_id: uuid.UUID


class ContractorVisitsPublic(SQLModel):
    data: list[ContractorVisitAdminPublic]
    count: int


class ContractorHistoryCategoryCreate(SQLModel):
    name: str = Field(min_length=1, max_length=100)


class ContractorHistoryCategoryPublic(SQLModel):
    id: uuid.UUID
    name: str
    created_at: datetime
    updated_at: datetime


class ContractorHistoryCategoriesPublic(SQLModel):
    data: list[ContractorHistoryCategoryPublic]
    count: int


class ContractorHistoryUpsert(SQLModel):
    category_id: uuid.UUID
    created_new_visit: bool = False
    next_enabled: bool = False
    next_interval_unit: str | None = Field(default=None, max_length=10)
    next_interval_value: int | None = Field(default=None, ge=1)
    contractor_visit_id: uuid.UUID | None = None
    name: str | None = Field(default=None, max_length=255)
    company: str | None = Field(default=None, max_length=255)
    building_id: uuid.UUID | None = None
    job_description: str | None = Field(default=None, max_length=255)
    mobile: str | None = Field(default=None, max_length=30)
    in_at: datetime | None = None
    out_at: datetime | None = None


class ContractorHistoryPublic(SQLModel):
    id: uuid.UUID
    category_id: uuid.UUID
    category_name: str
    contractor_visit_id: uuid.UUID
    created_new_visit: bool
    next_enabled: bool
    next_interval_unit: str | None
    next_interval_value: int | None
    next_job_at: datetime | None
    next_notify_at: datetime | None
    next_notification_sent_at: datetime | None
    name: str
    company: str
    building_name: str
    job_description: str
    mobile: str
    visit_in_at: datetime
    visit_out_at: datetime | None
    history_created_at: datetime
    history_updated_at: datetime
    condominio_id: uuid.UUID


class ContractorHistoriesPublic(SQLModel):
    data: list[ContractorHistoryPublic]
    count: int


class ContractorHistoryExecutionSummary(SQLModel):
    checked: int
    triggered: int
    sms_sent: int


class ContractorOpenVisitPublic(SQLModel):
    id: uuid.UUID
    name: str
    company: str
    building_name: str
    job_description: str
    mobile: str
    in_at: datetime


class ContractorOpenVisitsPublic(SQLModel):
    data: list[ContractorOpenVisitPublic]
    count: int


class FireAlarmExternalCertificateCreate(SQLModel):
    building_id: uuid.UUID
    certificate_date: date
    media_1_name: str | None = Field(default=None, max_length=255)
    media_1_data: str | None = None
    media_2_name: str | None = Field(default=None, max_length=255)
    media_2_data: str | None = None


class FireAlarmExternalCertificatePublic(SQLModel):
    id: uuid.UUID
    condominio_id: uuid.UUID
    building_id: uuid.UUID | None
    building_name: str | None = None
    certificate_date: date
    media_1_name: str | None
    media_1_data: str | None
    media_2_name: str | None
    media_2_data: str | None
    created_by_user_id: uuid.UUID
    created_at: datetime


class FireAlarmExternalCertificatesPublic(SQLModel):
    data: list[FireAlarmExternalCertificatePublic]
    count: int


class CashFlowRecordCreate(SQLModel):
    has_invoice: bool = False
    invoice_media_name: str | None = Field(default=None, max_length=255)
    invoice_media_data: str | None = None
    record_date: date
    amount: float
    description: str = Field(default="", max_length=500)


class CashFlowRecordUpdate(SQLModel):
    has_invoice: bool | None = None
    invoice_media_name: str | None = Field(default=None, max_length=255)
    invoice_media_data: str | None = None
    record_date: date | None = None
    amount: float | None = None
    description: str | None = Field(default=None, max_length=500)


class CashFlowRecordPublic(SQLModel):
    id: uuid.UUID
    payment_number: int
    has_invoice: bool
    invoice_media_name: str | None
    invoice_media_data: str | None
    record_date: date
    amount: float
    description: str
    condominio_id: uuid.UUID
    created_by_user_id: uuid.UUID
    created_at: datetime


class CashFlowRecordsPublic(SQLModel):
    data: list[CashFlowRecordPublic]
    count: int
    balance: float
    next_payment_number: int


class CaretakerPublic(SQLModel):
    id: uuid.UUID
    email: EmailStr
    full_name: str | None = None


class CaretakersPublic(SQLModel):
    data: list[CaretakerPublic]
    count: int


class TaskCreate(SQLModel):
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(default="")
    image_data: str | None = None
    assigned_to_user_id: uuid.UUID | None = None
    building_id: uuid.UUID | None = None


class TaskStatusUpdate(SQLModel):
    status: str = Field(min_length=1, max_length=20)  # todo | in_progress | done
    image_data: str | None = None


class TaskPublic(SQLModel):
    id: uuid.UUID
    code: str
    title: str
    description: str
    cover_image_data: str | None = None
    requires_completion_image: bool = False
    status: str
    condominio_id: uuid.UUID
    building_id: uuid.UUID | None = None
    building_label: str
    created_by_user_id: uuid.UUID
    assigned_to_user_id: uuid.UUID
    assigned_to_name: str
    spent_seconds: int = 0
    created_at: datetime
    updated_at: datetime


class TasksPublic(SQLModel):
    data: list[TaskPublic]
    count: int


class TaskBuildingOptionPublic(SQLModel):
    id: uuid.UUID
    name: str


class TaskBoardMetadataPublic(SQLModel):
    common_area_label: str
    buildings: list[TaskBuildingOptionPublic]


class TaskMessageCreate(SQLModel):
    text: str | None = None
    image_data: str | None = None


class TaskMessagePublic(SQLModel):
    id: uuid.UUID
    task_id: uuid.UUID
    sender_user_id: uuid.UUID
    sender_name: str
    sender_role: str
    text: str | None
    image_data: str | None
    created_at: datetime


class TaskMessagesPublic(SQLModel):
    data: list[TaskMessagePublic]
    count: int


class ReminderCreate(SQLModel):
    name: str = Field(min_length=1, max_length=255)
    schedule_unit: str = Field(default="week", min_length=1, max_length=20)
    schedule_mode: str = Field(default="fixed", min_length=1, max_length=20)
    interval_value: int | None = Field(default=None, ge=1)
    weekday_mask: int = Field(default=2, ge=1, le=127)
    month_mask: int | None = Field(default=None, ge=1, le=4095)
    is_active: bool = True
    action_sms: bool = False
    sms_to: str | None = Field(default=None, max_length=20)
    sms_message: str | None = Field(default=None, max_length=1600)
    action_task: bool = False
    task_title: str | None = Field(default=None, max_length=255)
    task_description: str | None = Field(default=None)


class ReminderUpdate(SQLModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    schedule_unit: str | None = Field(default=None, min_length=1, max_length=20)
    schedule_mode: str | None = Field(default=None, min_length=1, max_length=20)
    interval_value: int | None = Field(default=None, ge=1)
    weekday_mask: int | None = Field(default=None, ge=1, le=127)
    month_mask: int | None = Field(default=None, ge=1, le=4095)
    is_active: bool | None = None
    action_sms: bool | None = None
    sms_to: str | None = Field(default=None, max_length=20)
    sms_message: str | None = Field(default=None, max_length=1600)
    action_task: bool | None = None
    task_title: str | None = Field(default=None, max_length=255)
    task_description: str | None = Field(default=None)


class ReminderPublic(SQLModel):
    id: uuid.UUID
    name: str
    schedule_unit: str
    schedule_mode: str
    interval_value: int | None
    weekday_mask: int
    month_mask: int | None
    is_active: bool
    action_sms: bool
    sms_to: str | None
    sms_message: str | None
    action_task: bool
    task_title: str | None
    task_description: str | None
    condominio_id: uuid.UUID
    created_by_user_id: uuid.UUID
    last_triggered_on: date | None
    last_triggered_at: datetime | None
    created_at: datetime
    updated_at: datetime


class RemindersPublic(SQLModel):
    data: list[ReminderPublic]
    count: int


class ReminderExecutionSummary(SQLModel):
    checked: int
    triggered: int
    sms_sent: int
    tasks_created: int


class ReadingsBase(SQLModel):
    data: datetime = Field(
        default_factory=get_datetime_utc,
        sa_type=SQLAlchemyDateTime(timezone=True),  # type: ignore
    )
    tipo: int = Field(default=0)
    valor: int
    building_id: uuid.UUID


class ReadingsCreate(ReadingsBase):
    pass


class ReadingsUpdate(SQLModel):
    data: datetime | None = None
    tipo: int | None = None
    valor: int | None = None
    building_id: uuid.UUID | None = None


class ReadingsPublic(ReadingsBase):
    id: uuid.UUID


class ReadingsPublicList(SQLModel):
    data: list[ReadingsPublic]
    count: int
