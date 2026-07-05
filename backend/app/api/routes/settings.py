from fastapi import APIRouter, Depends, HTTPException

from app.schemas.settings import AppDefinitionUpdateRequest, PublicSettingsResponse, SettingsUpdateRequest
from app.services.settings import AppDefinitionApplyError, SettingsService, StartupOnlySettingError
from app.api.dependencies import get_settings_service

router = APIRouter(tags=["settings"])


@router.get("/settings", response_model=PublicSettingsResponse)
async def get_settings_route(settings_service: SettingsService = Depends(get_settings_service)) -> PublicSettingsResponse:
    return settings_service.get_public_settings()


@router.put("/settings", response_model=PublicSettingsResponse)
async def update_settings_route(
    payload: SettingsUpdateRequest,
    settings_service: SettingsService = Depends(get_settings_service),
) -> PublicSettingsResponse:
    try:
        return settings_service.update_settings(payload)
    except StartupOnlySettingError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.put("/settings/app-definition", response_model=PublicSettingsResponse)
async def update_app_definition_route(
    payload: AppDefinitionUpdateRequest,
    settings_service: SettingsService = Depends(get_settings_service),
) -> PublicSettingsResponse:
    try:
        return settings_service.update_app_definition(payload)
    except AppDefinitionApplyError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
