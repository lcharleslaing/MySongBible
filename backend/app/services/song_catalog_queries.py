from __future__ import annotations

from typing import Any, Literal

from sqlalchemy import Select, and_, func, literal, or_, select, text
from sqlmodel import Session

from app.models.song_catalog import LineWord, LyricLine, Song, SongTranscript, SongWord, Word

MAX_LIMIT = 200
DEFAULT_LIMIT = 50


def clamp_limit(limit: int | None) -> int:
    return max(1, min(limit or DEFAULT_LIMIT, MAX_LIMIT))


def clean_offset(offset: int | None) -> int:
    return max(0, offset or 0)


def gematria_dict(jewish: int | None, english: int | None, simple: int | None) -> dict[str, int | None]:
    return {"jewish": jewish, "english": english, "simple": simple}


def page(total: int, limit: int, offset: int) -> dict[str, int]:
    return {"total": total, "limit": limit, "offset": offset}


class SongCatalogQueryService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_songs(
        self,
        *,
        search: str | None = None,
        lyrics: Literal["all", "with", "without"] = "all",
        include_artifacts: bool = True,
        only_artifacts: bool = False,
        sort: Literal["title", "created_at"] = "title",
        direction: Literal["asc", "desc"] = "asc",
        limit: int = DEFAULT_LIMIT,
        offset: int = 0,
    ) -> dict[str, Any]:
        limit = clamp_limit(limit)
        offset = clean_offset(offset)
        statement = select(Song)
        statement = self._filter_songs(statement, search, lyrics, include_artifacts, only_artifacts)
        total = self.session.execute(select(func.count()).select_from(statement.subquery())).scalar_one()
        order_column = Song.created_at if sort == "created_at" else Song.title
        order_by = order_column.desc() if direction == "desc" else order_column.asc()
        songs = self.session.execute(statement.order_by(order_by, Song.id).limit(limit).offset(offset)).scalars().all()
        return {"items": [self.song_summary(song) for song in songs], "page": page(total, limit, offset)}

    def get_song(self, song_id: int, *, include_transcript: bool = False) -> dict[str, Any] | None:
        song = self.session.get(Song, song_id)
        if song is None:
            return None

        line_rows = self.session.execute(
            select(LyricLine)
            .where(LyricLine.song_id == song_id)
            .order_by(LyricLine.line_number)
        ).scalars().all()
        transcript = None
        if include_transcript:
            transcript = self.session.execute(
                select(SongTranscript.content)
                .where(SongTranscript.song_id == song_id, SongTranscript.canonical == True)  # noqa: E712
                .limit(1)
            ).scalar_one_or_none()

        detail = self.song_summary(song)
        detail.update({
            "audio_filename": song.audio_filename,
            "audio_path": song.audio_path,
            "audio_relative_path": song.audio_relative_path,
            "audio_format": song.audio_format,
            "audio_size_bytes": song.audio_size_bytes,
            "title_word_count": song.title_word_count,
            "lyric_word_count": song.lyric_word_count,
            "lines": [self.line_read(line, song_title=song.title) for line in line_rows],
            "canonical_transcript": transcript,
        })
        return detail

    def list_words(
        self,
        *,
        search: str | None = None,
        exact: str | None = None,
        simple: int | None = None,
        jewish: int | None = None,
        english: int | None = None,
        min_song_count: int | None = None,
        sort: Literal["word", "frequency", "song_count"] = "word",
        direction: Literal["asc", "desc"] = "asc",
        limit: int = DEFAULT_LIMIT,
        offset: int = 0,
    ) -> dict[str, Any]:
        limit = clamp_limit(limit)
        offset = clean_offset(offset)
        statement = select(Word)
        if search:
            statement = statement.where(Word.word.contains(search.lower()))
        if exact:
            statement = statement.where(Word.word == exact.lower())
        if simple is not None:
            statement = statement.where(Word.simple == simple)
        if jewish is not None:
            statement = statement.where(Word.jewish == jewish)
        if english is not None:
            statement = statement.where(Word.english == english)
        if min_song_count is not None:
            statement = statement.where(Word.song_count >= min_song_count)

        total = self.session.execute(select(func.count()).select_from(statement.subquery())).scalar_one()
        sort_column = {"frequency": Word.total_occurrences, "song_count": Word.song_count}.get(sort, Word.word)
        order_by = sort_column.desc() if direction == "desc" else sort_column.asc()
        words = self.session.execute(statement.order_by(order_by, Word.word).limit(limit).offset(offset)).scalars().all()
        return {"items": [self.word_read(word) for word in words], "page": page(total, limit, offset)}

    def get_word(self, word_text: str, *, limit: int = DEFAULT_LIMIT, offset: int = 0) -> dict[str, Any] | None:
        limit = clamp_limit(limit)
        offset = clean_offset(offset)
        word = self.session.execute(select(Word).where(Word.word == word_text.lower())).scalar_one_or_none()
        if word is None:
            return None

        base = (
            select(Song.id, Song.title, SongWord.occurrences)
            .join(SongWord, SongWord.song_id == Song.id)
            .where(SongWord.word_id == word.id)
        )
        total = self.session.execute(select(func.count()).select_from(base.subquery())).scalar_one()
        rows = self.session.execute(base.order_by(Song.title).limit(limit).offset(offset)).all()
        detail = self.word_read(word)
        detail["songs"] = [{"song_id": row.id, "title": row.title, "occurrences": row.occurrences} for row in rows]
        detail["page"] = page(total, limit, offset)
        return detail

    def search_lines(
        self,
        *,
        text_query: str | None = None,
        song_id: int | None = None,
        simple: int | None = None,
        jewish: int | None = None,
        english: int | None = None,
        limit: int = DEFAULT_LIMIT,
        offset: int = 0,
    ) -> dict[str, Any]:
        limit = clamp_limit(limit)
        offset = clean_offset(offset)
        statement = select(LyricLine, Song.title.label("song_title")).join(Song, Song.id == LyricLine.song_id)
        if text_query:
            statement = statement.where(LyricLine.text.contains(text_query))
        if song_id is not None:
            statement = statement.where(LyricLine.song_id == song_id)
        if simple is not None:
            statement = statement.where(LyricLine.simple == simple)
        if jewish is not None:
            statement = statement.where(LyricLine.jewish == jewish)
        if english is not None:
            statement = statement.where(LyricLine.english == english)

        total = self.session.execute(select(func.count()).select_from(statement.subquery())).scalar_one()
        rows = self.session.execute(statement.order_by(LyricLine.song_id, LyricLine.line_number).limit(limit).offset(offset)).all()
        return {
            "items": [self.line_read(row[0], song_title=row.song_title) for row in rows],
            "page": page(total, limit, offset),
        }

    def collisions(self, entity_type: Literal["word", "title", "line"], *, different_text: bool = True, limit: int = DEFAULT_LIMIT, offset: int = 0) -> dict[str, Any]:
        limit = clamp_limit(limit)
        offset = clean_offset(offset)
        if entity_type == "word":
            table = Word
            identity = Word.word
            text_column = Word.word
            base = select(Word.jewish, Word.english, Word.simple, func.count().label("count")).group_by(Word.jewish, Word.english, Word.simple).having(func.count() > 1)
        elif entity_type == "title":
            base = select(Song.title_jewish.label("jewish"), Song.title_english.label("english"), Song.title_simple.label("simple"), func.count().label("count")).group_by(Song.title_jewish, Song.title_english, Song.title_simple).having(func.count() > 1)
        else:
            distinct_count = func.count(func.distinct(LyricLine.normalized_text)) if different_text else func.count()
            base = select(LyricLine.jewish, LyricLine.english, LyricLine.simple, func.count().label("count")).group_by(LyricLine.jewish, LyricLine.english, LyricLine.simple).having(distinct_count > 1)

        total = self.session.execute(select(func.count()).select_from(base.subquery())).scalar_one()
        groups = self.session.execute(base.order_by(text("count DESC"), text("simple ASC")).limit(limit).offset(offset)).all()
        items = []
        for group in groups:
            items.append({
                "jewish": group.jewish,
                "english": group.english,
                "simple": group.simple,
                "count": group.count,
                "items": self._collision_items(entity_type, group.jewish, group.english, group.simple, different_text=different_text),
            })
        return {"items": items, "page": page(total, limit, offset)}

    def cross_type_matches(self, match_type: Literal["title-line", "word-title", "word-line"], *, limit: int = DEFAULT_LIMIT, offset: int = 0) -> dict[str, Any]:
        limit = clamp_limit(limit)
        offset = clean_offset(offset)
        if match_type == "title-line":
            statement = (
                select(Song.id.label("song_id"), Song.title, LyricLine.song_id.label("line_song_id"), LyricLine.line_number, LyricLine.text, Song.title_jewish.label("jewish"), Song.title_english.label("english"), Song.title_simple.label("simple"))
                .join(LyricLine, and_(Song.title_jewish == LyricLine.jewish, Song.title_english == LyricLine.english, Song.title_simple == LyricLine.simple))
            )
        elif match_type == "word-title":
            statement = (
                select(Word.word, Song.id.label("song_id"), Song.title, Word.jewish, Word.english, Word.simple)
                .join(Song, and_(Word.jewish == Song.title_jewish, Word.english == Song.title_english, Word.simple == Song.title_simple))
            )
        else:
            statement = (
                select(Word.word, LyricLine.song_id, LyricLine.line_number, LyricLine.text, Word.jewish, Word.english, Word.simple)
                .join(LyricLine, and_(Word.jewish == LyricLine.jewish, Word.english == LyricLine.english, Word.simple == LyricLine.simple))
            )
        total = self.session.execute(select(func.count()).select_from(statement.subquery())).scalar_one()
        rows = self.session.execute(statement.limit(limit).offset(offset)).mappings().all()
        return {"items": [dict(row) for row in rows], "page": page(total, limit, offset)}

    def song_related(self, song_id: int, *, include_line_matches: bool = False, limit: int = 25) -> dict[str, Any] | None:
        limit = clamp_limit(limit)
        song = self.session.get(Song, song_id)
        if song is None:
            return None
        triple = (song.title_jewish, song.title_english, song.title_simple)
        result = {
            "song": self.song_summary(song),
            "title_matches": {
                "titles": [self.song_summary(item) for item in self.session.execute(select(Song).where(Song.id != song.id, Song.title_jewish == triple[0], Song.title_english == triple[1], Song.title_simple == triple[2]).limit(limit)).scalars().all()],
                "lines": self.search_lines(jewish=triple[0], english=triple[1], simple=triple[2], limit=limit)["items"],
                "words": self.list_words(jewish=triple[0], english=triple[1], simple=triple[2], limit=limit)["items"],
            },
        }
        if include_line_matches:
            line_matches = []
            lines = self.session.execute(select(LyricLine).where(LyricLine.song_id == song_id).order_by(LyricLine.line_number).limit(limit)).scalars().all()
            for line in lines:
                line_matches.append({
                    "line": self.line_read(line, song_title=song.title),
                    "matching_lines": self.search_lines(jewish=line.jewish, english=line.english, simple=line.simple, limit=limit)["items"],
                    "matching_titles": [self.song_summary(item) for item in self.session.execute(select(Song).where(Song.title_jewish == line.jewish, Song.title_english == line.english, Song.title_simple == line.simple).limit(limit)).scalars().all()],
                    "matching_words": self.list_words(jewish=line.jewish, english=line.english, simple=line.simple, limit=limit)["items"],
                })
            result["line_matches"] = line_matches
        return result

    def numeric_search(self, *, jewish: int | None, english: int | None, simple: int | None, entity_types: list[str], limit: int = DEFAULT_LIMIT, offset: int = 0) -> dict[str, Any]:
        limit = clamp_limit(limit)
        offset = clean_offset(offset)
        results: dict[str, list[dict[str, Any]]] = {}
        valid_types = {"word", "title", "line", "lyrics", "title_plus_lyrics"}
        for entity_type in [item for item in entity_types if item in valid_types]:
            if entity_type == "word":
                statement = select(Word)
                statement = self._filter_triple(statement, Word, jewish, english, simple)
                results[entity_type] = [self.word_read(item) for item in self.session.execute(statement.limit(limit).offset(offset)).scalars().all()]
            elif entity_type == "line":
                results[entity_type] = self.search_lines(jewish=jewish, english=english, simple=simple, limit=limit, offset=offset)["items"]
            else:
                statement = select(Song)
                if entity_type == "title":
                    statement = self._filter_song_triple(statement, "title", jewish, english, simple)
                elif entity_type == "lyrics":
                    statement = self._filter_song_triple(statement, "lyrics", jewish, english, simple)
                else:
                    statement = self._filter_song_triple(statement, "combined", jewish, english, simple)
                results[entity_type] = [self.song_summary(item) for item in self.session.execute(statement.limit(limit).offset(offset)).scalars().all()]
        return {"results": results, "page": page(sum(len(items) for items in results.values()), limit, offset)}

    def _filter_songs(self, statement: Select, search: str | None, lyrics: str, include_artifacts: bool, only_artifacts: bool) -> Select:
        if search:
            statement = statement.where(Song.title.contains(search))
        if lyrics == "with":
            statement = statement.where(Song.lyric_available == True)  # noqa: E712
        elif lyrics == "without":
            statement = statement.where(Song.lyric_available == False)  # noqa: E712
        if only_artifacts:
            statement = statement.where(Song.likely_processing_artifact == True)  # noqa: E712
        elif not include_artifacts:
            statement = statement.where(Song.likely_processing_artifact == False)  # noqa: E712
        return statement

    def _filter_triple(self, statement: Select, model, jewish: int | None, english: int | None, simple: int | None) -> Select:
        if jewish is not None:
            statement = statement.where(model.jewish == jewish)
        if english is not None:
            statement = statement.where(model.english == english)
        if simple is not None:
            statement = statement.where(model.simple == simple)
        return statement

    def _filter_song_triple(self, statement: Select, prefix: str, jewish: int | None, english: int | None, simple: int | None) -> Select:
        columns = {
            "title": (Song.title_jewish, Song.title_english, Song.title_simple),
            "lyrics": (Song.lyrics_jewish, Song.lyrics_english, Song.lyrics_simple),
            "combined": (Song.combined_jewish, Song.combined_english, Song.combined_simple),
        }[prefix]
        if jewish is not None:
            statement = statement.where(columns[0] == jewish)
        if english is not None:
            statement = statement.where(columns[1] == english)
        if simple is not None:
            statement = statement.where(columns[2] == simple)
        return statement

    def _collision_items(self, entity_type: str, jewish: int, english: int, simple: int, *, different_text: bool) -> list[dict[str, Any]]:
        if entity_type == "word":
            return [self.word_read(item) for item in self.session.execute(select(Word).where(Word.jewish == jewish, Word.english == english, Word.simple == simple).limit(20)).scalars().all()]
        if entity_type == "title":
            return [self.song_summary(item) for item in self.session.execute(select(Song).where(Song.title_jewish == jewish, Song.title_english == english, Song.title_simple == simple).limit(20)).scalars().all()]
        statement = select(LyricLine, Song.title.label("song_title")).join(Song, Song.id == LyricLine.song_id).where(LyricLine.jewish == jewish, LyricLine.english == english, LyricLine.simple == simple)
        if different_text:
            statement = statement.order_by(LyricLine.normalized_text, LyricLine.song_id, LyricLine.line_number)
        rows = self.session.execute(statement.limit(200 if different_text else 20)).all()
        items = []
        seen_normalized = set()
        for row in rows:
            line = row[0]
            if different_text and line.normalized_text in seen_normalized:
                continue
            seen_normalized.add(line.normalized_text)
            items.append(self.line_read(line, song_title=row.song_title))
            if len(items) >= 20:
                break
        return items

    def song_summary(self, song: Song) -> dict[str, Any]:
        return {
            "id": song.id,
            "title": song.title,
            "created_at": song.created_at,
            "transcript_source": song.transcript_source,
            "lyric_available": song.lyric_available,
            "likely_processing_artifact": song.likely_processing_artifact,
            "title_gematria": gematria_dict(song.title_jewish, song.title_english, song.title_simple),
            "lyrics_gematria": gematria_dict(song.lyrics_jewish, song.lyrics_english, song.lyrics_simple),
            "combined_gematria": gematria_dict(song.combined_jewish, song.combined_english, song.combined_simple),
            "total_word_count": song.total_word_count,
            "unique_word_count": song.unique_word_count,
        }

    def word_read(self, word: Word) -> dict[str, Any]:
        return {
            "id": word.id,
            "word": word.word,
            "total_occurrences": word.total_occurrences,
            "song_count": word.song_count,
            "gematria": gematria_dict(word.jewish, word.english, word.simple),
        }

    def line_read(self, line: LyricLine, *, song_title: str | None = None) -> dict[str, Any]:
        return {
            "id": line.id,
            "song_id": line.song_id,
            "song_title": song_title,
            "line_number": line.line_number,
            "text": line.text,
            "normalized_text": line.normalized_text,
            "word_count": line.word_count,
            "letter_count": line.letter_count,
            "gematria": gematria_dict(line.jewish, line.english, line.simple),
        }
