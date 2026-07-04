from pathlib import Path
from subprocess import CompletedProcess, TimeoutExpired

import pytest

from app.core.config import Settings
from app.local_ai.stt.whisper_cpp import WhisperCppError, WhisperCppTranscriber


def test_whisper_transcriber_validates_missing_binary(tmp_path: Path) -> None:
    model_path = tmp_path / "model.bin"
    model_path.write_text("model", encoding="utf-8")
    audio_path = tmp_path / "audio.wav"
    audio_path.write_bytes(b"audio")

    transcriber = WhisperCppTranscriber(
        Settings(
            whisper_cpp_binary=tmp_path / "missing-whisper-cli",
            whisper_model_path=model_path,
        ),
    )

    with pytest.raises(WhisperCppError) as error:
        transcriber.transcribe(audio_path)

    assert "WHISPER_CPP_BINARY" in error.value.message


def test_whisper_transcriber_reads_output_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    binary_path = tmp_path / "whisper-cli"
    binary_path.write_text("", encoding="utf-8")
    model_path = tmp_path / "model.bin"
    model_path.write_text("model", encoding="utf-8")
    audio_path = tmp_path / "audio.wav"
    audio_path.write_bytes(b"audio")

    def fake_run(command: list[str], capture_output: bool, text: bool, check: bool, timeout: int) -> CompletedProcess[str]:
        output_index = command.index("--output-file") + 1
        output_prefix = Path(command[output_index])
        output_prefix.with_suffix(".txt").write_text("transcribed text", encoding="utf-8")
        assert timeout == 120
        return CompletedProcess(command, 0, stdout="stdout", stderr="")

    monkeypatch.setattr("app.local_ai.stt.whisper_cpp.run", fake_run)

    transcriber = WhisperCppTranscriber(
        Settings(
            whisper_cpp_binary=binary_path,
            whisper_model_path=model_path,
            whisper_thread_count=3,
        ),
    )

    result = transcriber.transcribe(audio_path, language="en")

    assert result.text == "transcribed text"
    assert "--threads" in result.command
    assert "3" in result.command
    assert "--no-gpu" in result.command
    assert "--language" in result.command


def test_whisper_transcriber_raises_on_nonzero_exit(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    binary_path = tmp_path / "whisper-cli"
    binary_path.write_text("", encoding="utf-8")
    model_path = tmp_path / "model.bin"
    model_path.write_text("model", encoding="utf-8")
    audio_path = tmp_path / "audio.wav"
    audio_path.write_bytes(b"audio")

    def fake_run(command: list[str], capture_output: bool, text: bool, check: bool, timeout: int) -> CompletedProcess[str]:
        return CompletedProcess(command, 1, stdout="bad stdout", stderr="bad stderr")

    monkeypatch.setattr("app.local_ai.stt.whisper_cpp.run", fake_run)

    transcriber = WhisperCppTranscriber(
        Settings(
            whisper_cpp_binary=binary_path,
            whisper_model_path=model_path,
        ),
    )

    with pytest.raises(WhisperCppError) as error:
        transcriber.transcribe(audio_path)

    assert error.value.status_code == 502
    assert error.value.stderr == "bad stderr"


def test_whisper_transcriber_timeout_returns_structured_error(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    binary_path = tmp_path / "whisper-cli"
    binary_path.write_text("", encoding="utf-8")
    model_path = tmp_path / "model.bin"
    model_path.write_text("model", encoding="utf-8")
    audio_path = tmp_path / "audio.wav"
    audio_path.write_bytes(b"audio")

    def fake_run(command: list[str], capture_output: bool, text: bool, check: bool, timeout: int) -> CompletedProcess[str]:
        raise TimeoutExpired(cmd=command, timeout=timeout)

    monkeypatch.setattr("app.local_ai.stt.whisper_cpp.run", fake_run)
    transcriber = WhisperCppTranscriber(
        Settings(
            whisper_cpp_binary=binary_path,
            whisper_model_path=model_path,
            whisper_timeout_seconds=1,
        ),
    )

    with pytest.raises(WhisperCppError) as error:
        transcriber.transcribe(audio_path)

    assert error.value.status_code == 504
    assert "timed out" in error.value.message
