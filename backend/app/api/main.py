from fastapi import APIRouter

from app.api.routes import (
    acess,
    buildings,
    condominios,
    funcionarios,
    flats,
    login,
    moradores,
    private,
    readings,
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
api_router.include_router(acess.router)
api_router.include_router(readings.router)


if settings.ENVIRONMENT == "local":
    api_router.include_router(private.router)
