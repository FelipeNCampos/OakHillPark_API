import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Field, SQLModel, func, select

from app.api.deps import SessionDep, require_cargo
from app.api.routes import flat_readings
from app.models import (
    Building,
    Flat,
    FlatReading,
    Message,
    Readings,
    ReadingsCreate,
    ReadingsPublic,
    ReadingsPublicList,
    ReadingsUpdate,
)

router = APIRouter(prefix="/readings", tags=["readings"])


class PublicReadingFormBuilding(SQLModel):
    id: uuid.UUID
    nome: str
    reading_types: int


class PublicReadingFormFlat(SQLModel):
    id: uuid.UUID
    numero: int
    label: str | None
    reading_types: int


class PublicReadingForm(SQLModel):
    building: PublicReadingFormBuilding
    flats: list[PublicReadingFormFlat]


class PublicBuildingReadingValue(SQLModel):
    tipo: int
    valor: int


class PublicFlatReadingValue(PublicBuildingReadingValue):
    flat_id: uuid.UUID


class PublicReadingsSubmission(SQLModel):
    building_readings: list[PublicBuildingReadingValue] = Field(default_factory=list)
    flat_readings: list[PublicFlatReadingValue] = Field(default_factory=list)


class PublicReadingsSubmissionResult(SQLModel):
    building_readings: int
    flat_readings: int


def _get_public_readings_building(session: SessionDep, building_id: uuid.UUID) -> Building:
    building = session.get(Building, building_id)
    if not building:
        raise HTTPException(status_code=404, detail="Building not found")
    return building


def _ensure_reading_type_is_configured(reading_types: int, tipo: int) -> None:
    if tipo not in (1, 2, 4) or (reading_types & tipo) == 0:
        raise HTTPException(status_code=400, detail="Reading type is not configured")


@router.get("/", response_model=ReadingsPublicList, dependencies=[Depends(require_cargo(2))])
def read_readings(session: SessionDep, skip: int = 0, limit: int = 100, building_id: uuid.UUID | None = None) -> Any:
    count_statement = select(func.count()).select_from(Readings)
    statement = select(Readings).order_by(Readings.data.desc()).offset(skip).limit(limit)

    if building_id:
        count_statement = count_statement.where(Readings.building_id == building_id)
        statement = statement.where(Readings.building_id == building_id)

    count = session.exec(count_statement).one()
    readings = session.exec(statement).all()
    return ReadingsPublicList(data=readings, count=count)


@router.get("/public/{building_id}", response_model=PublicReadingForm)
def get_public_readings_form(
    session: SessionDep, building_id: uuid.UUID
) -> PublicReadingForm:
    building = _get_public_readings_building(session, building_id)
    flats = session.exec(
        select(Flat)
        .where(Flat.building_id == building.id, Flat.reading_types > 0)
        .order_by(Flat.numero.asc(), Flat.label.asc())
    ).all()
    return PublicReadingForm(
        building=PublicReadingFormBuilding(
            id=building.id,
            nome=building.nome,
            reading_types=building.reading_types,
        ),
        flats=[
            PublicReadingFormFlat(
                id=flat.id,
                numero=flat.numero,
                label=flat.label,
                reading_types=flat.reading_types,
            )
            for flat in flats
        ],
    )


@router.post("/public/{building_id}", response_model=PublicReadingsSubmissionResult)
def submit_public_readings_form(
    *,
    session: SessionDep,
    building_id: uuid.UUID,
    submission: PublicReadingsSubmission,
) -> PublicReadingsSubmissionResult:
    building = _get_public_readings_building(session, building_id)
    if not submission.building_readings and not submission.flat_readings:
        raise HTTPException(status_code=400, detail="Submit at least one reading")

    for reading in submission.building_readings:
        _ensure_reading_type_is_configured(building.reading_types, reading.tipo)

    flats_by_id: dict[uuid.UUID, Flat] = {}
    for reading in submission.flat_readings:
        flat = flats_by_id.get(reading.flat_id)
        if flat is None:
            flat = session.get(Flat, reading.flat_id)
            if not flat:
                raise HTTPException(status_code=404, detail="Flat not found")
            if flat.building_id != building.id:
                raise HTTPException(
                    status_code=400, detail="Flat does not belong to this building"
                )
            flats_by_id[flat.id] = flat
        if reading.tipo not in (1, 2, 4, 8) or (flat.reading_types & reading.tipo) == 0:
            raise HTTPException(status_code=400, detail="Reading type is not configured")
        flat_readings._ensure_flat_reading_type_allowed(
            session, reading.flat_id, reading.tipo
        )

    created_flat_readings: list[FlatReading] = []
    for reading in submission.building_readings:
        session.add(
            Readings(
                tipo=reading.tipo,
                valor=reading.valor,
                building_id=building.id,
            )
        )
    for reading in submission.flat_readings:
        flat_reading = FlatReading(
            tipo=reading.tipo,
            valor=reading.valor,
            flat_id=reading.flat_id,
        )
        session.add(flat_reading)
        created_flat_readings.append(flat_reading)
    session.commit()

    latest_flat_reading_by_flat_id: dict[uuid.UUID, FlatReading] = {}
    for flat_reading in created_flat_readings:
        session.refresh(flat_reading)
        latest_flat_reading_by_flat_id[flat_reading.flat_id] = flat_reading
    for flat_reading in latest_flat_reading_by_flat_id.values():
        flat_readings._send_flat_reading_sms(session, flat_reading)

    return PublicReadingsSubmissionResult(
        building_readings=len(submission.building_readings),
        flat_readings=len(submission.flat_readings),
    )


@router.get("/{id}", response_model=ReadingsPublic, dependencies=[Depends(require_cargo(2))])
def read_reading(session: SessionDep, id: uuid.UUID) -> Any:
    reading = session.get(Readings, id)
    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found")
    return reading


@router.post("/", response_model=ReadingsPublic, dependencies=[Depends(require_cargo(2))])
def create_reading(*, session: SessionDep, reading_in: ReadingsCreate) -> Any:
    reading = Readings.model_validate(reading_in)
    session.add(reading)
    session.commit()
    session.refresh(reading)
    return reading


@router.patch("/{id}", response_model=ReadingsPublic, dependencies=[Depends(require_cargo(2))])
def update_reading(*, session: SessionDep, id: uuid.UUID, reading_in: ReadingsUpdate) -> Any:
    reading = session.get(Readings, id)
    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found")
    update_dict = reading_in.model_dump(exclude_unset=True)
    reading.sqlmodel_update(update_dict)
    session.add(reading)
    session.commit()
    session.refresh(reading)
    return reading


@router.delete("/{id}", response_model=Message, dependencies=[Depends(require_cargo(2))])
def delete_reading(session: SessionDep, id: uuid.UUID) -> Message:
    reading = session.get(Readings, id)
    if not reading:
        raise HTTPException(status_code=404, detail="Reading not found")
    session.delete(reading)
    session.commit()
    return Message(message="Reading deleted successfully")
