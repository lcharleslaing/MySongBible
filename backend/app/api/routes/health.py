from fastapi import APIRouter, Depends

from app.api.dependencies import get_app_settings
from app.core.config import Settings
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def get_health(settings: Settings = Depends(get_app_settings)) -> HealthResponse:
    return HealthResponse(status="ok", app_name=settings.app_name)
