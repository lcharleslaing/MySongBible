from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path

from fastapi import UploadFile
from sqlmodel import Session, select

from app.core.config import Settings
from app.local_ai.stt.whisper_cpp import WhisperCppTranscriber
from app.models.audio_journal import AudioJournalEntry, AudioJournalTake
from app.schemas.audio_journal import (
    AudioJournalEntryCreate,
    AudioJournalEntryUpdate,
    AudioJournalTakeCreate,
    AudioJournalTakeUpdate,
    AudioJournalTrainingCandidateUpdate,
)
from app.services.audio_quality import AudioQualityAnalyzer
from app.services.stt import SttService


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


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
        metrics = self.quality_analyzer.analyze(Path(take.audio_path), has_training_text=has_training_text)
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
        return take.quality_status == "usable" and has_text

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
