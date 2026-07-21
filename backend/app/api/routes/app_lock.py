from fastapi import APIRouter, HTTPException

from app.schemas.app_lock import AppLockResult, AppLockStatus, ChangePasswordRequest, DisableRequest, PasswordPair, UnlockRequest
from app.services.app_lock import AppLockError, app_lock_service

router = APIRouter(prefix="/app-lock", tags=["app-lock"])


def result(message: str) -> AppLockResult:
    return AppLockResult(**app_lock_service.status(), message=message)


def run(action, message: str) -> AppLockResult:
    try:
        action()
        return result(message)
    except AppLockError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from None


@router.get("/status", response_model=AppLockStatus)
async def status() -> AppLockStatus:
    return AppLockStatus(**app_lock_service.status())


@router.post("/enable", response_model=AppLockResult)
async def enable(body: PasswordPair) -> AppLockResult:
    return run(lambda: app_lock_service.enable(body.password, body.confirm_password), "App lock enabled.")


@router.post("/unlock", response_model=AppLockResult)
async def unlock(body: UnlockRequest) -> AppLockResult:
    return run(lambda: app_lock_service.unlock(body.password), "App unlocked.")


@router.post("/change-password", response_model=AppLockResult)
async def change_password(body: ChangePasswordRequest) -> AppLockResult:
    return run(lambda: app_lock_service.change_password(body.current_password, body.new_password, body.confirm_password), "Password changed.")


@router.post("/disable", response_model=AppLockResult)
async def disable(body: DisableRequest) -> AppLockResult:
    return run(lambda: app_lock_service.disable(body.current_password), "App lock disabled.")


@router.post("/lock", response_model=AppLockResult)
async def lock() -> AppLockResult:
    app_lock_service.lock()
    return result("App locked.")
