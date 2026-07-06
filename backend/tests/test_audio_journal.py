from io import BytesIO
import asyncio
import math
from pathlib import Path
from subprocess import CompletedProcess
import struct
import wave

import pytest
from fastapi import HTTPException
from fastapi.responses import FileResponse
from sqlmodel import Session

from app.api.dependencies import get_app_settings
from app.api.routes.audio_journal import get_audio_journal_take_audio, get_audio_journal_transcription_service
from app.core.config import Settings
from app.local_ai.stt.whisper_cpp import WhisperCppError, WhisperCppTranscriptionResult
from app.models.audio_journal import AudioJournalTake
from app.services.audio_journal import AudioJournalService


def wav_bytes(*, duration_seconds: float = 10, sample_rate: int = 16000, amplitude: float = 0.35) -> bytes:
    buffer = BytesIO()
    frame_count = int(duration_seconds * sample_rate)
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        frames = bytearray()
        for index in range(frame_count):
            value = int(max(-1.0, min(1.0, amplitude * math.sin(2 * math.pi * 220 * index / sample_rate))) * 32767)
            frames.extend(struct.pack("<h", value))
        wav_file.writeframes(bytes(frames))
    return buffer.getvalue()


def clipped_wav_bytes(*, duration_seconds: float = 10, sample_rate: int = 16000) -> bytes:
    buffer = BytesIO()
    frame_count = int(duration_seconds * sample_rate)
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(struct.pack("<h", 32767) * frame_count)
    return buffer.getvalue()


def paused_speech_wav_bytes(*, duration_seconds: float = 10, sample_rate: int = 16000) -> bytes:
    buffer = BytesIO()
    frame_count = int(duration_seconds * sample_rate)
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        frames = bytearray()
        for index in range(frame_count):
            second_fraction = (index % sample_rate) / sample_rate
            if second_fraction < 0.5:
                value = int(0.3 * math.sin(2 * math.pi * 220 * index / sample_rate) * 32767)
            else:
                value = 0
            frames.extend(struct.pack("<h", value))
        wav_file.writeframes(bytes(frames))
    return buffer.getvalue()


def override_settings_for_audio_journal(tmp_path: Path):
    async def override_settings() -> Settings:
        return Settings(
            app_data_dir=tmp_path / "app-data",
            database_url=f"sqlite:///{tmp_path / 'test.sqlite3'}",
            whisper_cpp_binary=tmp_path / "whisper-cli",
            whisper_model_path=tmp_path / "ggml-base.en.bin",
        )

    return override_settings


def create_entry(client, tmp_path: Path, *, audio: bytes | None = None, filename: str = "journal.wav", transcript_text: str | None = None):
    client.app.dependency_overrides[get_app_settings] = override_settings_for_audio_journal(tmp_path)
    data = {"title": "Morning note"}
    if transcript_text is not None:
        data["script_text"] = transcript_text
    response = client.post(
        "/api/audio-journal",
        files={"audio_file": (filename, BytesIO(audio or wav_bytes()), "audio/wav")},
        data=data,
    )
    assert response.status_code == 201
    return response.json()


class FakeWhisperTranscriber:
    def __init__(self, text: str = "mock journal transcript", error: WhisperCppError | None = None) -> None:
        self.text = text
        self.error = error
        self.last_audio_path: Path | None = None
        self.last_language: str | None = None

    def transcribe(self, audio_file_path: Path, language: str | None = None) -> WhisperCppTranscriptionResult:
        self.last_audio_path = audio_file_path
        self.last_language = language
        if self.error:
            raise self.error
        return WhisperCppTranscriptionResult(
            text=self.text,
            stdout="ok",
            stderr="",
            command=["whisper-cli"],
        )


def override_transcription_service(client, tmp_path: Path, transcriber: FakeWhisperTranscriber):
    async def override_service():
        with Session(client.engine) as session:
            yield AudioJournalService(
                session=session,
                settings=Settings(
                    app_data_dir=tmp_path / "app-data",
                    whisper_model_path=tmp_path / "ggml-base.en.bin",
                ),
                transcriber=transcriber,
            )

    client.app.dependency_overrides[get_audio_journal_transcription_service] = override_service


def transcribe_take(client, tmp_path: Path, entry_id: int, take_id: int, transcriber: FakeWhisperTranscriber):
    override_transcription_service(client, tmp_path, transcriber)
    response = client.post(f"/api/audio-journal/{entry_id}/takes/{take_id}/transcribe")
    client.app.dependency_overrides.pop(get_audio_journal_transcription_service, None)
    return response


def test_audio_journal_create_entry_from_upload_creates_active_take(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path)

    entry = payload["entry"]
    take = payload["take"]
    assert entry["title"] == "Morning note"
    assert take["take_number"] == 1
    assert take["take_type"] == "original"
    assert take["is_active"] is True
    assert take["audio_path"]
    assert Path(take["audio_path"]).exists()
    assert "/originals/" in take["audio_path"]


def test_audio_journal_lists_and_gets_entry_with_takes(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path)
    entry_id = payload["entry"]["id"]

    list_response = client.get("/api/audio-journal")
    assert list_response.status_code == 200
    assert len(list_response.json()["items"]) == 1

    get_response = client.get(f"/api/audio-journal/{entry_id}")
    assert get_response.status_code == 200
    entry = get_response.json()
    assert entry["id"] == entry_id
    assert len(entry["takes"]) == 1


def test_audio_journal_create_import_and_rerecord_takes_increment_and_preserve_entry_dates(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path)
    entry_id = payload["entry"]["id"]
    original_created_at = payload["entry"]["created_at"]
    original_journal_date = payload["entry"]["journal_date"]

    import_response = client.post(
        f"/api/audio-journal/{entry_id}/takes",
        files={"audio_file": ("import.wav", BytesIO(wav_bytes()), "audio/wav")},
        data={"take_type": "import"},
    )
    rerecord_response = client.post(
        f"/api/audio-journal/{entry_id}/takes",
        files={"audio_file": ("rerecord.wav", BytesIO(wav_bytes()), "audio/wav")},
        data={"take_type": "rerecord"},
    )

    assert import_response.status_code == 201
    assert rerecord_response.status_code == 201
    assert import_response.json()["take_number"] == 2
    assert "/imports/" in import_response.json()["audio_path"]
    assert rerecord_response.json()["take_number"] == 3
    assert "/rerecords/" in rerecord_response.json()["audio_path"]

    entry_response = client.get(f"/api/audio-journal/{entry_id}")
    entry = entry_response.json()
    assert entry["created_at"] == original_created_at
    assert entry["journal_date"] == original_journal_date
    assert len(entry["takes"]) == 3


def test_audio_journal_set_active_take_clears_previous_active(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path)
    entry_id = payload["entry"]["id"]
    second_response = client.post(
        f"/api/audio-journal/{entry_id}/takes",
        files={"audio_file": ("import.wav", BytesIO(wav_bytes()), "audio/wav")},
        data={"take_type": "import"},
    )
    second_take_id = second_response.json()["id"]

    active_response = client.post(f"/api/audio-journal/{entry_id}/takes/{second_take_id}/set-active")
    assert active_response.status_code == 200
    assert active_response.json()["is_active"] is True

    takes_response = client.get(f"/api/audio-journal/{entry_id}/takes")
    active_flags = {take["take_number"]: take["is_active"] for take in takes_response.json()}
    assert active_flags == {1: False, 2: True}


def test_audio_journal_updates_entry_script_text(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path)
    entry_id = payload["entry"]["id"]

    response = client.patch(f"/api/audio-journal/{entry_id}", json={"script_text": "Edited script"})

    assert response.status_code == 200
    assert response.json()["script_text"] == "Edited script"


def test_audio_journal_deletes_take_metadata(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path)
    entry_id = payload["entry"]["id"]
    take_id = payload["take"]["id"]

    response = client.delete(f"/api/audio-journal/{entry_id}/takes/{take_id}")

    assert response.status_code == 204
    takes_response = client.get(f"/api/audio-journal/{entry_id}/takes")
    assert takes_response.json() == []


def test_audio_journal_analyzes_simple_generated_wav(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path, transcript_text="A clean local journal transcript.")
    entry_id = payload["entry"]["id"]
    take_id = payload["take"]["id"]

    response = client.post(f"/api/audio-journal/{entry_id}/takes/{take_id}/analyze-quality")

    assert response.status_code == 200
    take = response.json()
    assert take["file_format"] == "wav"
    assert take["duration_seconds"] >= 9
    assert take["sample_rate"] == 16000
    assert take["channels"] == 1
    assert take["quality_status"] == "usable"


def test_audio_journal_detects_clipping_on_generated_wav(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path, audio=clipped_wav_bytes())
    take = payload["take"]

    assert take["clipping_detected"] is True
    assert take["quality_status"] == "rejected"


def test_audio_journal_short_duration_returns_review(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path, audio=wav_bytes(duration_seconds=1))
    take = payload["take"]

    assert take["quality_status"] in {"review", "rejected"}
    assert "duration_under_5_seconds" in take["quality_reasons_json"]


def test_audio_journal_paused_home_recording_remains_usable(client, tmp_path: Path) -> None:
    payload = create_entry(
        client,
        tmp_path,
        audio=paused_speech_wav_bytes(),
        transcript_text="A clean journal recording with normal pauses.",
    )
    take = payload["take"]

    assert take["quality_status"] == "usable"
    assert "moderate_silence_ratio" in take["quality_reasons_json"]


def test_audio_journal_non_wav_returns_review_when_ffmpeg_missing(client, tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("app.services.audio_quality.shutil.which", lambda name: None)

    payload = create_entry(client, tmp_path, audio=b"not really webm", filename="journal.webm")
    take = payload["take"]

    assert take["file_format"] == "webm"
    assert take["quality_status"] == "review"
    assert "non_wav_analysis_requires_ffmpeg" in take["quality_reasons_json"]


def test_audio_journal_non_wav_converts_for_quality_analysis(client, tmp_path: Path, monkeypatch) -> None:
    def fake_run(command, **kwargs):
        output_path = Path(command[-1])
        output_path.write_bytes(wav_bytes())
        return CompletedProcess(command, 0, stdout="", stderr="")

    monkeypatch.setattr("app.services.audio_quality.shutil.which", lambda name: "/usr/bin/ffmpeg" if name == "ffmpeg" else None)
    monkeypatch.setattr("app.services.audio_quality.run", fake_run)

    payload = create_entry(
        client,
        tmp_path,
        audio=b"mp3",
        filename="journal.mp3",
        transcript_text="A clear converted journal recording.",
    )
    take = payload["take"]

    assert take["file_format"] == "mp3"
    assert take["quality_status"] == "usable"


def test_audio_journal_audio_route_serves_file(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path)
    entry_id = payload["entry"]["id"]
    take_id = payload["take"]["id"]

    with Session(client.engine) as session:
        service = AudioJournalService(
            session=session,
            settings=Settings(app_data_dir=tmp_path / "app-data"),
        )
        response = asyncio.run(get_audio_journal_take_audio(entry_id, take_id, service))  # type: ignore[arg-type]

    assert isinstance(response, FileResponse)
    assert response.media_type == "audio/wav"
    assert Path(response.path).read_bytes().startswith(b"RIFF")


def test_audio_journal_audio_route_blocks_unsafe_path(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path)
    entry_id = payload["entry"]["id"]
    take_id = payload["take"]["id"]

    with Session(client.engine) as session:
        take = session.get(AudioJournalTake, take_id)
        assert take is not None
        take.audio_path = "/etc/passwd"
        session.add(take)
        session.commit()

    with Session(client.engine) as session:
        service = AudioJournalService(
            session=session,
            settings=Settings(app_data_dir=tmp_path / "app-data"),
        )
        with pytest.raises(HTTPException) as error:
            asyncio.run(get_audio_journal_take_audio(entry_id, take_id, service))  # type: ignore[arg-type]

    assert error.value.status_code == 400


def test_audio_journal_training_candidate_requires_text_without_manual_override(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path)
    entry_id = payload["entry"]["id"]
    take_id = payload["take"]["id"]

    response = client.patch(
        f"/api/audio-journal/{entry_id}/takes/{take_id}/training-candidate",
        json={"is_training_candidate": True},
    )

    assert response.status_code == 400


def test_audio_journal_quality_usable_with_transcript_marks_training_candidate(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path)
    entry_id = payload["entry"]["id"]
    take_id = payload["take"]["id"]

    update_response = client.patch(
        f"/api/audio-journal/{entry_id}/takes/{take_id}",
        json={"transcript_text": "This is a usable transcript.", "transcript_source": "manual"},
    )

    assert update_response.status_code == 200
    assert update_response.json()["quality_status"] == "usable"
    assert update_response.json()["is_training_candidate"] is True


def test_audio_journal_transcribe_updates_take_transcript_status_and_engine(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path)
    entry_id = payload["entry"]["id"]
    take_id = payload["take"]["id"]

    response = transcribe_take(client, tmp_path, entry_id, take_id, FakeWhisperTranscriber("Today I recorded a local journal."))

    assert response.status_code == 200
    take = response.json()["take"]
    assert take["transcript_text"] == "Today I recorded a local journal."
    assert take["transcription_status"] == "completed"
    assert take["transcription_engine"] == "whisper.cpp"
    assert take["transcription_model"] == "ggml-base.en.bin"


def test_audio_journal_transcribe_converts_non_wav_take_before_whisper(client, tmp_path: Path, monkeypatch) -> None:
    payload = create_entry(client, tmp_path, audio=b"mp3", filename="journal.mp3")
    entry_id = payload["entry"]["id"]
    take_id = payload["take"]["id"]
    transcriber = FakeWhisperTranscriber("Converted audio transcript.")

    def fake_run(command, **kwargs):
        output_path = Path(command[-1])
        output_path.write_bytes(b"RIFFconverted")
        return CompletedProcess(command, 0, stdout="", stderr="")

    monkeypatch.setattr("app.services.stt.shutil.which", lambda name: "/usr/bin/ffmpeg" if name == "ffmpeg" else None)
    monkeypatch.setattr("app.services.stt.run", fake_run)

    response = transcribe_take(client, tmp_path, entry_id, take_id, transcriber)

    assert response.status_code == 200
    assert response.json()["take"]["transcript_text"] == "Converted audio transcript."
    assert transcriber.last_audio_path is not None
    assert transcriber.last_audio_path.suffix == ".wav"
    assert not transcriber.last_audio_path.exists()


def test_audio_journal_original_transcription_sets_entry_original_transcript_and_script_when_blank(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path)
    entry_id = payload["entry"]["id"]
    take_id = payload["take"]["id"]

    response = transcribe_take(client, tmp_path, entry_id, take_id, FakeWhisperTranscriber("Original spoken journal."))

    assert response.status_code == 200
    entry = response.json()["entry"]
    assert entry["original_transcript_text"] == "Original spoken journal."
    assert entry["script_text"] == "Original spoken journal."


def test_audio_journal_transcription_does_not_overwrite_existing_script_text(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path, transcript_text="Existing edited script.")
    entry_id = payload["entry"]["id"]
    take_id = payload["take"]["id"]

    response = transcribe_take(client, tmp_path, entry_id, take_id, FakeWhisperTranscriber("New whisper transcript."))

    assert response.status_code == 200
    assert response.json()["entry"]["script_text"] == "Existing edited script."


def test_audio_journal_failed_transcription_marks_take_failed(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path)
    entry_id = payload["entry"]["id"]
    take_id = payload["take"]["id"]
    error = WhisperCppError("whisper failure", status_code=502, stdout="out", stderr="err")

    response = transcribe_take(client, tmp_path, entry_id, take_id, FakeWhisperTranscriber(error=error))

    assert response.status_code == 502
    with Session(client.engine) as session:
        take = session.get(AudioJournalTake, take_id)
        assert take is not None
        assert take.transcription_status == "failed"
        assert take.is_training_candidate is False
        assert "whisper failure" in (take.metadata_json or "")


def test_audio_journal_transcribe_missing_audio_file_returns_404(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path)
    entry_id = payload["entry"]["id"]
    take_id = payload["take"]["id"]
    Path(payload["take"]["audio_path"]).unlink()

    response = transcribe_take(client, tmp_path, entry_id, take_id, FakeWhisperTranscriber())

    assert response.status_code == 404
    assert response.json()["detail"] == "Audio file not found."


def test_audio_journal_transcript_with_usable_quality_marks_training_candidate_and_selected_take(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path)
    entry_id = payload["entry"]["id"]
    take_id = payload["take"]["id"]

    response = transcribe_take(client, tmp_path, entry_id, take_id, FakeWhisperTranscriber("Training ready transcript."))

    assert response.status_code == 200
    assert response.json()["take"]["quality_status"] == "usable"
    assert response.json()["take"]["is_training_candidate"] is True
    assert response.json()["entry"]["selected_training_take_id"] == take_id


def test_audio_journal_transcript_with_review_quality_does_not_mark_training_candidate(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path, audio=wav_bytes(duration_seconds=1))
    entry_id = payload["entry"]["id"]
    take_id = payload["take"]["id"]

    response = transcribe_take(client, tmp_path, entry_id, take_id, FakeWhisperTranscriber("Short clip transcript."))

    assert response.status_code == 200
    assert response.json()["take"]["quality_status"] == "review"
    assert response.json()["take"]["is_training_candidate"] is False
    assert response.json()["entry"]["selected_training_take_id"] is None


def test_audio_journal_rerecord_transcription_computes_script_match_score(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path, transcript_text="Please read this exact local journal script.")
    entry_id = payload["entry"]["id"]
    rerecord_response = client.post(
        f"/api/audio-journal/{entry_id}/takes",
        files={"audio_file": ("rerecord.wav", BytesIO(wav_bytes()), "audio/wav")},
        data={"take_type": "rerecord"},
    )
    take_id = rerecord_response.json()["id"]

    response = transcribe_take(
        client,
        tmp_path,
        entry_id,
        take_id,
        FakeWhisperTranscriber("Please read this exact local journal script."),
    )

    assert response.status_code == 200
    assert response.json()["take"]["script_match_score"] == 100
    assert response.json()["take"]["is_training_candidate"] is True


def test_audio_journal_low_script_match_prevents_automatic_training_candidate(client, tmp_path: Path) -> None:
    payload = create_entry(client, tmp_path, transcript_text="Please read this exact local journal script.")
    entry_id = payload["entry"]["id"]
    rerecord_response = client.post(
        f"/api/audio-journal/{entry_id}/takes",
        files={"audio_file": ("rerecord.wav", BytesIO(wav_bytes()), "audio/wav")},
        data={"take_type": "rerecord"},
    )
    take_id = rerecord_response.json()["id"]

    response = transcribe_take(client, tmp_path, entry_id, take_id, FakeWhisperTranscriber("Completely different words."))

    assert response.status_code == 200
    take = response.json()["take"]
    assert take["script_match_score"] < 85
    assert take["is_training_candidate"] is False
    assert "Transcript differs from script" in (take["metadata_json"] or "")


def test_audio_journal_transcribe_rejects_take_from_different_entry(client, tmp_path: Path) -> None:
    first = create_entry(client, tmp_path)
    second = create_entry(client, tmp_path)

    response = transcribe_take(
        client,
        tmp_path,
        first["entry"]["id"],
        second["take"]["id"],
        FakeWhisperTranscriber("Wrong entry transcript."),
    )

    assert response.status_code == 404
