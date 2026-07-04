from pathlib import Path
from subprocess import CompletedProcess

import pytest

from app.core.config import Settings
from app.local_ai.tts.base import TtsEngineError, TtsSynthesisInput
from app.local_ai.tts.manager import TtsEngineManager
from app.local_ai.tts.piper import PiperEngine


def test_tts_manager_falls_back_to_mock_when_piper_not_available() -> None:
    manager = TtsEngineManager(Settings(tts_engine="piper"))
    engine = manager.resolve_engine()
    assert engine.engine_name == "mock"


def test_tts_manager_errors_when_explicit_piper_requested_without_config() -> None:
    manager = TtsEngineManager(Settings(tts_engine="mock"))
    with pytest.raises(TtsEngineError):
        manager.resolve_engine("piper")


def test_piper_engine_runs_safe_subprocess(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    binary_path = tmp_path / "piper"
    binary_path.write_text("", encoding="utf-8")
    model_path = tmp_path / "voice.onnx"
    model_path.write_text("", encoding="utf-8")
    output_path = tmp_path / "out.wav"

    captured: dict[str, object] = {}

    def fake_run(command: list[str], input: str, capture_output: bool, text: bool, check: bool) -> CompletedProcess[str]:
        captured["command"] = command
        captured["input"] = input
        output_path.write_bytes(b"wav")
        return CompletedProcess(command, 0, stdout="ok", stderr="")

    monkeypatch.setattr("app.local_ai.tts.piper.run", fake_run)

    engine = PiperEngine(
        Settings(
            piper_binary=binary_path,
            piper_model_path=model_path,
        ),
    )

    result = engine.synthesize(TtsSynthesisInput(text="hello"), output_path)

    assert result.audio_file_path == output_path
    assert captured["input"] == "hello"
    assert "--output_file" in captured["command"]
