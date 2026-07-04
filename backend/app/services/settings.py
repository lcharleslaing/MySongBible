from datetime import datetime, timezone
from pathlib import Path

from sqlmodel import Session, select

from app.core.config import Settings
from app.models.app_setting import AppSetting
from app.schemas.settings import PublicSettingsResponse, SettingsUpdateRequest


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SettingsService:
    def __init__(self, session: Session, base_settings: Settings) -> None:
        self.session = session
        self.base_settings = base_settings

    def get_public_settings(self) -> PublicSettingsResponse:
        overrides = self._get_overrides()

        database_url = overrides.get("database_url", self.base_settings.database_url)
        whisper_cpp_binary = overrides.get(
            "whisper_cpp_binary",
            str(self.base_settings.whisper_cpp_binary) if self.base_settings.whisper_cpp_binary else None,
        )
        whisper_model_path = overrides.get(
            "whisper_model_path",
            str(self.base_settings.whisper_model_path) if self.base_settings.whisper_model_path else None,
        )
        default_tts_engine = overrides.get("default_tts_engine", self.base_settings.default_tts_engine)

        return PublicSettingsResponse(
            app_name=self.base_settings.app_name,
            app_env=self.base_settings.app_env,
            database_url=database_url,
            sqlite_database_path=self._sqlite_path_from_url(database_url),
            app_data_dir=str(self.base_settings.app_data_dir),
            whisper_cpp_binary=whisper_cpp_binary,
            whisper_model_path=whisper_model_path,
            whisper_thread_count=self.base_settings.whisper_thread_count,
            keep_uploaded_audio_files=self.base_settings.keep_uploaded_audio_files,
            default_stt_model=self.base_settings.default_stt_model,
            default_tts_engine=default_tts_engine,
        )

    def update_settings(self, payload: SettingsUpdateRequest) -> PublicSettingsResponse:
        updates = {
          "whisper_cpp_binary": payload.whisper_cpp_binary or "",
          "whisper_model_path": payload.whisper_model_path or "",
          "default_tts_engine": payload.default_tts_engine,
          "database_url": self._sqlite_url_from_path(payload.sqlite_database_path),
        }

        for key, value in updates.items():
            self._upsert_setting(key, value)

        self.session.commit()
        return self.get_public_settings()

    def get_runtime_settings(self) -> Settings:
        public_settings = self.get_public_settings()
        return self.base_settings.model_copy(
            update={
                "database_url": public_settings.database_url,
                "whisper_cpp_binary": Path(public_settings.whisper_cpp_binary) if public_settings.whisper_cpp_binary else None,
                "whisper_model_path": Path(public_settings.whisper_model_path) if public_settings.whisper_model_path else None,
                "default_tts_engine": public_settings.default_tts_engine,
            }
        )

    def _get_overrides(self) -> dict[str, str]:
        statement = select(AppSetting)
        settings = self.session.exec(statement).all()
        return {item.key: item.value for item in settings}

    def _upsert_setting(self, key: str, value: str) -> None:
        statement = select(AppSetting).where(AppSetting.key == key)
        existing = self.session.exec(statement).first()

        if existing:
            existing.value = value
            existing.updated_at = utc_now()
            self.session.add(existing)
            return

        self.session.add(
            AppSetting(
                key=key,
                value=value,
                updated_at=utc_now(),
            ),
        )

    @staticmethod
    def _sqlite_url_from_path(path_value: str) -> str:
        cleaned = path_value.strip()
        if cleaned.startswith("sqlite:///"):
            return cleaned
        return f"sqlite:///{cleaned}"

    @staticmethod
    def _sqlite_path_from_url(database_url: str) -> str:
        if database_url.startswith("sqlite:///"):
            return database_url.removeprefix("sqlite:///")
        return database_url
