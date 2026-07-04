from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path


class TtsEngineError(Exception):
    def __init__(
        self,
        message: str,
        *,
        status_code: int = 400,
        stdout: str | None = None,
        stderr: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.stdout = stdout
        self.stderr = stderr


@dataclass
class TtsEngineCapabilities:
    supports_voice_profiles: bool = False
    supports_voice_cloning: bool = False
    output_extension: str = "wav"


@dataclass
class TtsSynthesisInput:
    text: str
    voice_profile: str | None = None


@dataclass
class TtsSynthesisResult:
    audio_file_path: Path
    engine_used: str
    status: str
    stdout: str = ""
    stderr: str = ""


class BaseTtsEngine(ABC):
    engine_name: str
    capabilities: TtsEngineCapabilities

    @abstractmethod
    def is_available(self) -> bool:
        raise NotImplementedError

    @abstractmethod
    def synthesize(self, request: TtsSynthesisInput, output_path: Path) -> TtsSynthesisResult:
        raise NotImplementedError
