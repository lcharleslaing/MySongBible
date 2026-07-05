from datetime import datetime, timezone
import json
from pathlib import Path

from sqlmodel import Session, select

from app.core.config import Settings
from app.models.app_setting import AppSetting
from app.schemas.settings import AppDefinition, AppDefinitionUpdateRequest, PublicSettingsResponse, SettingsUpdateRequest


class StartupOnlySettingError(ValueError):
    pass


class AppDefinitionApplyError(ValueError):
    pass


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


PROJECT_ROOT = Path(__file__).resolve().parents[3]

APP_DEFINITION_DEFAULTS = {
    "package_name": "apptemplatebase",
    "app_version": "0.1.0",
    "app_display_name": "AppTemplateBase",
    "sidebar_eyebrow": "AppTemplateBase",
    "sidebar_title": "Desktop Starter",
    "sidebar_description": "Local-first shell for voice-enabled desktop apps.",
    "topbar_eyebrow": "Local-First Workspace",
    "topbar_title": "Frontend Starter",
    "home_eyebrow": "Overview",
    "home_title": "Reusable local-first desktop starter",
    "home_description": "This frontend is a clean launch surface for future desktop apps built on Electron, React, FastAPI, SQLite, and local voice tooling.",
}


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
        tts_timeout_seconds = int(overrides.get("tts_timeout_seconds", self.base_settings.tts_timeout_seconds))

        return PublicSettingsResponse(
            app_name=self.base_settings.app_name,
            app_env=self.base_settings.app_env,
            app_definition=self._get_app_definition(overrides),
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
            tts_timeout_seconds=tts_timeout_seconds,
        )

    def update_settings(self, payload: SettingsUpdateRequest) -> PublicSettingsResponse:
        requested_database_url = self._sqlite_url_from_path(payload.sqlite_database_path) if payload.sqlite_database_path else None
        if requested_database_url and requested_database_url != self.base_settings.database_url:
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
            "tts_timeout_seconds": str(payload.tts_timeout_seconds),
        }

        for key, value in updates.items():
            self._upsert_setting(key, value)

        self.session.commit()
        return self.get_public_settings()

    def update_app_definition(self, payload: AppDefinitionUpdateRequest) -> PublicSettingsResponse:
        values = payload.model_dump()
        for key, value in values.items():
            self._upsert_setting(f"app_definition.{key}", str(value))

        self._apply_app_definition_to_project_files(AppDefinition(**values))
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
                "tts_timeout_seconds": public_settings.tts_timeout_seconds,
            }
        )

    def _get_overrides(self) -> dict[str, str]:
        statement = select(AppSetting)
        settings = self.session.exec(statement).all()
        return {item.key: item.value for item in settings}

    def _get_app_definition(self, overrides: dict[str, str]) -> AppDefinition:
        root_package = self._read_json_file(PROJECT_ROOT / "package.json")
        frontend_package = self._read_json_file(PROJECT_ROOT / "frontend" / "package.json")
        values = {
            **APP_DEFINITION_DEFAULTS,
            "package_name": str(root_package.get("name") or APP_DEFINITION_DEFAULTS["package_name"]),
            "app_version": str(root_package.get("version") or frontend_package.get("version") or APP_DEFINITION_DEFAULTS["app_version"]),
        }

        for key in APP_DEFINITION_DEFAULTS:
            override_value = overrides.get(f"app_definition.{key}")
            if override_value:
                values[key] = override_value

        return AppDefinition(**values)

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

    def _apply_app_definition_to_project_files(self, definition: AppDefinition) -> None:
        package_name = definition.package_name
        frontend_package_name = f"{package_name}-frontend"
        version = definition.app_version

        self._update_json_file(PROJECT_ROOT / "package.json", {"name": package_name, "version": version})
        self._update_json_file(PROJECT_ROOT / "frontend" / "package.json", {"name": frontend_package_name, "version": version})
        self._update_package_lock(PROJECT_ROOT / "package-lock.json", package_name, version, frontend_package_name)
        self._update_package_lock(PROJECT_ROOT / "frontend" / "package-lock.json", frontend_package_name, version)
        self._replace_html_title(PROJECT_ROOT / "frontend" / "index.html", definition.app_display_name)
        self._update_env_key(PROJECT_ROOT / ".env.example", "APP_NAME", definition.app_display_name)
        self._update_env_key(PROJECT_ROOT / "backend" / ".env.example", "APP_NAME", f"{definition.app_display_name} Backend")
        self._replace_readme_title(PROJECT_ROOT / "README.md", definition.app_display_name)

    @staticmethod
    def _read_json_file(path_value: Path) -> dict[str, object]:
        if not path_value.exists():
            return {}
        try:
            return json.loads(path_value.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}

    @staticmethod
    def _update_json_file(path_value: Path, updates: dict[str, str]) -> None:
        if not path_value.exists():
            raise AppDefinitionApplyError(f"Expected project file was not found: {path_value}")
        data = json.loads(path_value.read_text(encoding="utf-8"))
        data.update(updates)
        path_value.write_text(f"{json.dumps(data, indent=2)}\n", encoding="utf-8")

    @staticmethod
    def _update_package_lock(
        path_value: Path,
        package_name: str,
        version: str,
        frontend_package_name: str | None = None,
    ) -> None:
        if not path_value.exists():
            return
        data = json.loads(path_value.read_text(encoding="utf-8"))
        data["name"] = package_name
        data["version"] = version
        packages = data.get("packages")
        if isinstance(packages, dict):
            root_package = packages.get("")
            if isinstance(root_package, dict):
                root_package["name"] = package_name
                root_package["version"] = version
            frontend_package = packages.get("frontend")
            if frontend_package_name and isinstance(frontend_package, dict):
                frontend_package["name"] = frontend_package_name
                frontend_package["version"] = version
        path_value.write_text(f"{json.dumps(data, indent=2)}\n", encoding="utf-8")

    @staticmethod
    def _replace_html_title(path_value: Path, title: str) -> None:
        if not path_value.exists():
            raise AppDefinitionApplyError(f"Expected project file was not found: {path_value}")
        content = path_value.read_text(encoding="utf-8")
        start = content.find("<title>")
        end = content.find("</title>")
        if start == -1 or end == -1 or end < start:
            raise AppDefinitionApplyError(f"Could not find an HTML title in {path_value}")
        next_content = f"{content[:start]}<title>{title}</title>{content[end + len('</title>'):]}"
        path_value.write_text(next_content, encoding="utf-8")

    @staticmethod
    def _update_env_key(path_value: Path, key: str, value: str) -> None:
        if not path_value.exists():
            raise AppDefinitionApplyError(f"Expected project file was not found: {path_value}")
        lines = path_value.read_text(encoding="utf-8").splitlines()
        prefix = f"{key}="
        for index, line in enumerate(lines):
            if line.startswith(prefix):
                lines[index] = f"{key}={value}"
                path_value.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
                return
        lines.append(f"{key}={value}")
        path_value.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")

    @staticmethod
    def _replace_readme_title(path_value: Path, title: str) -> None:
        if not path_value.exists():
            return
        lines = path_value.read_text(encoding="utf-8").splitlines()
        if not lines:
            return
        if lines[0].startswith("# "):
            lines[0] = f"# {title}"
            path_value.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")

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
