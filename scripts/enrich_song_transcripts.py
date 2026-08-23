#!/usr/bin/env python3

import argparse
import json
import os
import shutil
import tempfile
from collections import Counter
from pathlib import Path

import build_song_vocabulary as vocabulary

PROJECT_ROOT = Path(__file__).resolve().parents[1]
SONGS_IMPORT_PATH = PROJECT_ROOT / "songs-import.json"
BACKUP_PATH = PROJECT_ROOT / "songs-import.before-transcript-enrichment.json"
DEFAULT_MUSIC_ROOTS = (
    Path.home() / "Music" / "MyMusic" / "Albums",
    Path.home() / "Music" / "MyMusic-old" / "Albums",
)
TRANSCRIPT_EXTENSIONS = (".txt", ".lrc", ".srt", ".vtt", ".json")
CANONICAL_PREFERENCE = ("txt", "lrc", "srt", "vtt", "json")
METADATA_JSON_NAME_PARTS = (
    ".suno-import",
    "manifest",
    "repair",
    "stem",
    "stems",
    "separation",
    "generation",
    "processing",
    "log",
)


def load_json(path):
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


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


def song_relative_path(song):
    song_file = song.get("song_file")
    if isinstance(song_file, dict):
        return song_file.get("relative_path")
    return None


def choose_music_root(data, explicit_root=None):
    if explicit_root:
        root = explicit_root.expanduser().resolve()
        return root, count_root_matches(data, root)

    candidates = []
    source_directory = data.get("source_directory")
    if isinstance(source_directory, str):
        old_root = Path(source_directory)
        candidates.append(Path.home() / "Music" / "MyMusic" / "Albums")
        candidates.append(Path.home() / "Music" / "MyMusic-old" / "Albums")
        candidates.append(Path(str(old_root).replace("/home/nonyabiz", str(Path.home()), 1)))

    candidates.extend(DEFAULT_MUSIC_ROOTS)
    candidates = list(dict.fromkeys(path for path in candidates if path))

    scored = [
        (count_root_matches(data, candidate), candidate)
        for candidate in candidates
        if candidate.exists()
    ]
    if not scored:
        raise FileNotFoundError("Could not find a matching MyMusic/Albums root")

    score, root = max(scored, key=lambda item: item[0]["audio_matches"])
    return root, score


def count_root_matches(data, root):
    audio_matches = 0
    folder_matches = 0

    for song in data.get("songs", []):
        relative_path = song_relative_path(song)
        if not relative_path:
            continue

        audio_path = root / relative_path
        if audio_path.exists():
            audio_matches += 1
        if audio_path.parent.exists():
            folder_matches += 1

    return {
        "audio_matches": audio_matches,
        "folder_matches": folder_matches,
    }


def song_directory(song, music_root):
    relative_path = song_relative_path(song)
    if not relative_path:
        return None

    return (music_root / relative_path).parent


def read_candidate(path):
    try:
        raw_text = path.read_text(encoding="utf-8", errors="replace")
    except OSError as exc:
        return None, f"read_error: {exc}"

    if path.suffix.lower() == ".json":
        try:
            return json.loads(raw_text), None
        except json.JSONDecodeError:
            return raw_text, None

    return raw_text, None


def likely_metadata_json(path, value):
    name = path.name.lower()
    if any(part in name for part in METADATA_JSON_NAME_PARTS):
        text = vocabulary.transcript_text_for_source("json", value)
        if not vocabulary.usable_text(vocabulary.clean_transcript_text(text)):
            return True

    if not isinstance(value, dict):
        return False

    keys = {str(key).lower() for key in value}
    metadata_sets = (
        {"destination_audio_name", "imported_at", "sha256", "source_mtime_ns", "source_name", "source_size"},
        {"phase", "output_file", "source_instrumental"},
        {"source_audio", "stems", "files"},
    )
    return any(required.issubset(keys) for required in metadata_sets)


def transcript_file_record(path, music_root):
    try:
        relative_path = str(path.relative_to(music_root))
    except ValueError:
        relative_path = str(path)

    return {
        "type": path.suffix.lower().lstrip("."),
        "filename": path.name,
        "path": str(path),
        "relative_path": relative_path,
    }


def candidate_score(candidate):
    source_rank = CANONICAL_PREFERENCE.index(candidate["source"])
    path = candidate["path"]
    transcription_bonus = 0 if "transcription" in {part.lower() for part in path.parts} else 1
    return (
        source_rank,
        transcription_bonus,
        -candidate["word_count"],
        len(path.parts),
        str(path).casefold(),
    )


def scan_song_folder(song, music_root):
    folder = song_directory(song, music_root)
    result = {
        "folder": folder,
        "folder_exists": bool(folder and folder.exists()),
        "files_by_source": Counter(),
        "usable_by_source": Counter(),
        "metadata_only_files": 0,
        "marker_only_files": 0,
        "candidate_files": 0,
        "usable_candidates": [],
    }

    if not result["folder_exists"]:
        return result

    paths = []
    for extension in TRANSCRIPT_EXTENSIONS:
        paths.extend(folder.rglob(f"*{extension}"))

    for path in sorted(paths, key=lambda item: str(item).casefold()):
        if not path.is_file():
            continue

        source = path.suffix.lower().lstrip(".")
        result["candidate_files"] += 1
        result["files_by_source"][source] += 1

        value, error = read_candidate(path)
        if error:
            continue

        if source == "json" and likely_metadata_json(path, value):
            result["metadata_only_files"] += 1
            continue

        text = vocabulary.transcript_text_for_source(source, value)
        clean_text = vocabulary.clean_transcript_text(text)
        tokens = vocabulary.tokenize(clean_text)

        if not tokens:
            if isinstance(text, str) and text.strip():
                result["marker_only_files"] += 1
            continue

        result["usable_by_source"][source] += 1
        result["usable_candidates"].append({
            "source": source,
            "path": path,
            "value": value,
            "word_count": len(tokens),
        })

    return result


def append_unique_transcript_file(song, record):
    transcript_files = song.setdefault("transcript_files", [])
    if not isinstance(transcript_files, list):
        transcript_files = []
        song["transcript_files"] = transcript_files

    existing = {
        (
            item.get("type"),
            item.get("relative_path"),
            item.get("filename"),
        )
        for item in transcript_files
        if isinstance(item, dict)
    }
    key = (record["type"], record["relative_path"], record["filename"])

    if key not in existing:
        transcript_files.append(record)


def add_transcript_value(song, source, value):
    transcripts = song.setdefault("transcripts", {})
    if not isinstance(transcripts, dict):
        transcripts = {}
        song["transcripts"] = transcripts

    if source != "json":
        transcripts[source] = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
        return

    existing = transcripts.get("json")
    if existing is None:
        transcripts["json"] = value
    elif isinstance(existing, list):
        serialized_existing = {json.dumps(item, sort_keys=True, ensure_ascii=False) for item in existing}
        serialized_value = json.dumps(value, sort_keys=True, ensure_ascii=False)
        if serialized_value not in serialized_existing:
            existing.append(value)
    else:
        serialized_existing = json.dumps(existing, sort_keys=True, ensure_ascii=False)
        serialized_value = json.dumps(value, sort_keys=True, ensure_ascii=False)
        if serialized_existing != serialized_value:
            transcripts["json"] = [existing, value]


def enrich(data, music_root):
    previously_missing = [
        song
        for song in data.get("songs", [])
        if song.get("word_analysis", {}).get("transcript_source") is None
    ]
    stats = Counter()
    source_counts = Counter()
    recovered_examples = []
    missing_examples = []

    total = len(previously_missing)
    for index, song in enumerate(previously_missing, 1):
        if index == 1 or index % 100 == 0 or index == total:
            print(f"Scanning missing song {index}/{total}: {song.get('title', '')}")

        scan = scan_song_folder(song, music_root)
        stats["previously_missing"] += 1

        if not scan["folder_exists"]:
            stats["song_folder_missing"] += 1
            if len(missing_examples) < 20:
                missing_examples.append((song.get("title", ""), "song folder missing"))
            continue

        if scan["candidate_files"] == 0:
            stats["genuinely_no_transcript_file"] += 1
            if len(missing_examples) < 20:
                missing_examples.append((song.get("title", ""), "no transcript candidates in song directory"))
            continue

        if scan["usable_candidates"]:
            selected = sorted(scan["usable_candidates"], key=candidate_score)[0]
            add_transcript_value(song, selected["source"], selected["value"])
            append_unique_transcript_file(song, transcript_file_record(selected["path"], music_root))

            stats["recovered"] += 1
            source_counts[selected["source"]] += 1
            if len(recovered_examples) < 20:
                recovered_examples.append((
                    song.get("title", ""),
                    selected["source"],
                    selected["word_count"],
                    str(selected["path"].relative_to(music_root)),
                ))
            continue

        if scan["marker_only_files"]:
            stats["marker_only"] += 1
            if len(missing_examples) < 20:
                missing_examples.append((song.get("title", ""), "candidate files contain only non-speech markers"))
        elif scan["metadata_only_files"]:
            stats["metadata_json_only"] += 1
            if len(missing_examples) < 20:
                missing_examples.append((song.get("title", ""), "metadata JSON only"))
        else:
            stats["genuinely_no_usable_transcript"] += 1
            if len(missing_examples) < 20:
                missing_examples.append((song.get("title", ""), "candidate files had no usable text"))

    return stats, source_counts, recovered_examples, missing_examples


def print_report(music_root, root_score, stats, source_counts, recovered_examples, missing_examples):
    print("\nTranscript enrichment complete")
    print(f"music root used: {music_root}")
    print(f"root audio matches: {root_score['audio_matches']}")
    print(f"root folder matches: {root_score['folder_matches']}")
    print(f"previously missing songs inspected: {stats['previously_missing']}")
    print(f"recovered from disk: {stats['recovered']}")
    print(f"marker-only transcript files: {stats['marker_only']}")
    print(f"metadata JSON only: {stats['metadata_json_only']}")
    print(f"genuinely no transcript file: {stats['genuinely_no_transcript_file']}")
    print(f"song folder missing: {stats['song_folder_missing']}")
    print(f"other no usable transcript: {stats['genuinely_no_usable_transcript']}")
    print(f"recovered canonical source counts: {dict(sorted(source_counts.items()))}")

    print("\n20 recovered examples")
    for title, source, word_count, relative_path in recovered_examples:
        print(f"{title}\t{source}\t{word_count}\t{relative_path}")

    print("\n20 genuinely missing examples")
    for title, reason in missing_examples:
        print(f"{title}\t{reason}")


def main():
    parser = argparse.ArgumentParser(
        description="Recover missing transcript files from song folders into songs-import.json.",
    )
    parser.add_argument(
        "--input",
        type=Path,
        default=SONGS_IMPORT_PATH,
        help="Path to songs-import.json",
    )
    parser.add_argument(
        "--music-root",
        type=Path,
        default=None,
        help="Current MyMusic/Albums root. Auto-detected when omitted.",
    )
    args = parser.parse_args()

    input_path = args.input.resolve()
    data = load_json(input_path)
    music_root, root_score = choose_music_root(data, args.music_root)

    backup_path = input_path.with_name(BACKUP_PATH.name)
    if not backup_path.exists():
        shutil.copy2(input_path, backup_path)

    stats, source_counts, recovered_examples, missing_examples = enrich(data, music_root)
    write_json_atomic(input_path, data)
    load_json(input_path)
    print_report(music_root, root_score, stats, source_counts, recovered_examples, missing_examples)


if __name__ == "__main__":
    main()
