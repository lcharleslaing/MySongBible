from dataclasses import dataclass
import os
from pathlib import Path


APP_DIRECTORY_NAME = "My Song Bible"


def default_runtime_root() -> Path:
    override = os.getenv("APP_DATA_DIR")
    if override:
        return Path(override).expanduser().resolve()
    return (Path.home() / ".config" / APP_DIRECTORY_NAME).resolve()


@dataclass(frozen=True)
class RuntimePaths:
    root: Path

    @property
    def database(self) -> Path:
        return self.root / "database"

    @property
    def logs(self) -> Path:
        return self.root / "logs"

    @property
    def audio_originals(self) -> Path:
        return self.root / "audio" / "originals"

    @property
    def audio_generated(self) -> Path:
        return self.root / "audio" / "generated"

    @property
    def transcripts(self) -> Path:
        return self.root / "transcripts"

    @property
    def settings(self) -> Path:
        return self.root / "settings"

    @property
    def app_lock_config(self) -> Path:
        return self.settings / "app-lock.json"

    @property
    def profiles(self) -> Path:
        return self.root / "profiles"

    @property
    def generated(self) -> Path:
        return self.root / "generated"

    @property
    def voice_trigger_images(self) -> Path:
        return self.root / "listen-commands" / "images"

    def create(self) -> None:
        for directory in (
            self.root, self.database, self.logs, self.audio_originals,
            self.audio_generated, self.transcripts, self.settings,
            self.profiles, self.generated, self.voice_trigger_images,
        ):
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)


def runtime_paths(root: Path | None = None) -> RuntimePaths:
    return RuntimePaths((root or default_runtime_root()).expanduser().resolve())


def safe_child(directory: Path, filename: str) -> Path:
    safe_name = Path(filename).name
    if not safe_name or safe_name in {".", ".."} or safe_name != filename:
        raise ValueError("Invalid filename; path traversal is not allowed.")
    candidate = (directory / safe_name).resolve()
    if candidate.parent != directory.resolve():
        raise ValueError("Invalid filename; path traversal is not allowed.")
    return candidate
