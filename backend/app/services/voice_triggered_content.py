from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import mimetypes
from pathlib import Path
import re
import uuid

from fastapi import UploadFile
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.config import Settings
from app.core.runtime_paths import runtime_paths
from app.models.voice_triggered_content import (
    ListeningSession,
    SessionContentBlock,
    TranscriptSegment,
    TriggerActivationEvent,
    VoiceTriggerAlias,
    VoiceTriggerAsset,
    VoiceTriggerDefinition,
    VoiceTriggerImportHistory,
    VoiceTriggerPreference,
)
from app.schemas.voice_triggered_content import (
    ListeningSessionCreate,
    ListeningSessionUpdate,
    ManualNoteCreate,
    SessionContentBlockUpdate,
    TranscriptSegmentCreate,
    TriggerImportPayload,
    TriggerImportResult,
    VoiceTriggerCreate,
    VoiceTriggerUpdate,
)


DEFAULT_COOLDOWN_SECONDS = 4.0
VALID_MATCH_MODES = {"exact_phrase", "whole_phrase", "flexible"}
ALLOWED_IMAGE_MIME_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalize_phrase(value: str, *, case_sensitive: bool = False) -> str:
    text = value.strip()
    if not case_sensitive:
        text = text.casefold()
    text = re.sub(r"^[^\w]+|[^\w]+$", "", text, flags=re.UNICODE)
    text = re.sub(r"\s+", " ", text)
    return text


@dataclass(frozen=True)
class TriggerMatch:
    trigger: VoiceTriggerDefinition
    alias: VoiceTriggerAlias | None
    spoken_phrase: str
    matched_alias: str | None
    match_mode: str
    start: int
    end: int


class VoiceTriggeredContentError(ValueError):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class TriggerMatcher:
    def __init__(self, triggers: list[tuple[VoiceTriggerDefinition, list[VoiceTriggerAlias]]]) -> None:
        self.triggers = triggers

    def match(self, text: str) -> list[TriggerMatch]:
        matches: list[TriggerMatch] = []
        occupied: list[tuple[int, int]] = []
        for trigger, aliases in self.triggers:
            if not trigger.enabled:
                continue
            phrases = [(trigger.primary_phrase, trigger.normalized_phrase, None)]
            phrases.extend((alias.phrase, alias.normalized_phrase, alias) for alias in aliases)
            for phrase, normalized, alias in sorted(phrases, key=lambda item: len(item[1]), reverse=True):
                candidate = self._find(text, phrase, normalized, trigger)
                if candidate is None:
                    continue
                start, end, spoken = candidate
                if any(start < taken_end and end > taken_start for taken_start, taken_end in occupied):
                    continue
                occupied.append((start, end))
                matches.append(
                    TriggerMatch(
                        trigger=trigger,
                        alias=alias,
                        spoken_phrase=spoken,
                        matched_alias=alias.phrase if alias else None,
                        match_mode=trigger.match_mode,
                        start=start,
                        end=end,
                    )
                )
                break
        return sorted(matches, key=lambda match: match.start)

    def _find(
        self,
        text: str,
        phrase: str,
        normalized_phrase_value: str,
        trigger: VoiceTriggerDefinition,
    ) -> tuple[int, int, str] | None:
        haystack = text if trigger.case_sensitive else text.casefold()
        normalized_text = normalize_phrase(text, case_sensitive=trigger.case_sensitive)
        mode = trigger.match_mode if trigger.match_mode in VALID_MATCH_MODES else "whole_phrase"
        if trigger.strict_mode:
            mode = "exact_phrase"
        if mode == "exact_phrase":
            if normalized_text == normalized_phrase_value:
                return 0, len(text), text.strip()
            return None
        escaped = re.escape(phrase if trigger.case_sensitive else phrase.casefold())
        pattern = rf"(?<![A-Za-z0-9]){escaped}(?![A-Za-z0-9])"
        if mode == "flexible":
            parts = [re.escape(part) for part in normalize_phrase(phrase, case_sensitive=trigger.case_sensitive).split()]
            pattern = rf"(?<![A-Za-z0-9]){r'[\W_]+'.join(parts)}(?![A-Za-z0-9])"
        found = re.search(pattern, haystack)
        if not found:
            return None
        return found.start(), found.end(), text[found.start():found.end()]


class VoiceTriggeredContentService:
    def __init__(self, *, session: Session, settings: Settings) -> None:
        self.session = session
        self.settings = settings

    def list_triggers(self, query: str | None = None) -> list[VoiceTriggerDefinition]:
        statement = select(VoiceTriggerDefinition).order_by(VoiceTriggerDefinition.updated_at.desc())
        items = list(self.session.exec(statement))
        if query:
            needle = query.casefold()
            items = [
                item for item in items
                if needle in item.primary_phrase.casefold()
                or needle in item.title.casefold()
                or needle in (item.category or "").casefold()
            ]
        return items

    def get_trigger(self, trigger_id: int) -> VoiceTriggerDefinition:
        trigger = self.session.get(VoiceTriggerDefinition, trigger_id)
        if not trigger:
            raise VoiceTriggeredContentError("Trigger not found.", status_code=404)
        return trigger

    def list_aliases(self, trigger_id: int) -> list[VoiceTriggerAlias]:
        return list(self.session.exec(select(VoiceTriggerAlias).where(VoiceTriggerAlias.trigger_id == trigger_id).order_by(VoiceTriggerAlias.phrase)))

    def get_asset(self, asset_id: int | None) -> VoiceTriggerAsset | None:
        return self.session.get(VoiceTriggerAsset, asset_id) if asset_id else None

    def create_trigger(self, payload: VoiceTriggerCreate) -> VoiceTriggerDefinition:
        self._validate_match_mode(payload.match_mode)
        trigger = VoiceTriggerDefinition(
            primary_phrase=payload.primary_phrase.strip(),
            normalized_phrase=normalize_phrase(payload.primary_phrase, case_sensitive=payload.case_sensitive),
            title=payload.title.strip(),
            description=payload.description,
            content_json=payload.content_json,
            category=payload.category,
            tags_json=self._normalize_tags(payload.tags),
            color=payload.color,
            match_mode=payload.match_mode,
            case_sensitive=payload.case_sensitive,
            strict_mode=payload.strict_mode,
            enabled=payload.enabled,
            duplicate_cooldown_seconds=payload.duplicate_cooldown_seconds,
            settings_json=payload.settings_json,
        )
        self.session.add(trigger)
        self._commit_or_conflict("Trigger phrase or alias already exists.")
        self.session.refresh(trigger)
        self._replace_aliases(trigger, payload.aliases)
        self.session.refresh(trigger)
        return trigger

    def update_trigger(self, trigger_id: int, payload: VoiceTriggerUpdate) -> VoiceTriggerDefinition:
        trigger = self.get_trigger(trigger_id)
        values = payload.model_dump(exclude_unset=True)
        if "match_mode" in values and values["match_mode"] is not None:
            self._validate_match_mode(values["match_mode"])
        case_sensitive = values.get("case_sensitive", trigger.case_sensitive)
        for key, value in values.items():
            if key in {"aliases", "tags"}:
                continue
            if key == "primary_phrase" and value is not None:
                trigger.primary_phrase = value.strip()
                trigger.normalized_phrase = normalize_phrase(value, case_sensitive=case_sensitive)
            else:
                setattr(trigger, key, value)
        if "case_sensitive" in values:
            trigger.normalized_phrase = normalize_phrase(trigger.primary_phrase, case_sensitive=trigger.case_sensitive)
        if "tags" in values and values["tags"] is not None:
            trigger.tags_json = self._normalize_tags(values["tags"])
        trigger.updated_at = utc_now()
        self.session.add(trigger)
        self._commit_or_conflict("Trigger phrase or alias already exists.")
        if values.get("aliases") is not None:
            self._replace_aliases(trigger, values["aliases"])
        self.session.refresh(trigger)
        return trigger

    def duplicate_trigger(self, trigger_id: int) -> VoiceTriggerDefinition:
        source = self.get_trigger(trigger_id)
        clone = VoiceTriggerCreate(
            primary_phrase=f"{source.primary_phrase} copy",
            aliases=[],
            title=f"{source.title} copy",
            description=source.description,
            content_json=source.content_json,
            category=source.category,
            tags=source.tags_json,
            color=source.color,
            match_mode=source.match_mode,
            case_sensitive=source.case_sensitive,
            strict_mode=source.strict_mode,
            enabled=False,
            duplicate_cooldown_seconds=source.duplicate_cooldown_seconds,
            settings_json=source.settings_json,
        )
        return self.create_trigger(clone)

    def delete_trigger(self, trigger_id: int) -> None:
        trigger = self.get_trigger(trigger_id)
        for alias in self.list_aliases(trigger_id):
            self.session.delete(alias)
        asset = self.get_asset(trigger.image_asset_id)
        if asset:
            asset.trigger_id = None
            asset.updated_at = utc_now()
            self.session.add(asset)
        self.session.delete(trigger)
        self.session.commit()

    def store_trigger_image(self, trigger_id: int, image_file: UploadFile) -> VoiceTriggerAsset:
        trigger = self.get_trigger(trigger_id)
        content_type = (image_file.content_type or mimetypes.guess_type(image_file.filename or "")[0] or "").split(";")[0]
        if content_type not in ALLOWED_IMAGE_MIME_TYPES:
            raise VoiceTriggeredContentError("Unsupported image type.", status_code=400)
        original_name = Path(image_file.filename or "trigger-image").name
        suffix = Path(original_name).suffix.lower() or mimetypes.guess_extension(content_type) or ".img"
        stored_name = f"{uuid.uuid4().hex}{suffix}"
        base_dir = runtime_paths(self.settings.app_data_dir).voice_trigger_images
        base_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        destination = base_dir / stored_name
        file_size = 0
        with destination.open("wb") as output_file:
            while chunk := image_file.file.read(1024 * 1024):
                file_size += len(chunk)
                output_file.write(chunk)
        image_file.file.close()
        relative_path = str(Path("listen-commands") / "images" / stored_name)
        old_asset_id = trigger.image_asset_id
        asset = VoiceTriggerAsset(
            managed_relative_path=relative_path,
            original_filename=original_name,
            stored_filename=stored_name,
            mime_type=content_type,
            file_size=file_size,
            trigger_id=trigger_id,
        )
        self.session.add(asset)
        self.session.commit()
        self.session.refresh(asset)
        trigger.image_asset_id = asset.id
        trigger.updated_at = utc_now()
        self.session.add(trigger)
        self.session.commit()
        if old_asset_id:
            self._delete_asset_if_unreferenced(old_asset_id)
        return asset

    def asset_path(self, asset_id: int) -> tuple[Path, str]:
        asset = self.get_asset(asset_id)
        if not asset:
            raise VoiceTriggeredContentError("Image asset not found.", status_code=404)
        path = (self.settings.app_data_dir / asset.managed_relative_path).resolve()
        root = self.settings.app_data_dir.resolve()
        if root not in path.parents:
            raise VoiceTriggeredContentError("Invalid image asset path.", status_code=400)
        if not path.exists() or not path.is_file():
            raise VoiceTriggeredContentError("Image file not found.", status_code=404)
        return path, asset.mime_type

    def create_session(self, payload: ListeningSessionCreate) -> ListeningSession:
        now = utc_now()
        status_value = payload.status if payload.status in {"draft", "active"} else "draft"
        item = ListeningSession(
            title=payload.title or f"Listening session {now.strftime('%Y-%m-%d %H:%M')}",
            status=status_value,
            started_at=now if status_value == "active" else None,
            settings_json=payload.settings_json,
            last_saved_at=now,
        )
        self.session.add(item)
        self.session.commit()
        self.session.refresh(item)
        return item

    def list_sessions(self, include_deleted: bool = False) -> list[ListeningSession]:
        statement = select(ListeningSession).order_by(ListeningSession.updated_at.desc())
        sessions = list(self.session.exec(statement))
        return sessions if include_deleted else [item for item in sessions if item.status != "deleted"]

    def get_session_record(self, session_id: int) -> ListeningSession:
        item = self.session.get(ListeningSession, session_id)
        if not item:
            raise VoiceTriggeredContentError("Listening session not found.", status_code=404)
        return item

    def update_session(self, session_id: int, payload: ListeningSessionUpdate) -> ListeningSession:
        item = self.get_session_record(session_id)
        values = payload.model_dump(exclude_unset=True)
        for key, value in values.items():
            if key == "tags":
                item.tags_json = self._normalize_tags(value or [])
            elif value is not None:
                setattr(item, key, value)
        now = utc_now()
        if values.get("status") == "active" and item.started_at is None:
            item.started_at = now
        if values.get("status") in {"stopped", "finalized"} and item.stopped_at is None:
            item.stopped_at = now
        item.updated_at = now
        item.last_saved_at = now
        self.session.add(item)
        self.session.commit()
        self.session.refresh(item)
        return item

    def delete_session(self, session_id: int) -> None:
        item = self.get_session_record(session_id)
        for block in self.list_blocks(session_id):
            self.session.delete(block)
        for activation in self.list_activations(session_id):
            self.session.delete(activation)
        for segment in self.list_segments(session_id):
            self.session.delete(segment)
        self.session.delete(item)
        self.session.commit()

    def append_transcript_segment(self, session_id: int, payload: TranscriptSegmentCreate) -> tuple[ListeningSession, TranscriptSegment, list[TriggerActivationEvent], list[SessionContentBlock]]:
        item = self.get_session_record(session_id)
        cleaned_payload_text = self._clean_speech_text(payload.text)
        if not cleaned_payload_text:
            raise VoiceTriggeredContentError("No speech text to save.", status_code=422)
        blocks: list[SessionContentBlock] = []
        activations: list[TriggerActivationEvent] = []
        segment = TranscriptSegment(
            session_id=session_id,
            order_index=self._next_order(item),
            text=cleaned_payload_text,
            start_timestamp_ms=payload.start_timestamp_ms,
            end_timestamp_ms=payload.end_timestamp_ms,
            is_final=payload.is_final,
            source=payload.source,
            source_transcript_id=payload.source_transcript_id,
        )
        self.session.add(segment)
        self.session.commit()
        self.session.refresh(segment)

        cursor = 0
        matches: list[TriggerMatch] = []
        if payload.is_final and self._trigger_detection_enabled(item):
            matches = TriggerMatcher(self._enabled_trigger_aliases()).match(cleaned_payload_text)

        for match in matches:
            if match.start > cursor:
                speech_block = self._add_or_merge_transcript_block(
                    item,
                    segment=segment,
                    text=cleaned_payload_text[cursor:match.start],
                )
                if speech_block:
                    blocks.append(speech_block)
            cursor = match.end
            if payload.is_final:
                if self._is_duplicate(session_id, match):
                    continue
                image_reference = None
                if match.trigger.image_asset_id:
                    asset = self.get_asset(match.trigger.image_asset_id)
                    image_reference = asset.managed_relative_path if asset else None
                activation = TriggerActivationEvent(
                    session_id=session_id,
                    trigger_id=match.trigger.id,
                    alias_id=match.alias.id if match.alias else None,
                    transcript_segment_id=segment.id,
                    order_index=self._next_order(item),
                    spoken_phrase=match.spoken_phrase,
                    matched_alias=match.matched_alias,
                    match_mode=match.match_mode,
                    transcript_position_start=match.start,
                    transcript_position_end=match.end,
                    snapshot_title=match.trigger.title,
                    snapshot_content=match.trigger.description,
                    snapshot_image_asset_id=match.trigger.image_asset_id,
                    snapshot_image_reference=image_reference,
                )
                self.session.add(activation)
                self.session.commit()
                self.session.refresh(activation)
                block = SessionContentBlock(
                    session_id=session_id,
                    order_index=self._next_order(item),
                    block_type="trigger",
                    trigger_id=match.trigger.id,
                    activation_event_id=activation.id,
                    title=match.trigger.title,
                    content=match.trigger.description,
                    image_asset_id=match.trigger.image_asset_id,
                    image_reference=image_reference,
                    metadata_json={"spoken_phrase": match.spoken_phrase, "matched_alias": match.matched_alias, "match_mode": match.match_mode},
                )
                self.session.add(block)
                blocks.append(block)
                activations.append(activation)

        if cursor < len(cleaned_payload_text):
            speech_block = self._add_or_merge_transcript_block(
                item,
                segment=segment,
                text=cleaned_payload_text[cursor:],
            )
            if speech_block:
                blocks.append(speech_block)

        if not matches and not blocks:
            speech_block = self._add_or_merge_transcript_block(item, segment=segment, text=cleaned_payload_text)
            if speech_block:
                blocks.append(speech_block)
        item.transcript_text = "\n".join(segment.text for segment in self.list_segments(session_id))
        item.updated_at = utc_now()
        item.last_saved_at = item.updated_at
        self.session.add(item)
        self.session.commit()
        for block in blocks:
            self.session.refresh(block)
        self.session.refresh(item)
        return item, segment, activations, blocks

    def _add_or_merge_transcript_block(
        self,
        item: ListeningSession,
        *,
        segment: TranscriptSegment,
        text: str,
    ) -> SessionContentBlock | None:
        cleaned = self._clean_speech_text(text)
        if not cleaned:
            return None
        previous = self.session.exec(
            select(SessionContentBlock)
            .where(SessionContentBlock.session_id == item.id)
            .where(SessionContentBlock.status == "active")
            .order_by(SessionContentBlock.order_index.desc())
        ).first()
        if previous and previous.block_type == "transcript":
            previous.content = self._join_speech(previous.content or "", cleaned)
            previous.transcript_segment_id = segment.id
            previous.updated_at = utc_now()
            self.session.add(previous)
            self.session.commit()
            self.session.refresh(previous)
            return previous
        block = SessionContentBlock(
            session_id=item.id or 0,
            order_index=self._next_order(item),
            block_type="transcript",
            transcript_segment_id=segment.id,
            content=cleaned,
        )
        self.session.add(block)
        self.session.commit()
        self.session.refresh(block)
        return block

    @staticmethod
    def _clean_speech_text(text: str) -> str:
        cleaned = re.sub(r"\s+", " ", text).strip()
        cleaned = re.sub(r"^[\s,.;:!?-]+", "", cleaned)
        cleaned = re.sub(r"[\s,;:-]+$", "", cleaned)
        if cleaned.casefold() in {"[blank_audio]", "[silence]", "(silence)", "silence", "[music]", "(music)"}:
            return ""
        if not re.search(r"[\w]", cleaned, flags=re.UNICODE):
            return ""
        return cleaned.strip()

    @staticmethod
    def _join_speech(existing: str, addition: str) -> str:
        if not existing:
            return addition
        if existing.endswith((".", "?", "!", "\n")):
            return f"{existing}\n\n{addition}"
        return f"{existing} {addition}"

    def add_manual_block(self, session_id: int, payload: ManualNoteCreate) -> SessionContentBlock:
        item = self.get_session_record(session_id)
        block = SessionContentBlock(
            session_id=session_id,
            order_index=payload.order_index if payload.order_index is not None else self._next_order(item),
            block_type=payload.block_type if payload.block_type in {"note", "heading"} else "note",
            title=payload.title,
            content=payload.content,
            metadata_json=payload.metadata_json,
        )
        item.updated_at = utc_now()
        item.last_saved_at = item.updated_at
        self.session.add(block)
        self.session.add(item)
        self.session.commit()
        self.session.refresh(block)
        return block

    def manual_insert_trigger(self, session_id: int, trigger_id: int) -> tuple[TriggerActivationEvent, SessionContentBlock]:
        item = self.get_session_record(session_id)
        trigger = self.get_trigger(trigger_id)
        image_reference = self.get_asset(trigger.image_asset_id).managed_relative_path if trigger.image_asset_id and self.get_asset(trigger.image_asset_id) else None
        activation = TriggerActivationEvent(
            session_id=session_id,
            trigger_id=trigger.id,
            order_index=self._next_order(item),
            spoken_phrase=trigger.primary_phrase,
            match_mode="manual",
            snapshot_title=trigger.title,
            snapshot_content=trigger.description,
            snapshot_image_asset_id=trigger.image_asset_id,
            snapshot_image_reference=image_reference,
            metadata_json={"manual": True},
        )
        self.session.add(activation)
        self.session.commit()
        self.session.refresh(activation)
        block = SessionContentBlock(
            session_id=session_id,
            order_index=self._next_order(item),
            block_type="trigger",
            trigger_id=trigger.id,
            activation_event_id=activation.id,
            title=trigger.title,
            content=trigger.description,
            image_asset_id=trigger.image_asset_id,
            image_reference=image_reference,
            metadata_json={"manual": True, "spoken_phrase": trigger.primary_phrase},
        )
        self.session.add(block)
        item.updated_at = utc_now()
        item.last_saved_at = item.updated_at
        self.session.add(item)
        self.session.commit()
        self.session.refresh(block)
        return activation, block

    def update_block(self, block_id: int, payload: SessionContentBlockUpdate) -> SessionContentBlock:
        block = self.session.get(SessionContentBlock, block_id)
        if not block:
            raise VoiceTriggeredContentError("Session block not found.", status_code=404)
        for key, value in payload.model_dump(exclude_unset=True).items():
            if value is not None:
                setattr(block, key, value)
        block.updated_at = utc_now()
        self.session.add(block)
        self.session.commit()
        self.session.refresh(block)
        return block

    def list_segments(self, session_id: int) -> list[TranscriptSegment]:
        return list(self.session.exec(select(TranscriptSegment).where(TranscriptSegment.session_id == session_id).order_by(TranscriptSegment.order_index)))

    def list_blocks(self, session_id: int) -> list[SessionContentBlock]:
        return list(self.session.exec(select(SessionContentBlock).where(SessionContentBlock.session_id == session_id).order_by(SessionContentBlock.order_index)))

    def list_activations(self, session_id: int) -> list[TriggerActivationEvent]:
        return list(self.session.exec(select(TriggerActivationEvent).where(TriggerActivationEvent.session_id == session_id).order_by(TriggerActivationEvent.order_index)))

    def incomplete_sessions(self) -> list[ListeningSession]:
        return list(self.session.exec(select(ListeningSession).where(ListeningSession.status.in_(["active", "draft"])).order_by(ListeningSession.updated_at.desc())))

    def export_triggers(self) -> dict:
        return {"version": 1, "triggers": self.list_triggers()}

    def import_triggers(self, payload: TriggerImportPayload, source_filename: str | None = None) -> TriggerImportResult:
        conflicts: list[str] = []
        imported = 0
        for trigger_payload in payload.triggers:
            try:
                self.create_trigger(trigger_payload)
                imported += 1
            except VoiceTriggeredContentError as error:
                conflicts.append(f"{trigger_payload.primary_phrase}: {error.message}")
        result = TriggerImportResult(imported_count=imported, skipped_count=0, conflict_count=len(conflicts), conflicts=conflicts)
        history = VoiceTriggerImportHistory(
            source_filename=source_filename,
            imported_count=result.imported_count,
            skipped_count=result.skipped_count,
            conflict_count=result.conflict_count,
            details_json={"conflicts": conflicts, "version": payload.version},
        )
        self.session.add(history)
        self.session.commit()
        return result

    def _replace_aliases(self, trigger: VoiceTriggerDefinition, aliases: list[str]) -> None:
        for alias in self.list_aliases(trigger.id or 0):
            self.session.delete(alias)
        self.session.commit()
        for phrase in aliases:
            clean = phrase.strip()
            if not clean:
                continue
            self.session.add(
                VoiceTriggerAlias(
                    trigger_id=trigger.id or 0,
                    phrase=clean,
                    normalized_phrase=normalize_phrase(clean, case_sensitive=trigger.case_sensitive),
                )
            )
        self._commit_or_conflict("Trigger alias conflicts with an existing phrase or alias.")

    def _enabled_trigger_aliases(self) -> list[tuple[VoiceTriggerDefinition, list[VoiceTriggerAlias]]]:
        triggers = list(self.session.exec(select(VoiceTriggerDefinition).where(VoiceTriggerDefinition.enabled == True)))  # noqa: E712
        return [(trigger, self.list_aliases(trigger.id or 0)) for trigger in triggers]

    def _next_order(self, item: ListeningSession) -> int:
        item.current_order += 1
        return item.current_order

    def _is_duplicate(self, session_id: int, match: TriggerMatch) -> bool:
        cooldown = match.trigger.duplicate_cooldown_seconds
        if cooldown is None:
            cooldown = self._cooldown_seconds()
        last = self.session.exec(
            select(TriggerActivationEvent)
            .where(TriggerActivationEvent.session_id == session_id)
            .where(TriggerActivationEvent.trigger_id == match.trigger.id)
            .order_by(TriggerActivationEvent.detected_at.desc())
        ).first()
        if not last:
            return False
        detected_at = last.detected_at
        if detected_at.tzinfo is None:
            detected_at = detected_at.replace(tzinfo=timezone.utc)
        return (utc_now() - detected_at).total_seconds() < cooldown

    def _cooldown_seconds(self) -> float:
        pref = self.session.exec(select(VoiceTriggerPreference).where(VoiceTriggerPreference.key == "settings")).first()
        value = (pref.value_json or {}).get("duplicate_cooldown_seconds") if pref else None
        return float(value if isinstance(value, int | float) else DEFAULT_COOLDOWN_SECONDS)

    @staticmethod
    def _trigger_detection_enabled(item: ListeningSession) -> bool:
        return bool(item.settings_json.get("trigger_detection_enabled", True))

    @staticmethod
    def _normalize_tags(tags: list[str]) -> list[str]:
        return sorted({tag.strip() for tag in tags if tag.strip()})

    @staticmethod
    def _validate_match_mode(match_mode: str) -> None:
        if match_mode not in VALID_MATCH_MODES:
            raise VoiceTriggeredContentError("Unsupported match mode.", status_code=400)

    def _delete_asset_if_unreferenced(self, asset_id: int) -> None:
        asset = self.get_asset(asset_id)
        if not asset:
            return
        refs = [
            self.session.exec(select(VoiceTriggerDefinition).where(VoiceTriggerDefinition.image_asset_id == asset_id)).first(),
            self.session.exec(select(SessionContentBlock).where(SessionContentBlock.image_asset_id == asset_id)).first(),
            self.session.exec(select(TriggerActivationEvent).where(TriggerActivationEvent.snapshot_image_asset_id == asset_id)).first(),
        ]
        if any(refs):
            return
        path = (self.settings.app_data_dir / asset.managed_relative_path).resolve()
        self.session.delete(asset)
        self.session.commit()
        if self.settings.app_data_dir.resolve() in path.parents:
            path.unlink(missing_ok=True)

    def _commit_or_conflict(self, message: str) -> None:
        try:
            self.session.commit()
        except IntegrityError as error:
            self.session.rollback()
            raise VoiceTriggeredContentError(message, status_code=409) from error
