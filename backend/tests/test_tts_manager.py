from pathlib import Path
from subprocess import CompletedProcess, TimeoutExpired

import pytest

from app.core.config import Settings
from app.local_ai.tts.base import TtsEngineError, TtsSynthesisInput
from app.local_ai.tts.manager import TtsEngineManager
from app.local_ai.tts.piper import PiperEngine


def test_tts_manager_errors_when_default_piper_not_available() -> None:
    manager = TtsEngineManager(Settings(tts_engine="piper"))
    with pytest.raises(TtsEngineError) as error:
        manager.resolve_engine()

    assert "Piper" in error.value.message


def test_tts_manager_uses_mock_when_configured() -> None:
    manager = TtsEngineManager(Settings(tts_engine="mock"))
    assert manager.resolve_engine().engine_name == "mock"


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

    def fake_run(
        command: list[str],
        input: str,
        capture_output: bool,
        text: bool,
        check: bool,
        timeout: int,
    ) -> CompletedProcess[str]:
        captured["command"] = command
        captured["input"] = input
        captured["timeout"] = timeout
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
    assert captured["timeout"] == 120
    assert "--output_file" in captured["command"]


def test_piper_engine_timeout_returns_structured_error(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    binary_path = tmp_path / "piper"
    binary_path.write_text("", encoding="utf-8")
    model_path = tmp_path / "voice.onnx"
    model_path.write_text("", encoding="utf-8")
    output_path = tmp_path / "out.wav"

    def timeout_run(*args: object, **kwargs: object) -> CompletedProcess[str]:
        raise TimeoutExpired(cmd=kwargs.get("args", args[0] if args else "piper"), timeout=1)

    monkeypatch.setattr("app.local_ai.tts.piper.run", timeout_run)
    engine = PiperEngine(
        Settings(
            piper_binary=binary_path,
            piper_model_path=model_path,
            tts_timeout_seconds=1,
        ),
    )

    with pytest.raises(TtsEngineError) as error:
        engine.synthesize(TtsSynthesisInput(text="hello"), output_path)

    assert error.value.status_code == 504
    assert "timed out" in error.value.message
