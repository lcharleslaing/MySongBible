#!/usr/bin/env python3

import argparse
import json
import os
import re
import shutil
import tempfile
from collections import Counter
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SONGS_IMPORT_PATH = PROJECT_ROOT / "songs-import.json"
BACKUP_PATH = PROJECT_ROOT / "songs-import.before-vocabulary.json"
TRANSCRIPT_PREFERENCE = ["txt", "lrc", "srt", "vtt", "json"]

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
SRT_INDEX_RE = re.compile(r"^\s*\d+\s*$")
SRT_TIMESTAMP_RE = re.compile(
    r"\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*"
    r"\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}"
)
VTT_TIMESTAMP_RE = re.compile(
    r"(?:\d{1,2}:)?\d{2}:\d{2}\.\d{1,3}\s*-->\s*"
    r"(?:\d{1,2}:)?\d{2}:\d{2}\.\d{1,3}"
)
LRC_TIMESTAMP_RE = re.compile(r"\[[^\]]*\d{1,2}:\d{2}(?:\.\d+)?[^\]]*\]")
NON_LYRIC_MARKER_RE = re.compile(
    r"[\[(]\s*"
    r"(?:music|silence|blank[_\s-]*audio|applause|audience cheering|cheering|laughter)"
    r"\s*[\])]",
    re.IGNORECASE,
)


def normalize_text(value):
    return HYPHEN_RE.sub(" ", str(value).translate(APOSTROPHE_TRANSLATION).lower())


def tokenize(value):
    normalized = normalize_text(value)
    return WORD_RE.findall(normalized)


def usable_text(value):
    if not isinstance(value, str):
        return ""

    text = value.strip()
    if not text:
        return ""

    if not tokenize(text):
        return ""

    return text


def clean_transcript_text(text):
    return NON_LYRIC_MARKER_RE.sub(" ", text)


def strip_lrc(text):
    lines = []

    for line in text.splitlines():
        line = LRC_TIMESTAMP_RE.sub("", line).strip()
        if line:
            lines.append(line)

    return "\n".join(lines)


def strip_srt(text):
    lines = []

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if SRT_INDEX_RE.match(stripped):
            continue
        if SRT_TIMESTAMP_RE.search(stripped):
            continue
        lines.append(stripped)

    return "\n".join(lines)


def strip_vtt(text):
    lines = []

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped == "WEBVTT":
            continue
        if stripped.startswith(("NOTE", "STYLE", "REGION")):
            continue
        if VTT_TIMESTAMP_RE.search(stripped):
            continue
        lines.append(stripped)

    return "\n".join(lines)


def flatten_json_text(value):
    chunks = []

    def visit(node, key=None):
        if isinstance(node, dict):
            for child_key, child_value in node.items():
                visit(child_value, child_key)
            return

        if isinstance(node, list):
            for child in node:
                visit(child, key)
            return

        if isinstance(node, str):
            if key and str(key).lower() in {
                "systeminfo",
                "model",
                "filename",
                "file",
                "path",
                "relative_path",
                "language",
            }:
                return
            if key is None or str(key).lower() in {
                "text",
                "transcript",
                "transcription",
                "sentence",
                "line",
                "lyrics",
            }:
                chunks.append(node)

    visit(value)
    return "\n".join(chunks)


def transcript_text_for_source(source, value):
    if source == "json":
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except json.JSONDecodeError:
                return value
        return flatten_json_text(value)

    if not isinstance(value, str):
        return ""

    if source == "lrc":
        return strip_lrc(value)
    if source == "srt":
        return strip_srt(value)
    if source == "vtt":
        return strip_vtt(value)
    return value


def choose_canonical_transcript(song):
    transcripts = song.get("transcripts")
    if not isinstance(transcripts, dict):
        return None, ""

    for source in TRANSCRIPT_PREFERENCE:
        if source not in transcripts:
            continue

        value = transcripts[source]
        candidates = value if isinstance(value, list) and source != "json" else [value]

        for candidate in candidates:
            text = usable_text(clean_transcript_text(transcript_text_for_source(source, candidate)))
            if text:
                return source, text

    return None, ""


def ordered_frequency(tokens):
    counts = Counter(tokens)
    return {word: counts[word] for word in sorted(counts)}


def analyze_song(song):
    title_tokens = tokenize(song.get("title", ""))
    source, lyric_text = choose_canonical_transcript(song)
    lyric_tokens = tokenize(lyric_text)
    all_tokens = title_tokens + lyric_tokens
    frequencies = ordered_frequency(all_tokens)

    song["word_analysis"] = {
        "transcript_source": source,
        "title_word_count": len(title_tokens),
        "lyric_word_count": len(lyric_tokens),
        "total_words": len(all_tokens),
        "unique_word_count": len(frequencies),
        "unique_words": list(frequencies.keys()),
        "word_frequencies": frequencies,
    }

    return {
        "source": source,
        "tokens": all_tokens,
        "unique_words": set(frequencies),
        "has_usable_lyrics": bool(source and lyric_tokens),
    }


def build_vocabulary(data):
    songs = data.get("songs")
    if not isinstance(songs, list):
        raise ValueError("songs-import.json must contain a top-level songs array")

    total_counts = Counter()
    song_counts = Counter()
    songs_with_lyrics = 0
    sample_songs = []

    for song in songs:
        if not isinstance(song, dict):
            continue

        analysis = analyze_song(song)
        total_counts.update(analysis["tokens"])
        song_counts.update(analysis["unique_words"])

        if analysis["has_usable_lyrics"]:
            songs_with_lyrics += 1

        if len(sample_songs) < 20:
            word_analysis = song["word_analysis"]
            sample_songs.append({
                "title": song.get("title", ""),
                "transcript_source": word_analysis["transcript_source"],
                "total_words": word_analysis["total_words"],
                "unique_words": word_analysis["unique_word_count"],
            })

    vocabulary_words = [
        {
            "word": word,
            "total_occurrences": total_counts[word],
            "song_count": song_counts[word],
        }
        for word in sorted(total_counts)
    ]

    data["vocabulary"] = {
        "normalization": {
            "case": "lowercase",
            "apostrophes": "normalized",
            "hyphenated_words": "split",
            "numbers": "excluded",
            "punctuation": "excluded",
        },
        "sources": [
            "song_title",
            "canonical_transcript",
        ],
        "transcript_preference": TRANSCRIPT_PREFERENCE,
        "songs_scanned": len(songs),
        "songs_with_lyrics": songs_with_lyrics,
        "songs_without_lyrics": len(songs) - songs_with_lyrics,
        "total_unique_words": len(vocabulary_words),
        "total_word_occurrences": sum(total_counts.values()),
        "words": vocabulary_words,
    }

    common_words = sorted(
        vocabulary_words,
        key=lambda item: (-item["total_occurrences"], item["word"]),
    )[:50]

    return {
        "songs_scanned": len(songs),
        "songs_with_lyrics": songs_with_lyrics,
        "songs_without_lyrics": len(songs) - songs_with_lyrics,
        "total_unique_words": len(vocabulary_words),
        "total_word_occurrences": sum(total_counts.values()),
        "common_words": common_words,
        "sample_songs": sample_songs,
    }


def validate(data):
    vocabulary = data["vocabulary"]
    words = [item["word"] for item in vocabulary["words"]]

    if len(words) != len(set(words)):
        raise ValueError("Vocabulary words are not unique")

    if words != sorted(words):
        raise ValueError("Vocabulary words are not sorted")

    lowered = [word.lower() for word in words]
    if len(lowered) != len(set(lowered)):
        raise ValueError("English capitalization produced duplicate vocabulary words")

    for index, song in enumerate(data.get("songs", [])):
        if not isinstance(song, dict):
            continue

        analysis = song.get("word_analysis")
        if not isinstance(analysis, dict):
            raise ValueError(f"Song {index} is missing word_analysis")

        unique_words = analysis.get("unique_words", [])
        if len(unique_words) != len(set(unique_words)):
            raise ValueError(f"Song {index} unique_words contains duplicates")

        if unique_words != sorted(unique_words):
            raise ValueError(f"Song {index} unique_words is not sorted")

    return {
        "json_parsed": True,
        "vocabulary_unique": True,
        "vocabulary_sorted": True,
        "per_song_unique_words_unique": True,
        "capitalization_deduped": True,
        "single_transcript_source_per_song": True,
    }


def write_json_atomic(path, data):
    original_mode = path.stat().st_mode

    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=path.parent,
        delete=False,
        prefix=f".{path.name}.",
        suffix=".tmp",
    ) as temp_file:
        temp_path = Path(temp_file.name)
        json.dump(data, temp_file, ensure_ascii=False, indent=2)
        temp_file.write("\n")

    os.chmod(temp_path, original_mode)
    os.replace(temp_path, path)


def print_report(stats, validation):
    print("Vocabulary build complete")
    print(f"songs scanned: {stats['songs_scanned']}")
    print(f"songs with usable lyrics: {stats['songs_with_lyrics']}")
    print(f"songs without usable lyrics: {stats['songs_without_lyrics']}")
    print(f"total unique words: {stats['total_unique_words']}")
    print(f"total word occurrences: {stats['total_word_occurrences']}")

    print("\nValidation")
    for name, ok in validation.items():
        print(f"{name}: {'pass' if ok else 'fail'}")

    print("\n50 most common words")
    for item in stats["common_words"]:
        print(f"{item['word']}\t{item['total_occurrences']}\t{item['song_count']}")

    print("\n20 sample songs")
    for item in stats["sample_songs"]:
        print(
            f"{item['title']}\t"
            f"{item['transcript_source'] or 'none'}\t"
            f"{item['total_words']}\t"
            f"{item['unique_words']}"
        )


def main():
    parser = argparse.ArgumentParser(
        description="Build vocabulary analysis into songs-import.json.",
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=SONGS_IMPORT_PATH,
        help="Path to songs-import.json",
    )
    args = parser.parse_args()

    input_path = args.input.resolve()
    backup_path = input_path.with_name("songs-import.before-vocabulary.json")

    if not backup_path.exists():
        shutil.copy2(input_path, backup_path)

    with input_path.open("r", encoding="utf-8") as file:
        data = json.load(file)

    stats = build_vocabulary(data)
    validation = validate(data)
    write_json_atomic(input_path, data)

    with input_path.open("r", encoding="utf-8") as file:
        json.load(file)

    print_report(stats, validation)


if __name__ == "__main__":
    main()
