from fastapi import APIRouter, Depends

from app.schemas.settings import PublicSettingsResponse, SettingsUpdateRequest
from app.services.settings import SettingsService
from app.api.dependencies import get_settings_service

router = APIRouter(tags=["settings"])


@router.get("/settings", response_model=PublicSettingsResponse)
def get_settings_route(settings_service: SettingsService = Depends(get_settings_service)) -> PublicSettingsResponse:
    return settings_service.get_public_settings()


@router.put("/settings", response_model=PublicSettingsResponse)
def update_settings_route(
    payload: SettingsUpdateRequest,
    settings_service: SettingsService = Depends(get_settings_service),
) -> PublicSettingsResponse:
    return settings_service.update_settings(payload)
