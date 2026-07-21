import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import threading
import time

from app.core.config import get_settings


class AppLockError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class AppLockService:
    """Process-local unlock state backed by a user-only scrypt password record."""

    _N = 2**14
    _R = 8
    _P = 1

    def __init__(self) -> None:
        self._unlocked = False
        self._failed_attempts = 0
        self._blocked_until = 0.0
        self._mutex = threading.RLock()

    @property
    def config_path(self) -> Path:
        return get_settings().app_data_dir / "settings" / "app-lock.json"

    def _read(self) -> dict | None:
        try:
            data = json.loads(self.config_path.read_text(encoding="utf-8"))
            return data if data.get("enabled") and data.get("password_hash") else None
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return None

    def status(self) -> dict[str, bool]:
        enabled = self._read() is not None
        return {"enabled": enabled, "unlocked": not enabled or self._unlocked}

    @staticmethod
    def _validate(password: str, confirmation: str) -> None:
        if not password.strip() or len(password) < 8:
            raise AppLockError("Password must be at least 8 characters.")
        if password != confirmation:
            raise AppLockError("Passwords do not match.")

    def _hash(self, password: str, salt: bytes | None = None) -> tuple[str, str]:
        salt = salt or secrets.token_bytes(16)
        digest = hashlib.scrypt(password.encode(), salt=salt, n=self._N, r=self._R, p=self._P, dklen=32)
        return base64.b64encode(salt).decode(), base64.b64encode(digest).decode()

    def _verify(self, password: str, record: dict) -> bool:
        try:
            salt = base64.b64decode(record["salt"], validate=True)
            _, candidate = self._hash(password, salt)
            return hmac.compare_digest(candidate, record["password_hash"])
        except (KeyError, ValueError, TypeError):
            return False

    def _write(self, password: str) -> None:
        salt, password_hash = self._hash(password)
        path = self.config_path
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        temp = path.with_suffix(".tmp")
        temp.write_text(json.dumps({"enabled": True, "algorithm": "scrypt", "salt": salt, "password_hash": password_hash}), encoding="utf-8")
        os.chmod(temp, 0o600)
        os.replace(temp, path)

    def enable(self, password: str, confirmation: str) -> None:
        with self._mutex:
            if self._read():
                raise AppLockError("App lock is already enabled.", 409)
            self._validate(password, confirmation)
            self._write(password)
            # Enabling applies on next start; this process remains usable.
            self._unlocked = True

    def _require_password(self, password: str) -> dict:
        record = self._read()
        if not record or not self._verify(password, record):
            raise AppLockError("Incorrect password.", 401)
        return record

    def unlock(self, password: str) -> None:
        with self._mutex:
            now = time.monotonic()
            if now < self._blocked_until:
                raise AppLockError("Too many attempts. Try again shortly.", 429)
            try:
                self._require_password(password)
            except AppLockError:
                self._failed_attempts += 1
                if self._failed_attempts >= 5:
                    self._blocked_until = now + 5
                    self._failed_attempts = 0
                raise
            self._failed_attempts = 0
            self._blocked_until = 0
            self._unlocked = True

    def change_password(self, current: str, new: str, confirmation: str) -> None:
        with self._mutex:
            self._require_password(current)
            self._validate(new, confirmation)
            self._write(new)

    def disable(self, current: str) -> None:
        with self._mutex:
            self._require_password(current)
            self.config_path.unlink(missing_ok=True)
            self._unlocked = False

    def lock(self) -> None:
        if self._read():
            self._unlocked = False

    def reset_session(self) -> None:
        self._unlocked = False
        self._failed_attempts = 0
        self._blocked_until = 0


app_lock_service = AppLockService()
