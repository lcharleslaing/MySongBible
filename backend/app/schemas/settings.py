from pydantic import BaseModel, Field, field_validator


class AppDefinition(BaseModel):
    package_name: str
    app_version: str
    app_display_name: str
    sidebar_eyebrow: str
    sidebar_title: str
    sidebar_description: str
    topbar_eyebrow: str
    topbar_title: str
    home_eyebrow: str
    home_title: str
    home_description: str


class DeviceSettingsProfile(BaseModel):
    device_name: str
    whisper_cpp_binary: str | None = None
    whisper_model_path: str | None = None
    whisper_thread_count: int = Field(ge=1, le=64)
    tts_engine: str = Field(min_length=1, max_length=100)
    piper_binary: str | None = None
    piper_model_path: str | None = None
    audio_input_dir: str = Field(min_length=1)
    tts_output_dir: str = Field(min_length=1)
    tts_timeout_seconds: int = Field(gt=0)

    @field_validator("device_name")
    @classmethod
    def validate_device_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Device name is required.")
        if len(normalized) > 80:
            raise ValueError("Device name must be 80 characters or fewer.")
        return normalized

    @field_validator("tts_engine")
    @classmethod
    def validate_profile_tts_engine(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"mock", "piper"}:
            raise ValueError("TTS engine must be mock or piper.")
        return normalized


class DeviceProfileApplyRequest(BaseModel):
    device_name: str = Field(min_length=1, max_length=80)


class PublicSettingsResponse(BaseModel):
    app_name: str
    app_env: str
    app_definition: AppDefinition
    current_device_name: str
    selected_device_name: str
    device_profiles: list[DeviceSettingsProfile]
    database_url: str
    sqlite_database_path: str
    app_data_dir: str
    whisper_cpp_binary: str | None
    whisper_model_path: str | None
    whisper_thread_count: int
    audio_input_dir: str
    keep_uploaded_audio_files: bool
    default_stt_model: str | None
    tts_engine: str
    piper_binary: str | None = None
    piper_model_path: str | None = None
    tts_output_dir: str | None = None
    tts_timeout_seconds: int
    database_path_editable: bool = False
    database_path_note: str = "SQLite database path is startup-only. Change DATABASE_URL and restart the backend to use another database."


class SettingsUpdateRequest(BaseModel):
    whisper_cpp_binary: str | None = None
    whisper_model_path: str | None = None
    whisper_thread_count: int = Field(ge=1, le=64)
    tts_engine: str = Field(min_length=1, max_length=100)
    piper_binary: str | None = None
    piper_model_path: str | None = None
    audio_input_dir: str = Field(min_length=1)
    tts_output_dir: str = Field(min_length=1)
    tts_timeout_seconds: int = Field(gt=0)
    sqlite_database_path: str | None = Field(default=None, min_length=1)

    @field_validator("tts_engine")
    @classmethod
    def validate_tts_engine(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"mock", "piper"}:
            raise ValueError("TTS engine must be mock or piper.")
        return normalized


class AppDefinitionUpdateRequest(BaseModel):
    package_name: str = Field(min_length=1, max_length=214)
    app_version: str = Field(min_length=1, max_length=50)
    app_display_name: str = Field(min_length=1, max_length=80)
    sidebar_eyebrow: str = Field(min_length=1, max_length=80)
    sidebar_title: str = Field(min_length=1, max_length=80)
    sidebar_description: str = Field(min_length=1, max_length=180)
    topbar_eyebrow: str = Field(min_length=1, max_length=80)
    topbar_title: str = Field(min_length=1, max_length=80)
    home_eyebrow: str = Field(min_length=1, max_length=80)
    home_title: str = Field(min_length=1, max_length=120)
    home_description: str = Field(min_length=1, max_length=260)

    @field_validator("package_name")
    @classmethod
    def validate_package_name(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized or len(normalized) > 214:
            raise ValueError("Package name is required and must be 214 characters or fewer.")
        if not normalized[0].isalnum():
            raise ValueError("Package name must start with a letter or number.")
        allowed = set("abcdefghijklmnopqrstuvwxyz0123456789._-")
        if any(character not in allowed for character in normalized):
            raise ValueError("Package name may only contain lowercase letters, numbers, dots, underscores, and hyphens.")
        if ".." in normalized:
            raise ValueError("Package name cannot contain consecutive dots.")
        return normalized

    @field_validator("app_version")
    @classmethod
    def validate_version(cls, value: str) -> str:
        normalized = value.strip()
        parts = normalized.split(".")
        if len(parts) != 3 or any(not part.isdigit() for part in parts):
            raise ValueError("Version must use major.minor.patch format, for example 0.1.0.")
        return normalized

    @field_validator(
        "app_display_name",
        "sidebar_eyebrow",
        "sidebar_title",
        "sidebar_description",
        "topbar_eyebrow",
        "topbar_title",
        "home_eyebrow",
        "home_title",
        "home_description",
    )
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Value cannot be blank.")
        return normalized
