from io import BytesIO
from pathlib import Path
from subprocess import CompletedProcess


from app.api.dependencies import get_app_settings, get_whisper_cpp_transcriber
from app.core.config import Settings
from app.local_ai.stt.whisper_cpp import WhisperCppTranscriptionResult


class FakeWhisperCppTranscriber:
    def __init__(self) -> None:
        self.last_audio_path: Path | None = None
        self.last_language: str | None = None

    def transcribe(self, audio_file_path: Path, language: str | None = None) -> WhisperCppTranscriptionResult:
        self.last_audio_path = audio_file_path
        self.last_language = language
        return WhisperCppTranscriptionResult(
            text="mock transcript text",
            stdout="ok",
            stderr="",
            command=["whisper-cli"],
        )


def test_stt_transcribe_upload_persists_audio_and_transcript(client, tmp_path: Path) -> None:
    fake_transcriber = FakeWhisperCppTranscriber()

    async def override_settings() -> Settings:
        return Settings(
            app_data_dir=tmp_path / "app-data",
            database_url=f"sqlite:///{tmp_path / 'test.sqlite3'}",
            whisper_cpp_binary=tmp_path / "whisper-cli",
            whisper_model_path=tmp_path / "ggml-base.en.bin",
            whisper_thread_count=2,
            keep_uploaded_audio_files=True,
        )

    client.app.dependency_overrides[get_app_settings] = override_settings
    async def override_transcriber() -> FakeWhisperCppTranscriber:
        return fake_transcriber

    client.app.dependency_overrides[get_whisper_cpp_transcriber] = override_transcriber

    response = client.post(
        "/api/stt/transcribe",
        files={"audio_file": ("sample.wav", BytesIO(b"RIFFmock"), "audio/wav")},
        data={"language": "en"},
    )

    client.app.dependency_overrides.pop(get_app_settings, None)
    client.app.dependency_overrides.pop(get_whisper_cpp_transcriber, None)

    assert response.status_code == 201
    payload = response.json()
    assert payload["transcript_text"] == "mock transcript text"
    assert payload["source_audio_name"] == "sample.wav"
    assert payload["source_audio_path"] is not None
    assert fake_transcriber.last_audio_path is not None
    assert fake_transcriber.last_audio_path.exists()
    assert fake_transcriber.last_language == "en"


def test_stt_transcribe_accepts_recorded_webm_and_converts_to_wav(client, tmp_path: Path, monkeypatch) -> None:
    fake_transcriber = FakeWhisperCppTranscriber()

    def fake_run(command, **kwargs):
        output_path = Path(command[-1])
        output_path.write_bytes(b"RIFFconverted")
        return CompletedProcess(command, 0, stdout="", stderr="")

    monkeypatch.setattr("app.services.stt.shutil.which", lambda name: "/usr/bin/ffmpeg" if name == "ffmpeg" else None)
    monkeypatch.setattr("app.services.stt.run", fake_run)

    async def override_settings() -> Settings:
        return Settings(
            app_data_dir=tmp_path / "app-data",
            database_url=f"sqlite:///{tmp_path / 'test.sqlite3'}",
            whisper_cpp_binary=tmp_path / "whisper-cli",
            whisper_model_path=tmp_path / "ggml-base.en.bin",
            keep_uploaded_audio_files=True,
        )

    client.app.dependency_overrides[get_app_settings] = override_settings
    async def override_transcriber() -> FakeWhisperCppTranscriber:
        return fake_transcriber

    client.app.dependency_overrides[get_whisper_cpp_transcriber] = override_transcriber

    response = client.post(
        "/api/stt/transcribe",
        files={"audio_file": ("voice-lab-recording.webm", BytesIO(b"webm"), "audio/webm")},
    )

    client.app.dependency_overrides.pop(get_app_settings, None)
    client.app.dependency_overrides.pop(get_whisper_cpp_transcriber, None)

    assert response.status_code == 201
    payload = response.json()
    assert payload["source_audio_name"] == "voice-lab-recording.webm"
    assert fake_transcriber.last_audio_path is not None
    assert fake_transcriber.last_audio_path.suffix == ".wav"
    assert not fake_transcriber.last_audio_path.exists()


def test_stt_transcribe_converts_uploaded_mp3_to_wav(client, tmp_path: Path, monkeypatch) -> None:
    fake_transcriber = FakeWhisperCppTranscriber()

    def fake_run(command, **kwargs):
        output_path = Path(command[-1])
        output_path.write_bytes(b"RIFFconverted")
        return CompletedProcess(command, 0, stdout="", stderr="")

    monkeypatch.setattr("app.services.stt.shutil.which", lambda name: "/usr/bin/ffmpeg" if name == "ffmpeg" else None)
    monkeypatch.setattr("app.services.stt.run", fake_run)

    async def override_settings() -> Settings:
        return Settings(
            app_data_dir=tmp_path / "app-data",
            database_url=f"sqlite:///{tmp_path / 'test.sqlite3'}",
            whisper_cpp_binary=tmp_path / "whisper-cli",
            whisper_model_path=tmp_path / "ggml-base.en.bin",
            keep_uploaded_audio_files=True,
        )

    client.app.dependency_overrides[get_app_settings] = override_settings

    async def override_transcriber() -> FakeWhisperCppTranscriber:
        return fake_transcriber

    client.app.dependency_overrides[get_whisper_cpp_transcriber] = override_transcriber

    response = client.post(
        "/api/stt/transcribe",
        files={"audio_file": ("journal.mp3", BytesIO(b"mp3"), "audio/mpeg")},
    )

    client.app.dependency_overrides.pop(get_app_settings, None)
    client.app.dependency_overrides.pop(get_whisper_cpp_transcriber, None)

    assert response.status_code == 201
    assert fake_transcriber.last_audio_path is not None
    assert fake_transcriber.last_audio_path.suffix == ".wav"
    assert not fake_transcriber.last_audio_path.exists()


def test_stt_transcribe_returns_error_payload(client, tmp_path: Path) -> None:
    from app.local_ai.stt.whisper_cpp import WhisperCppError

    class FailingTranscriber:
        def transcribe(self, audio_file_path: Path, language: str | None = None) -> WhisperCppTranscriptionResult:
            raise WhisperCppError(
                "whisper failure",
                status_code=502,
                stdout="stdout text",
                stderr="stderr text",
            )

    async def override_settings() -> Settings:
        return Settings(
            app_data_dir=tmp_path / "app-data",
            database_url=f"sqlite:///{tmp_path / 'test.sqlite3'}",
            whisper_cpp_binary=tmp_path / "whisper-cli",
            whisper_model_path=tmp_path / "ggml-base.en.bin",
        )

    client.app.dependency_overrides[get_app_settings] = override_settings
    async def override_transcriber() -> FailingTranscriber:
        return FailingTranscriber()

    client.app.dependency_overrides[get_whisper_cpp_transcriber] = override_transcriber

    response = client.post(
        "/api/stt/transcribe",
        files={"audio_file": ("sample.wav", BytesIO(b"RIFFmock"), "audio/wav")},
    )

    client.app.dependency_overrides.pop(get_app_settings, None)
    client.app.dependency_overrides.pop(get_whisper_cpp_transcriber, None)

    assert response.status_code == 502
    detail = response.json()["detail"]
    assert detail["message"] == "whisper failure"
    assert detail["stdout"] == "stdout text"
    assert detail["stderr"] == "stderr text"


def test_stt_transcribe_rejects_unsupported_file_type(client) -> None:
    response = client.post(
        "/api/stt/transcribe",
        files={"audio_file": ("sample.txt", BytesIO(b"text"), "text/plain")},
    )

    assert response.status_code == 400
    assert "Unsupported audio file extension" in response.json()["detail"]


def test_stt_transcribe_rejects_oversized_upload(client, tmp_path: Path) -> None:
    fake_transcriber = FakeWhisperCppTranscriber()

    async def override_settings() -> Settings:
        return Settings(
            app_data_dir=tmp_path / "app-data",
            database_url=f"sqlite:///{tmp_path / 'test.sqlite3'}",
            whisper_cpp_binary=tmp_path / "whisper-cli",
            whisper_model_path=tmp_path / "ggml-base.en.bin",
            max_upload_size_bytes=4,
        )

    client.app.dependency_overrides[get_app_settings] = override_settings
    async def override_transcriber() -> FakeWhisperCppTranscriber:
        return fake_transcriber

    client.app.dependency_overrides[get_whisper_cpp_transcriber] = override_transcriber

    response = client.post(
        "/api/stt/transcribe",
        files={"audio_file": ("sample.wav", BytesIO(b"RIFFmock"), "audio/wav")},
    )

    client.app.dependency_overrides.pop(get_app_settings, None)
    client.app.dependency_overrides.pop(get_whisper_cpp_transcriber, None)

    assert response.status_code == 413
    assert "exceeds" in response.json()["detail"]
