import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlmodel import col, func, select

from app.api.deps import SessionDep
from app.models import (
    Condominio,
    ContractorOpenVisitPublic,
    ContractorOpenVisitsPublic,
    ContractorVisit,
    ContractorVisitCheckInCreate,
    ContractorVisitCheckOutCreate,
    ContractorVisitPublic,
)

router = APIRouter(prefix="/contractor-access", tags=["contractor-access"])


def _require_condominio(session: SessionDep, condominio_id: uuid.UUID) -> Condominio:
    condominio = session.get(Condominio, condominio_id)
    if not condominio:
        raise HTTPException(status_code=404, detail="Condominio not found")
    return condominio


@router.get("/open", response_model=ContractorOpenVisitsPublic)
def read_open_contractor_visits(
    session: SessionDep,
    condominio_id: uuid.UUID,
) -> Any:
    _require_condominio(session, condominio_id)

    count_statement = (
        select(func.count())
        .select_from(ContractorVisit)
        .where(
            ContractorVisit.condominio_id == condominio_id,
            col(ContractorVisit.out_at).is_(None),
        )
    )
    count = session.exec(count_statement).one()

    statement = (
        select(ContractorVisit)
        .where(
            ContractorVisit.condominio_id == condominio_id,
            col(ContractorVisit.out_at).is_(None),
        )
        .order_by(ContractorVisit.in_at.desc())
    )
    rows = session.exec(statement).all()

    return ContractorOpenVisitsPublic(
        data=[
            ContractorOpenVisitPublic(
                id=item.id,
                name=item.name,
                company=item.company,
                block=item.block,
                mobile=item.mobile,
                in_at=item.in_at,
            )
            for item in rows
        ],
        count=count,
    )


@router.post("/check-in", response_model=ContractorVisitPublic, status_code=201)
def create_contractor_visit(
    *,
    session: SessionDep,
    payload: ContractorVisitCheckInCreate,
) -> Any:
    _require_condominio(session, payload.condominio_id)

    item = ContractorVisit(
        name=payload.name.strip(),
        company=payload.company.strip(),
        car_reg=payload.car_reg.strip(),
        block=payload.block.strip(),
        mobile=payload.mobile.strip(),
        condominio_id=payload.condominio_id,
    )
    session.add(item)
    session.commit()
    session.refresh(item)

    return ContractorVisitPublic(
        id=item.id,
        name=item.name,
        company=item.company,
        car_reg=item.car_reg,
        block=item.block,
        mobile=item.mobile,
        in_at=item.in_at,
        out_at=item.out_at,
        condominio_id=item.condominio_id,
    )


@router.post("/check-out", response_model=ContractorVisitPublic, status_code=201)
def close_contractor_visit(
    *,
    session: SessionDep,
    payload: ContractorVisitCheckOutCreate,
) -> Any:
    _require_condominio(session, payload.condominio_id)

    item = session.get(ContractorVisit, payload.visit_id)
    if not item or item.condominio_id != payload.condominio_id:
        raise HTTPException(status_code=404, detail="Contractor visit not found")

    if item.out_at is not None:
        raise HTTPException(status_code=400, detail="Contractor already checked out")

    item.out_at = datetime.now(timezone.utc)
    session.add(item)
    session.commit()
    session.refresh(item)

    return ContractorVisitPublic(
        id=item.id,
        name=item.name,
        company=item.company,
        car_reg=item.car_reg,
        block=item.block,
        mobile=item.mobile,
        in_at=item.in_at,
        out_at=item.out_at,
        condominio_id=item.condominio_id,
    )
