from fastapi import APIRouter

from app.api.routes import (
    acess,
    bins,
    buildings,
    condominios,
    flat_readings,
    flats,
    funcionarios,
    login,
    moradores,
    reminds,
    private,
    readings,
    tasks,
    users,
    utils,
)
from app.core.config import settings

api_router = APIRouter()
api_router.include_router(login.router)
api_router.include_router(users.router)
api_router.include_router(utils.router)
api_router.include_router(condominios.router)
api_router.include_router(buildings.router)
api_router.include_router(flats.router)
api_router.include_router(moradores.router)
api_router.include_router(funcionarios.router)
api_router.include_router(reminds.router)
api_router.include_router(acess.router)
api_router.include_router(bins.router)
api_router.include_router(readings.router)
api_router.include_router(flat_readings.router)
api_router.include_router(tasks.router)


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
