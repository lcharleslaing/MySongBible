from __future__ import annotations

from datetime import datetime, timezone
from difflib import SequenceMatcher
import json
from pathlib import Path

from fastapi import UploadFile
from sqlmodel import Session, select

from app.core.config import Settings
from app.local_ai.stt.whisper_cpp import WhisperCppError, WhisperCppTranscriber
from app.models.app_setting import AppSetting
from app.models.audio_journal import AudioJournalEntry, AudioJournalTake
from app.schemas.audio_journal import (
    AudioJournalEntryCreate,
    AudioJournalEntryUpdate,
    AudioJournalRecordingAtmosphere,
    AudioJournalTakeCreate,
    AudioJournalTakeUpdate,
    AudioJournalTrainingCandidateUpdate,
)
from app.services.audio_quality import AudioQualityAnalyzer
from app.services.stt import SttService, SttUploadError


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


RECORDING_ATMOSPHERE_SETTING_KEY = "audio_journal.recording_atmosphere"


class AudioJournalError(ValueError):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class AudioJournalService:
    def __init__(
        self,
        *,
        session: Session,
        settings: Settings,
        transcriber: WhisperCppTranscriber | None = None,
        quality_analyzer: AudioQualityAnalyzer | None = None,
    ) -> None:
        self.session = session
        self.settings = settings
        self.transcriber = transcriber
        self.quality_analyzer = quality_analyzer or AudioQualityAnalyzer()

    def list_entries(self) -> list[AudioJournalEntry]:
        statement = select(AudioJournalEntry).order_by(AudioJournalEntry.journal_date.desc(), AudioJournalEntry.created_at.desc())
        return list(self.session.exec(statement))

    def get_entry(self, entry_id: int) -> AudioJournalEntry:
        entry = self.session.get(AudioJournalEntry, entry_id)
        if not entry:
            raise AudioJournalError("Audio journal entry not found.", status_code=404)
        return entry

    def create_entry_with_upload(
        self,
        *,
        audio_file: UploadFile,
        payload: AudioJournalEntryCreate,
    ) -> tuple[AudioJournalEntry, AudioJournalTake]:
        now = utc_now()
        title = payload.title or Path(audio_file.filename or "Audio journal entry").stem or "Audio journal entry"
        entry = AudioJournalEntry(
            title=title,
            created_at=now,
            updated_at=now,
            journal_date=payload.journal_date or now,
            script_text=payload.script_text,
            notes=payload.notes,
            tags_json=payload.tags_json,
            voice_style=payload.voice_style,
            metadata_json=payload.metadata_json,
        )
        self.session.add(entry)
        self.session.commit()
        self.session.refresh(entry)

        take = self.create_take(
            entry.id or 0,
            audio_file=audio_file,
            payload=AudioJournalTakeCreate(take_type="original"),
            make_active=True,
        )
        return entry, take

    def update_entry(self, entry_id: int, payload: AudioJournalEntryUpdate) -> AudioJournalEntry:
        entry = self.get_entry(entry_id)
        values = payload.model_dump(exclude_unset=True)
        for key, value in values.items():
            setattr(entry, key, value)
        entry.updated_at = utc_now()
        self.session.add(entry)
        self.session.commit()
        self.session.refresh(entry)
        return entry

    def delete_entry(self, entry_id: int, *, delete_audio: bool = False) -> None:
        entry = self.get_entry(entry_id)
        takes = self.list_takes(entry_id)
        if delete_audio:
            for take in takes:
                self._delete_audio_file_if_safe(Path(take.audio_path))
        for take in takes:
            self.session.delete(take)
        self.session.delete(entry)
        self.session.commit()

    def list_takes(self, entry_id: int) -> list[AudioJournalTake]:
        self.get_entry(entry_id)
        statement = select(AudioJournalTake).where(AudioJournalTake.entry_id == entry_id).order_by(AudioJournalTake.take_number)
        return list(self.session.exec(statement))

    def get_take(self, entry_id: int, take_id: int) -> AudioJournalTake:
        take = self.session.get(AudioJournalTake, take_id)
        if not take or take.entry_id != entry_id:
            raise AudioJournalError("Audio journal take not found.", status_code=404)
        return take

    def create_take(
        self,
        entry_id: int,
        *,
        audio_file: UploadFile,
        payload: AudioJournalTakeCreate,
        make_active: bool = False,
    ) -> AudioJournalTake:
        entry = self.get_entry(entry_id)
        take_type = payload.take_type if payload.take_type in {"original", "rerecord", "import"} else "import"
        destination_dir = self._storage_dir_for_take_type(take_type)
        stt_service = SttService(session=self.session, settings=self.settings, transcriber=self.transcriber)  # type: ignore[arg-type]
        audio_path = stt_service.save_upload_to_directory(audio_file, destination_dir).resolve()
        next_take_number = self._next_take_number(entry_id)
        take = AudioJournalTake(
            entry_id=entry_id,
            take_number=next_take_number,
            take_type=take_type,
            audio_path=str(audio_path),
            audio_filename=Path(audio_file.filename or audio_path.name).name,
            transcript_text=payload.transcript_text,
            transcript_source=payload.transcript_source,
            transcription_status="completed" if payload.transcript_text else "pending",
            metadata_json=payload.metadata_json,
            is_active=make_active or next_take_number == 1,
        )
        self.session.add(take)
        self.session.commit()
        self.session.refresh(take)

        if take.is_active:
            self.set_active_take(entry_id, take.id or 0)
            take = self.get_take(entry_id, take.id or 0)

        self.analyze_take_quality(entry_id, take.id or 0)
        take = self.get_take(entry_id, take.id or 0)
        entry.updated_at = utc_now()
        self._refresh_entry_status(entry)
        self.session.add(entry)
        self.session.commit()
        self.session.refresh(take)
        return take

    def update_take(self, entry_id: int, take_id: int, payload: AudioJournalTakeUpdate) -> AudioJournalTake:
        take = self.get_take(entry_id, take_id)
        values = payload.model_dump(exclude_unset=True)
        for key, value in values.items():
            setattr(take, key, value)
        self._apply_training_candidate_rules(take, self.get_entry(entry_id), manual_override=False)
        self.session.add(take)
        self.session.commit()
        self.session.refresh(take)
        return take

    def delete_take(self, entry_id: int, take_id: int, *, delete_audio: bool = False) -> None:
        entry = self.get_entry(entry_id)
        take = self.get_take(entry_id, take_id)
        if delete_audio:
            self._delete_audio_file_if_safe(Path(take.audio_path))
        if entry.active_take_id == take.id:
            entry.active_take_id = None
        if entry.selected_training_take_id == take.id:
            entry.selected_training_take_id = None
        self.session.delete(take)
        entry.updated_at = utc_now()
        self.session.add(entry)
        self.session.commit()

    def set_active_take(self, entry_id: int, take_id: int) -> AudioJournalTake:
        entry = self.get_entry(entry_id)
        target = self.get_take(entry_id, take_id)
        for take in self.list_takes(entry_id):
            take.is_active = take.id == take_id
            self.session.add(take)
        entry.active_take_id = target.id
        entry.overall_quality_status = target.quality_status
        entry.updated_at = utc_now()
        self.session.add(entry)
        self.session.commit()
        self.session.refresh(target)
        return target

    def analyze_take_quality(self, entry_id: int, take_id: int) -> AudioJournalTake:
        entry = self.get_entry(entry_id)
        take = self.get_take(entry_id, take_id)
        has_training_text = bool((take.transcript_text or "").strip() or (entry.script_text or "").strip())
        metrics = self.quality_analyzer.analyze(
            Path(take.audio_path),
            has_training_text=has_training_text,
            recording_atmosphere=self.get_recording_atmosphere(),
        )
        for key, value in metrics.model_dump().items():
            setattr(take, key, value)
        self._apply_training_candidate_rules(take, entry, manual_override=False)
        self.session.add(take)
        self._refresh_entry_status(entry)
        entry.updated_at = utc_now()
        self.session.add(entry)
        self.session.commit()
        self.session.refresh(take)
        return take

    def get_recording_atmosphere(self) -> AudioJournalRecordingAtmosphere | None:
        statement = select(AppSetting).where(AppSetting.key == RECORDING_ATMOSPHERE_SETTING_KEY)
        setting = self.session.exec(statement).first()
        if not setting:
            return None
        try:
            return AudioJournalRecordingAtmosphere.model_validate(json.loads(setting.value))
        except (json.JSONDecodeError, ValueError):
            return None

    def set_recording_atmosphere_from_take(self, entry_id: int, take_id: int) -> AudioJournalRecordingAtmosphere:
        take = self.analyze_take_quality(entry_id, take_id)
        atmosphere = AudioJournalRecordingAtmosphere(
            captured_at=utc_now(),
            entry_id=entry_id,
            take_id=take.id or take_id,
            take_number=take.take_number,
            audio_filename=take.audio_filename,
            duration_seconds=take.duration_seconds,
            sample_rate=take.sample_rate,
            channels=take.channels,
            file_format=take.file_format,
            quality_score=take.quality_score,
            noise_floor_db=take.noise_floor_db,
            rms_db=take.rms_db,
            peak_db=take.peak_db,
            silence_ratio=take.silence_ratio,
            snr_estimate_db=take.snr_estimate_db,
        )
        payload = atmosphere.model_dump_json()
        statement = select(AppSetting).where(AppSetting.key == RECORDING_ATMOSPHERE_SETTING_KEY)
        setting = self.session.exec(statement).first()
        if setting:
            setting.value = payload
            setting.updated_at = utc_now()
        else:
            setting = AppSetting(
                key=RECORDING_ATMOSPHERE_SETTING_KEY,
                value=payload,
                description="Best/current Audio Journal recording atmosphere baseline.",
            )
        self.session.add(setting)
        self.session.commit()

        # Re-run the selected take against the newly stored baseline so its status reflects calibration immediately.
        self.analyze_take_quality(entry_id, take_id)
        return atmosphere

    def transcribe_take(self, entry_id: int, take_id: int, *, language: str | None = None) -> AudioJournalTake:
        entry = self.get_entry(entry_id)
        take = self.get_take(entry_id, take_id)
        audio_path = Path(take.audio_path).resolve()
        if not self._is_inside_journal_storage(audio_path):
            raise AudioJournalError("Invalid audio path.", status_code=400)
        if not audio_path.exists() or not audio_path.is_file():
            raise AudioJournalError("Audio file not found.", status_code=404)
        if self.transcriber is None:
            raise AudioJournalError("Whisper transcriber is not configured.", status_code=400)

        stt_service = SttService(session=self.session, settings=self.settings, transcriber=self.transcriber)
        try:
            transcription = stt_service.transcribe_audio_path(audio_path, language=language)
        except (WhisperCppError, SttUploadError) as error:
            take.transcription_status = "failed"
            take.is_training_candidate = False
            take.metadata_json = self._merge_metadata(take.metadata_json, {"transcription_error": self._error_message(error)})
            self.session.add(take)
            self.session.commit()
            self.session.refresh(take)
            raise

        transcript_text = transcription.text.strip()
        take.transcript_text = transcript_text
        take.transcript_source = "whisper"
        take.transcription_status = "completed"
        take.transcription_engine = "whisper.cpp"
        take.transcription_model = self.settings.whisper_model_path.name if self.settings.whisper_model_path else None

        if transcript_text and take.take_type == "original" and not (entry.original_transcript_text or "").strip():
            entry.original_transcript_text = transcript_text
        if transcript_text and not (entry.script_text or "").strip():
            entry.script_text = transcript_text

        self._update_script_match_score(take, entry)
        self._apply_training_candidate_rules(take, entry, manual_override=False)
        if take.is_training_candidate and entry.selected_training_take_id is None:
            entry.selected_training_take_id = take.id
        self._refresh_entry_status(entry)
        entry.updated_at = utc_now()
        self.session.add(take)
        self.session.add(entry)
        self.session.commit()
        self.session.refresh(take)
        return take

    def update_training_candidate(
        self,
        entry_id: int,
        take_id: int,
        payload: AudioJournalTrainingCandidateUpdate,
    ) -> AudioJournalTake:
        entry = self.get_entry(entry_id)
        take = self.get_take(entry_id, take_id)
        if payload.is_training_candidate and not self._can_auto_mark_training_candidate(take, entry):
            if not payload.manual_override:
                raise AudioJournalError(
                    "Training candidate requires usable quality and transcript or script text unless manual_override is true.",
                    status_code=400,
                )
            take.metadata_json = self._merge_metadata_reason(take.metadata_json, payload.reason)
        take.is_training_candidate = payload.is_training_candidate
        if payload.is_training_candidate:
            entry.selected_training_take_id = take.id
        elif entry.selected_training_take_id == take.id:
            entry.selected_training_take_id = None
        entry.updated_at = utc_now()
        self.session.add(take)
        self.session.add(entry)
        self.session.commit()
        self.session.refresh(take)
        return take

    def audio_path_for_take(self, entry_id: int, take_id: int) -> Path:
        take = self.get_take(entry_id, take_id)
        audio_path = Path(take.audio_path).resolve()
        if not self._is_inside_journal_storage(audio_path):
            raise AudioJournalError("Invalid audio path.", status_code=400)
        if not audio_path.exists() or not audio_path.is_file():
            raise AudioJournalError("Audio file not found.", status_code=404)
        return audio_path

    def _next_take_number(self, entry_id: int) -> int:
        statement = select(AudioJournalTake).where(AudioJournalTake.entry_id == entry_id).order_by(AudioJournalTake.take_number.desc())
        latest = self.session.exec(statement).first()
        return (latest.take_number + 1) if latest else 1

    def _storage_dir_for_take_type(self, take_type: str) -> Path:
        if take_type == "rerecord":
            return self.settings.audio_journal_rerecords_dir
        if take_type == "import":
            return self.settings.audio_journal_imports_dir
        return self.settings.audio_journal_originals_dir

    def _journal_storage_roots(self) -> list[Path]:
        return [
            self.settings.audio_journal_dir.resolve(),
            self.settings.audio_journal_originals_dir.resolve(),
            self.settings.audio_journal_rerecords_dir.resolve(),
            self.settings.audio_journal_imports_dir.resolve(),
            self.settings.audio_journal_processed_dir.resolve(),
        ]

    def _is_inside_journal_storage(self, audio_path: Path) -> bool:
        resolved = audio_path.resolve()
        for root in self._journal_storage_roots():
            if resolved == root or root in resolved.parents:
                return True
        return False

    def _delete_audio_file_if_safe(self, audio_path: Path) -> None:
        resolved = audio_path.resolve()
        if self._is_inside_journal_storage(resolved):
            resolved.unlink(missing_ok=True)

    def _can_auto_mark_training_candidate(self, take: AudioJournalTake, entry: AudioJournalEntry) -> bool:
        has_text = bool((take.transcript_text or "").strip() or (entry.script_text or "").strip())
        match_ok = take.script_match_score is None or take.script_match_score >= 85
        return take.quality_status == "usable" and has_text and match_ok

    def _apply_training_candidate_rules(
        self,
        take: AudioJournalTake,
        entry: AudioJournalEntry,
        *,
        manual_override: bool,
    ) -> None:
        if self._can_auto_mark_training_candidate(take, entry):
            take.is_training_candidate = True
            return
        if not manual_override:
            take.is_training_candidate = False

    def _refresh_entry_status(self, entry: AudioJournalEntry) -> None:
        takes = self.list_takes(entry.id or 0) if entry.id else []
        active = next((take for take in takes if take.id == entry.active_take_id), None)
        selected = next((take for take in takes if take.id == entry.selected_training_take_id), None)
        best = selected or active or next((take for take in takes if take.quality_status == "usable"), None)
        entry.overall_quality_status = best.quality_status if best else "unknown"

    def _update_script_match_score(self, take: AudioJournalTake, entry: AudioJournalEntry) -> None:
        transcript = (take.transcript_text or "").strip()
        script = (entry.script_text or "").strip()
        if take.take_type != "rerecord" or not transcript or not script:
            return
        score = round(SequenceMatcher(None, self._normalize_text(script), self._normalize_text(transcript)).ratio() * 100, 2)
        take.script_match_score = score
        if score < 85:
            take.metadata_json = self._merge_metadata(
                take.metadata_json,
                {
                    "script_match_warning": "Transcript differs from script; review before training.",
                    "script_match_status": "not_training_ready" if score < 70 else "review",
                },
            )

    @staticmethod
    def _normalize_text(value: str) -> str:
        return " ".join(value.lower().split())

    def list_takes_without_entry_check(self, entry_id: int) -> list[AudioJournalTake]:
        statement = select(AudioJournalTake).where(AudioJournalTake.entry_id == entry_id).order_by(AudioJournalTake.take_number)
        return list(self.session.exec(statement))

    def _merge_metadata_reason(self, metadata_json: str | None, reason: str | None) -> str:
        try:
            metadata = json.loads(metadata_json) if metadata_json else {}
            if not isinstance(metadata, dict):
                metadata = {"previous_metadata": metadata}
        except json.JSONDecodeError:
            metadata = {"previous_metadata": metadata_json}
        metadata["training_candidate_manual_override"] = True
        if reason:
            metadata["training_candidate_override_reason"] = reason
        return json.dumps(metadata)

    def _merge_metadata(self, metadata_json: str | None, updates: dict[str, object]) -> str:
        try:
            metadata = json.loads(metadata_json) if metadata_json else {}
            if not isinstance(metadata, dict):
                metadata = {"previous_metadata": metadata}
        except json.JSONDecodeError:
            metadata = {"previous_metadata": metadata_json}
        metadata.update(updates)
        return json.dumps(metadata)

    @staticmethod
    def _error_message(error: Exception) -> str:
        return getattr(error, "message", str(error))
