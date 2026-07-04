from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path


@dataclass
class VoiceCloneEngineResponse:
    supported: bool
    engine_name: str
    message: str


class VoiceCloneEngine(ABC):
    engine_name: str

    @abstractmethod
    def status(self) -> VoiceCloneEngineResponse:
        raise NotImplementedError

    @abstractmethod
    def create_profile(self, name: str, reference_audio_path: Path, model_path: Path | None = None) -> VoiceCloneEngineResponse:
        raise NotImplementedError


class ReferenceAudioManager:
    def validate_reference_audio_path(self, reference_audio_path: str) -> Path:
        path = Path(reference_audio_path).expanduser()
        if not path.exists():
            raise ValueError(f"Reference audio path does not exist: {reference_audio_path}")
        if not path.is_file():
            raise ValueError(f"Reference audio path is not a file: {reference_audio_path}")
        return path
