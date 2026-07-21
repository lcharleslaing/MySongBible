from pydantic import BaseModel


class PasswordPair(BaseModel):
    password: str
    confirm_password: str


class UnlockRequest(BaseModel):
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    confirm_password: str


class DisableRequest(BaseModel):
    current_password: str


class AppLockStatus(BaseModel):
    enabled: bool
    unlocked: bool


class AppLockResult(AppLockStatus):
    message: str
