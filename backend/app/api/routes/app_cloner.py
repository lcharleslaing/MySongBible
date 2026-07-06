from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies import get_app_settings
from app.core.config import Settings
from app.schemas.app_cloner import AppCloneDefaults, AppCloneRequest, AppCloneStatus
from app.services.app_cloner import AppCloneError, get_app_clone_runner

router = APIRouter(tags=["app-cloner"])


@router.get("/app-cloner/defaults", response_model=AppCloneDefaults)
async def get_app_clone_defaults(settings: Settings = Depends(get_app_settings)) -> AppCloneDefaults:
    return AppCloneDefaults(repo_url=get_app_clone_runner(settings).defaults())


@router.get("/app-cloner/status", response_model=AppCloneStatus)
async def get_app_clone_status(settings: Settings = Depends(get_app_settings)) -> AppCloneStatus:
    return get_app_clone_runner(settings).status()


@router.post("/app-cloner/clone", response_model=AppCloneStatus, status_code=202)
async def clone_app(payload: AppCloneRequest, settings: Settings = Depends(get_app_settings)) -> AppCloneStatus:
    try:
        return get_app_clone_runner(settings).start(payload)
    except AppCloneError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error
