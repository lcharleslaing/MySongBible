from datetime import datetime, timezone
from pathlib import Path

from sqlmodel import Session, select

from app.core.config import Settings
from app.models.app_setting import AppSetting
from app.schemas.settings import PublicSettingsResponse, SettingsUpdateRequest


class StartupOnlySettingError(ValueError):
    pass


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SettingsService:
    def __init__(self, session: Session, base_settings: Settings) -> None:
        self.session = session
        self.base_settings = base_settings

    def get_public_settings(self) -> PublicSettingsResponse:
        overrides = self._get_overrides()

        database_url = self.base_settings.database_url
        whisper_cpp_binary = overrides.get(
            "whisper_cpp_binary",
            str(self.base_settings.whisper_cpp_binary) if self.base_settings.whisper_cpp_binary else None,
        )
        whisper_model_path = overrides.get(
            "whisper_model_path",
            str(self.base_settings.whisper_model_path) if self.base_settings.whisper_model_path else None,
        )
        whisper_thread_count = int(overrides.get("whisper_thread_count", self.base_settings.whisper_thread_count))
        audio_input_dir = overrides.get("audio_input_dir", str(self.base_settings.audio_input_dir))
        tts_engine = overrides.get("tts_engine", overrides.get("default_tts_engine", self.base_settings.tts_engine))
        piper_binary = overrides.get(
            "piper_binary",
            str(self.base_settings.piper_binary) if self.base_settings.piper_binary else None,
        )
        piper_model_path = overrides.get(
            "piper_model_path",
            str(self.base_settings.piper_model_path) if self.base_settings.piper_model_path else None,
        )
        tts_output_dir = overrides.get("tts_output_dir", str(self.base_settings.audio_tts_dir))

        return PublicSettingsResponse(
            app_name=self.base_settings.app_name,
            app_env=self.base_settings.app_env,
            database_url=database_url,
            sqlite_database_path=self._sqlite_path_from_url(database_url),
            app_data_dir=str(self.base_settings.app_data_dir),
            whisper_cpp_binary=whisper_cpp_binary,
            whisper_model_path=whisper_model_path,
            whisper_thread_count=whisper_thread_count,
            audio_input_dir=audio_input_dir,
            keep_uploaded_audio_files=self.base_settings.keep_uploaded_audio_files,
            default_stt_model=self.base_settings.default_stt_model,
            tts_engine=tts_engine,
            piper_binary=piper_binary,
            piper_model_path=piper_model_path,
            tts_output_dir=tts_output_dir,
        )

    def update_settings(self, payload: SettingsUpdateRequest) -> PublicSettingsResponse:
        requested_database_url = self._sqlite_url_from_path(payload.sqlite_database_path)
        if requested_database_url != self.base_settings.database_url:
            raise StartupOnlySettingError(
                "SQLite database path is startup-only. Update DATABASE_URL in the backend environment and restart the backend.",
            )

        updates = {
            "whisper_cpp_binary": payload.whisper_cpp_binary or "",
            "whisper_model_path": payload.whisper_model_path or "",
            "whisper_thread_count": str(payload.whisper_thread_count),
            "tts_engine": payload.tts_engine,
            "default_tts_engine": payload.tts_engine,
            "piper_binary": payload.piper_binary or "",
            "piper_model_path": payload.piper_model_path or "",
            "audio_input_dir": payload.audio_input_dir,
            "tts_output_dir": payload.tts_output_dir,
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
                "whisper_thread_count": public_settings.whisper_thread_count,
                "audio_input_dir_override": Path(public_settings.audio_input_dir),
                "tts_engine": public_settings.tts_engine,
                "piper_binary": Path(public_settings.piper_binary) if public_settings.piper_binary else None,
                "piper_model_path": Path(public_settings.piper_model_path) if public_settings.piper_model_path else None,
                "tts_output_dir": Path(public_settings.tts_output_dir) if public_settings.tts_output_dir else self.base_settings.audio_tts_dir,
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
