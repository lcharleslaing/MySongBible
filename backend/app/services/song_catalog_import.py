from __future__ import annotations

import json
import re
import time
from collections import Counter
from pathlib import Path
from typing import Any

from sqlalchemy import delete, func, inspect, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from sqlmodel import SQLModel

from app.db import base  # noqa: F401
from app.db.session import engine
from app.models.song_catalog import (
    LineWord,
    LyricLine,
    Song,
    SongSection,
    SongTranscript,
    SongWord,
    Word,
)


CATALOG_MODELS = (
    LineWord,
    SongSection,
    LyricLine,
    SongWord,
    SongTranscript,
    Word,
    Song,
)
CATALOG_TABLE_NAMES = {model.__tablename__ for model in CATALOG_MODELS}
LIKELY_PROCESSING_ARTIFACTS = {"2-stem", "phase2", "phase3", "phase4", "phase5"}
APOSTROPHE_TRANSLATION = str.maketrans({
    "\u2018": "'",
    "\u2019": "'",
    "\u201a": "'",
    "\u201b": "'",
    "\u2032": "'",
    "\uff07": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u201e": '"',
    "\u201f": '"',
})
HYPHEN_RE = re.compile(r"[-\u2010-\u2015]+")
WORD_RE = re.compile(r"[a-z]+(?:'[a-z]+)*")


def load_catalog(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def canonical_transcript_content(song: dict[str, Any]) -> str | None:
    source = song.get("word_analysis", {}).get("transcript_source")
    if not source:
        return None

    transcripts = song.get("transcripts")
    if not isinstance(transcripts, dict):
        return None

    value = transcripts.get(source)
    if isinstance(value, str):
        return value

    if source == "json":
        return json.dumps(value, ensure_ascii=False) if value is not None else None

    return None


def transcript_source_record(song: dict[str, Any]) -> dict[str, Any] | None:
    source = song.get("word_analysis", {}).get("transcript_source")
    if not source:
        return None

    transcript_files = song.get("transcript_files")
    if not isinstance(transcript_files, list):
        return None

    for record in reversed(transcript_files):
        if isinstance(record, dict) and record.get("type") == source:
            return record

    return None


def normalized_line_text(line: dict[str, Any]) -> str:
    return " ".join(tokenize(line.get("text", "")))


def tokenize(value: object) -> list[str]:
    normalized = HYPHEN_RE.sub(" ", str(value or "").translate(APOSTROPHE_TRANSLATION).lower())
    return WORD_RE.findall(normalized)


def gematria_values(source: dict[str, Any] | None) -> tuple[int | None, int | None, int | None]:
    if not isinstance(source, dict):
        return None, None, None
    return source.get("jewish"), source.get("english"), source.get("simple")


def capture_non_catalog_counts(connection) -> dict[str, int]:
    table_names = inspect(connection).get_table_names()
    counts: dict[str, int] = {}

    for table_name in table_names:
        if table_name in CATALOG_TABLE_NAMES or table_name.startswith("sqlite_"):
            continue
        counts[table_name] = connection.execute(text(f'SELECT COUNT(*) FROM "{table_name}"')).scalar_one()

    return counts


def rebuild_catalog_tables(session: Session) -> None:
    for model in CATALOG_MODELS:
        session.execute(delete(model))


def recreate_catalog_schema(db_engine: Engine) -> None:
    tables = [model.__table__ for model in CATALOG_MODELS]
    SQLModel.metadata.drop_all(db_engine, tables=tables)
    SQLModel.metadata.create_all(db_engine)


def insert_words(session: Session, catalog: dict[str, Any]) -> dict[str, int]:
    rows = []
    for item in catalog["vocabulary"]["words"]:
        rows.append({
            "word": item["word"],
            "jewish": item["gematria"]["jewish"],
            "english": item["gematria"]["english"],
            "simple": item["gematria"]["simple"],
            "total_occurrences": item["total_occurrences"],
            "song_count": item["song_count"],
        })

    session.bulk_insert_mappings(Word, rows)
    session.flush()

    return dict(session.execute(select(Word.word, Word.id)).all())


def insert_songs(session: Session, catalog: dict[str, Any]) -> dict[int, int]:
    rows = []
    for source_index, song in enumerate(catalog["songs"]):
        song_file = song.get("song_file") if isinstance(song.get("song_file"), dict) else {}
        word_analysis = song.get("word_analysis") or {}
        title_gematria = song["gematria_analysis"]["title"]["gematria"]
        lyrics = song["gematria_analysis"]["lyrics"]
        lyrics_gematria = lyrics["gematria"] if lyrics.get("available") else {}
        combined_gematria = song["gematria_analysis"]["combined"]["title_plus_lyrics"]["gematria"]
        rows.append({
            "id": source_index + 1,
            "title": song.get("title", ""),
            "created_at": song.get("created_at"),
            "creation_date_source": song.get("creation_date_source"),
            "audio_filename": song_file.get("filename"),
            "audio_path": song_file.get("path"),
            "audio_relative_path": song_file.get("relative_path"),
            "audio_format": song_file.get("format"),
            "audio_size_bytes": song_file.get("size_bytes"),
            "transcript_source": word_analysis.get("transcript_source"),
            "lyric_available": bool(lyrics.get("available")),
            "likely_processing_artifact": song.get("title") in LIKELY_PROCESSING_ARTIFACTS,
            "title_jewish": title_gematria["jewish"],
            "title_english": title_gematria["english"],
            "title_simple": title_gematria["simple"],
            "lyrics_jewish": lyrics_gematria.get("jewish"),
            "lyrics_english": lyrics_gematria.get("english"),
            "lyrics_simple": lyrics_gematria.get("simple"),
            "combined_jewish": combined_gematria["jewish"],
            "combined_english": combined_gematria["english"],
            "combined_simple": combined_gematria["simple"],
            "title_word_count": word_analysis.get("title_word_count", 0),
            "lyric_word_count": word_analysis.get("lyric_word_count", 0),
            "total_word_count": word_analysis.get("total_words", 0),
            "unique_word_count": word_analysis.get("unique_word_count", 0),
        })

    session.bulk_insert_mappings(Song, rows)
    session.flush()

    return {source_index: source_index + 1 for source_index in range(len(catalog["songs"]))}


def insert_song_transcripts(session: Session, catalog: dict[str, Any], song_ids: dict[int, int]) -> None:
    rows = []
    for source_index, song in enumerate(catalog["songs"]):
        content = canonical_transcript_content(song)
        source = song.get("word_analysis", {}).get("transcript_source")
        if not source or not content:
            continue

        source_record = transcript_source_record(song) or {}
        rows.append({
            "song_id": song_ids[source_index],
            "source": source,
            "content": content,
            "source_path": source_record.get("path"),
            "source_relative_path": source_record.get("relative_path"),
            "canonical": True,
        })

    session.bulk_insert_mappings(SongTranscript, rows)
    session.flush()


def insert_song_words(session: Session, catalog: dict[str, Any], song_ids: dict[int, int], word_ids: dict[str, int]) -> None:
    rows = []
    for source_index, song in enumerate(catalog["songs"]):
        frequencies = song.get("word_analysis", {}).get("word_frequencies") or {}
        for word, occurrences in frequencies.items():
            word_id = word_ids.get(word)
            if word_id is None:
                raise ValueError(f"Song references word not found in vocabulary: {word}")
            rows.append({
                "song_id": song_ids[source_index],
                "word_id": word_id,
                "occurrences": occurrences,
            })

    session.bulk_insert_mappings(SongWord, rows)
    session.flush()


def insert_lines_and_line_words(
    session: Session,
    catalog: dict[str, Any],
    song_ids: dict[int, int],
    word_ids: dict[str, int],
) -> None:
    line_rows = []
    line_key_to_words = []

    for source_index, song in enumerate(catalog["songs"]):
        lyrics = song.get("gematria_analysis", {}).get("lyrics") or {}
        for line in lyrics.get("lines") or []:
            line_rows.append({
                "song_id": song_ids[source_index],
                "line_number": line["line_number"],
                "text": line["text"],
                "normalized_text": normalized_line_text(line),
                "word_count": line["word_count"],
                "letter_count": line["letter_count"],
                "jewish": line["gematria"]["jewish"],
                "english": line["gematria"]["english"],
                "simple": line["gematria"]["simple"],
            })
            line_key_to_words.append((song_ids[source_index], line["line_number"], tokenize(line["text"])))

    session.bulk_insert_mappings(LyricLine, line_rows)
    session.flush()

    line_ids = {
        (song_id, line_number): line_id
        for song_id, line_number, line_id in session.execute(select(LyricLine.song_id, LyricLine.line_number, LyricLine.id)).all()
    }
    line_word_rows = []

    for song_id, line_number, words in line_key_to_words:
        line_id = line_ids[(song_id, line_number)]
        for position, word in enumerate(words, start=1):
            word_id = word_ids.get(word)
            if word_id is None:
                raise ValueError(f"Line references word not found in vocabulary: {word}")
            line_word_rows.append({
                "line_id": line_id,
                "word_id": word_id,
                "position": position,
            })

    session.bulk_insert_mappings(LineWord, line_word_rows)
    session.flush()


def insert_sections(session: Session, catalog: dict[str, Any], song_ids: dict[int, int]) -> None:
    rows = []
    for source_index, song in enumerate(catalog["songs"]):
        lyrics = song.get("gematria_analysis", {}).get("lyrics") or {}
        for section in lyrics.get("sections") or []:
            rows.append({
                "song_id": song_ids[source_index],
                "section_number": section["section_number"],
                "section_type": section["type"],
                "label": section["label"],
                "start_line": section["start_line"],
                "end_line": section["end_line"],
                "jewish": section["gematria"]["jewish"],
                "english": section["gematria"]["english"],
                "simple": section["gematria"]["simple"],
            })

    if rows:
        session.bulk_insert_mappings(SongSection, rows)
        session.flush()


def table_count(session: Session, model: type[SQLModel]) -> int:
    return session.execute(select(func.count()).select_from(model)).scalar_one()


def validate_import(
    session: Session,
    catalog: dict[str, Any],
    before_non_catalog_counts: dict[str, int],
    after_non_catalog_counts: dict[str, int],
) -> dict[str, bool]:
    counts = database_counts(session)
    expected_lines = sum(
        len((song.get("gematria_analysis", {}).get("lyrics") or {}).get("lines") or [])
        for song in catalog["songs"]
    )

    validations = {
        "all_song_records_imported": counts["songs"] == 1200,
        "all_vocabulary_words_imported_once": counts["words"] == 8873,
        "all_lyric_lines_imported": counts["lyric_lines"] == expected_lines == 55736,
        "canonical_transcripts_available": counts["song_transcripts"] == 1188,
        "lyric_unavailable_songs_remain": session.execute(select(func.count()).select_from(Song).where(Song.lyric_available == False)).scalar_one() == 12,  # noqa: E712
        "processing_artifacts_identified": session.execute(select(func.count()).select_from(Song).where(Song.likely_processing_artifact == True)).scalar_one() == 5,  # noqa: E712
        "word_gematria_matches_source": validate_word_gematria(session, catalog),
        "lyric_line_gematria_matches_source": validate_line_gematria(session, catalog),
        "english_equals_simple_times_six": validate_english_simple(session),
        "foreign_keys_resolve": validate_foreign_keys(session),
        "no_duplicate_song_words": validate_unique_pairs(session, "song_word", "song_id", "word_id"),
        "no_duplicate_song_lines": validate_unique_pairs(session, "lyric_line", "song_id", "line_number"),
        "unrelated_tables_untouched": before_non_catalog_counts == after_non_catalog_counts,
    }

    failed = [name for name, ok in validations.items() if not ok]
    if failed:
        raise ValueError(f"Import validation failed: {', '.join(failed)}")

    return validations


def validate_word_gematria(session: Session, catalog: dict[str, Any]) -> bool:
    sample_words = {
        item["word"]: item["gematria"]
        for item in catalog["vocabulary"]["words"][:: max(1, len(catalog["vocabulary"]["words"]) // 100)]
    }
    rows = session.execute(select(Word).where(Word.word.in_(sample_words))).scalars().all()
    return all(
        row.jewish == sample_words[row.word]["jewish"]
        and row.english == sample_words[row.word]["english"]
        and row.simple == sample_words[row.word]["simple"]
        for row in rows
    )


def validate_line_gematria(session: Session, catalog: dict[str, Any]) -> bool:
    first_line_by_song = {}
    for index, song in enumerate(catalog["songs"], start=1):
        lines = (song.get("gematria_analysis", {}).get("lyrics") or {}).get("lines") or []
        if lines:
            first_line_by_song[index] = lines[0]["gematria"]
        if len(first_line_by_song) >= 100:
            break

    rows = session.execute(select(LyricLine).where(LyricLine.song_id.in_(first_line_by_song), LyricLine.line_number == 1)).scalars().all()
    return all(
        row.jewish == first_line_by_song[row.song_id]["jewish"]
        and row.english == first_line_by_song[row.song_id]["english"]
        and row.simple == first_line_by_song[row.song_id]["simple"]
        for row in rows
    )


def validate_english_simple(session: Session) -> bool:
    checks = [
        session.execute(select(func.count()).select_from(Word).where(Word.english != Word.simple * 6)).scalar_one(),
        session.execute(select(func.count()).select_from(Song).where(Song.title_english != Song.title_simple * 6)).scalar_one(),
        session.execute(select(func.count()).select_from(Song).where(Song.lyrics_english.is_not(None), Song.lyrics_english != Song.lyrics_simple * 6)).scalar_one(),
        session.execute(select(func.count()).select_from(LyricLine).where(LyricLine.english != LyricLine.simple * 6)).scalar_one(),
        session.execute(select(func.count()).select_from(SongSection).where(SongSection.english != SongSection.simple * 6)).scalar_one(),
    ]
    return all(count == 0 for count in checks)


def validate_foreign_keys(session: Session) -> bool:
    checks = [
        session.execute(text("SELECT COUNT(*) FROM song_transcript st LEFT JOIN song s ON s.id = st.song_id WHERE s.id IS NULL")).scalar_one(),
        session.execute(text("SELECT COUNT(*) FROM song_word sw LEFT JOIN song s ON s.id = sw.song_id LEFT JOIN word w ON w.id = sw.word_id WHERE s.id IS NULL OR w.id IS NULL")).scalar_one(),
        session.execute(text("SELECT COUNT(*) FROM lyric_line ll LEFT JOIN song s ON s.id = ll.song_id WHERE s.id IS NULL")).scalar_one(),
        session.execute(text("SELECT COUNT(*) FROM line_word lw LEFT JOIN lyric_line ll ON ll.id = lw.line_id LEFT JOIN word w ON w.id = lw.word_id WHERE ll.id IS NULL OR w.id IS NULL")).scalar_one(),
        session.execute(text("SELECT COUNT(*) FROM song_section ss LEFT JOIN song s ON s.id = ss.song_id WHERE s.id IS NULL")).scalar_one(),
    ]
    return all(count == 0 for count in checks)


def validate_unique_pairs(session: Session, table_name: str, first: str, second: str) -> bool:
    duplicate_count = session.execute(text(
        f'SELECT COUNT(*) FROM (SELECT "{first}", "{second}", COUNT(*) AS count FROM "{table_name}" GROUP BY "{first}", "{second}" HAVING count > 1)'
    )).scalar_one()
    return duplicate_count == 0


def database_counts(session: Session) -> dict[str, int]:
    return {
        "songs": table_count(session, Song),
        "song_transcripts": table_count(session, SongTranscript),
        "words": table_count(session, Word),
        "song_words": table_count(session, SongWord),
        "lyric_lines": table_count(session, LyricLine),
        "line_words": table_count(session, LineWord),
        "song_sections": table_count(session, SongSection),
    }


def example_queries(session: Session) -> dict[str, list[dict[str, Any]]]:
    queries = {
        "words_simple_54": """
            SELECT word, jewish, english, simple
            FROM word
            WHERE simple = 54
            ORDER BY word
            LIMIT 20
        """,
        "exact_line_collisions": """
            SELECT a.text AS line_a, b.text AS line_b, a.jewish, a.english, a.simple
            FROM lyric_line a
            JOIN lyric_line b
              ON a.id < b.id
             AND a.jewish = b.jewish
             AND a.english = b.english
             AND a.simple = b.simple
             AND a.normalized_text <> b.normalized_text
            ORDER BY a.simple, a.jewish
            LIMIT 10
        """,
        "title_line_matches": """
            SELECT s.title, ll.text AS line_text, s.title_jewish AS jewish, s.title_english AS english, s.title_simple AS simple
            FROM song s
            JOIN lyric_line ll
              ON s.title_jewish = ll.jewish
             AND s.title_english = ll.english
             AND s.title_simple = ll.simple
            ORDER BY s.title
            LIMIT 10
        """,
        "word_title_matches": """
            SELECT w.word, s.title, w.jewish, w.english, w.simple
            FROM word w
            JOIN song s
              ON w.jewish = s.title_jewish
             AND w.english = s.title_english
             AND w.simple = s.title_simple
            ORDER BY w.word, s.title
            LIMIT 10
        """,
    }

    results = {}
    for name, sql in queries.items():
        rows = session.execute(text(sql)).mappings().all()
        results[name] = [dict(row) for row in rows]
    return results


def index_list(session: Session) -> dict[str, list[str]]:
    tables = ["word", "song", "lyric_line", "song_word", "line_word", "song_transcript", "song_section"]
    return {
        table_name: [
            row[1]
            for row in session.execute(text(f'PRAGMA index_list("{table_name}")')).all()
        ]
        for table_name in tables
    }


def import_song_catalog(catalog_path: Path) -> dict[str, Any]:
    started_at = time.perf_counter()
    catalog = load_catalog(catalog_path)
    db_path = database_path(engine)
    db_size_before = db_path.stat().st_size if db_path and db_path.exists() else 0

    with engine.connect() as connection:
        before_non_catalog_counts = capture_non_catalog_counts(connection)

    recreate_catalog_schema(engine)

    with Session(engine) as session:
        with session.begin():
            rebuild_catalog_tables(session)
            word_ids = insert_words(session, catalog)
            song_ids = insert_songs(session, catalog)
            insert_song_transcripts(session, catalog, song_ids)
            insert_song_words(session, catalog, song_ids, word_ids)
            insert_lines_and_line_words(session, catalog, song_ids, word_ids)
            insert_sections(session, catalog, song_ids)

    with Session(engine) as session:
        with engine.connect() as connection:
            after_non_catalog_counts = capture_non_catalog_counts(connection)
        counts = database_counts(session)
        validations = validate_import(session, catalog, before_non_catalog_counts, after_non_catalog_counts)
        examples = example_queries(session)
        indexes = index_list(session)
        source_counts = dict(Counter(row[0] or "none" for row in session.execute(select(Song.transcript_source)).all()))

    db_size_after = db_path.stat().st_size if db_path and db_path.exists() else 0
    duration = time.perf_counter() - started_at

    return {
        "db_path": str(db_path) if db_path else str(engine.url),
        "db_size_before": db_size_before,
        "db_size_after": db_size_after,
        "duration_seconds": duration,
        "counts": counts,
        "validations": validations,
        "examples": examples,
        "indexes": indexes,
        "transcript_source_counts": source_counts,
        "unrelated_table_counts": before_non_catalog_counts,
    }


def database_path(db_engine: Engine) -> Path | None:
    if db_engine.url.drivername != "sqlite":
        return None
    database = db_engine.url.database
    if not database:
        return None
    return Path(database).resolve()
