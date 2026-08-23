#!/usr/bin/env python3

import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path("/home/nonyabiz/Programming/MySongBible")
MUSIC_ROOT = Path("/home/nonyabiz/Music/MyMusic/Albums")
OUTPUT_FILE = PROJECT_ROOT / "songs-import.json"

AUDIO_EXTENSIONS = {
    ".mp3",
    ".wav",
    ".flac",
    ".m4a",
    ".aac",
    ".ogg",
    ".opus",
    ".wma",
    ".aiff",
    ".aif",
}

TRANSCRIPT_EXTENSIONS = {
    ".txt",
    ".json",
    ".lrc",
    ".srt",
    ".vtt",
}

NUMBERED_SUFFIX_RE = re.compile(r"^(.*)_([0-9]+)$")


def filesystem_birth_time(path: Path):
    try:
        result = subprocess.run(
            ["stat", "-c", "%W", str(path)],
            capture_output=True,
            text=True,
            check=False,
        )

        if result.returncode == 0:
            value = int(result.stdout.strip())

            if value > 0:
                return value, "filesystem_birth_time"

    except (ValueError, OSError):
        pass

    return None, None


def get_creation_date(path: Path):
    timestamp, source = filesystem_birth_time(path)

    if timestamp is None:
        try:
            timestamp = path.stat().st_mtime
            source = "modified_time_fallback"
        except OSError:
            return None, "unavailable"

    dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)

    return dt.isoformat(), source


def relative_music_path(path: Path):
    try:
        return str(path.relative_to(MUSIC_ROOT))
    except ValueError:
        return str(path)


def files_in_folder(folder: Path):
    audio_files = []
    transcript_files = []

    try:
        items = list(folder.iterdir())
    except (PermissionError, OSError):
        return audio_files, transcript_files

    for item in sorted(items, key=lambda p: p.name.lower()):
        if not item.is_file():
            continue

        extension = item.suffix.lower()

        if extension in AUDIO_EXTENSIONS:
            audio_files.append(item)

        elif extension in TRANSCRIPT_EXTENSIONS:
            transcript_files.append(item)

    return audio_files, transcript_files


def looks_like_song_folder(folder: Path):
    audio_files, _ = files_in_folder(folder)
    return bool(audio_files)


def find_song_folders():
    folders = []

    for path in MUSIC_ROOT.rglob("*"):
        if path.is_dir() and looks_like_song_folder(path):
            folders.append(path)

    return sorted(folders, key=lambda p: str(p).casefold())


def build_folder_lookup(song_folders):
    lookup = {}

    for folder in song_folders:
        lookup[
            (
                str(folder.parent).casefold(),
                folder.name.casefold(),
            )
        ] = folder

    return lookup


def is_numbered_duplicate(folder: Path, lookup):
    match = NUMBERED_SUFFIX_RE.match(folder.name)

    if not match:
        return False, None

    base_name = match.group(1)

    original = lookup.get(
        (
            str(folder.parent).casefold(),
            base_name.casefold(),
        )
    )

    if original:
        return True, original

    return False, None


def choose_primary_audio(audio_files):
    preference = {
        ".mp3": 0,
        ".flac": 1,
        ".wav": 2,
        ".m4a": 3,
        ".aac": 4,
        ".ogg": 5,
        ".opus": 6,
        ".aiff": 7,
        ".aif": 8,
        ".wma": 9,
    }

    return sorted(
        audio_files,
        key=lambda p: (
            preference.get(p.suffix.lower(), 999),
            p.name.casefold(),
        ),
    )[0]


def read_text_file(path: Path):
    try:
        return path.read_text(
            encoding="utf-8",
            errors="replace",
        )
    except OSError as exc:
        return {
            "_error": str(exc)
        }


def read_transcript(path: Path):
    extension = path.suffix.lower()

    raw_text = read_text_file(path)

    if isinstance(raw_text, dict):
        return raw_text

    if extension == ".json":
        try:
            return json.loads(raw_text)
        except json.JSONDecodeError:
            # Keep malformed/non-standard JSON as raw text instead
            return raw_text

    return raw_text


def transcript_key(path: Path):
    return path.suffix.lower().lstrip(".")


def build_transcripts(transcript_files):
    transcripts = {}
    transcript_files_metadata = []

    for path in transcript_files:
        key = transcript_key(path)
        content = read_transcript(path)

        # Usually there will only be one transcript of each type.
        # If multiple exist, preserve all of them rather than silently
        # overwriting one.
        if key not in transcripts:
            transcripts[key] = content
        else:
            if not isinstance(transcripts[key], list):
                transcripts[key] = [transcripts[key]]

            transcripts[key].append(content)

        transcript_files_metadata.append({
            "type": key,
            "filename": path.name,
            "path": str(path),
            "relative_path": relative_music_path(path),
        })

    return transcripts, transcript_files_metadata


def build_catalog():
    if not MUSIC_ROOT.exists():
        raise SystemExit(
            f"Music directory does not exist:\n{MUSIC_ROOT}"
        )

    song_folders = find_song_folders()
    lookup = build_folder_lookup(song_folders)

    songs = []
    skipped_duplicates = []

    for folder in song_folders:
        duplicate, original = is_numbered_duplicate(folder, lookup)

        if duplicate:
            skipped_duplicates.append({
                "skipped_title": folder.name,
                "skipped_folder": relative_music_path(folder),
                "kept_title": original.name,
                "kept_folder": relative_music_path(original),
                "reason": "numbered_suffix_duplicate",
            })
            continue

        audio_files, transcript_files = files_in_folder(folder)

        if not audio_files:
            continue

        primary_audio = choose_primary_audio(audio_files)

        created_at, date_source = get_creation_date(folder)

        if created_at is None:
            created_at, date_source = get_creation_date(primary_audio)

        transcripts, transcript_metadata = build_transcripts(
            transcript_files
        )

        song = {
            "title": folder.name,

            "created_at": created_at,
            "creation_date_source": date_source,

            "song_file": {
                "filename": primary_audio.name,
                "path": str(primary_audio),
                "relative_path": relative_music_path(primary_audio),
                "format": primary_audio.suffix.lower().lstrip("."),
                "size_bytes": primary_audio.stat().st_size,
            },

            "transcripts": transcripts,

            "transcript_files": transcript_metadata,
        }

        songs.append(song)

    songs.sort(
        key=lambda song: (
            song["created_at"] or "",
            song["title"].casefold(),
        )
    )

    return {
        "schema_version": 1,

        "application": "My Song Bible",

        "source_directory": str(MUSIC_ROOT),

        "generated_at": datetime.now(
            timezone.utc
        ).isoformat(),

        "summary": {
            "song_folders_found": len(song_folders),
            "songs_included": len(songs),
            "numbered_duplicates_skipped": len(
                skipped_duplicates
            ),
            "songs_with_transcripts": sum(
                bool(song["transcripts"])
                for song in songs
            ),
            "songs_without_transcripts": sum(
                not bool(song["transcripts"])
                for song in songs
            ),
        },

        "songs": songs,

        "skipped_duplicates": skipped_duplicates,
    }


def main():
    catalog = build_catalog()

    OUTPUT_FILE.write_text(
        json.dumps(
            catalog,
            indent=2,
            ensure_ascii=False,
        ) + "\n",
        encoding="utf-8",
    )

    summary = catalog["summary"]

    print()
    print("===== MY SONG BIBLE IMPORT DATA =====")
    print()
    print(f"Source:")
    print(f"  {MUSIC_ROOT}")
    print()
    print(f"JSON created:")
    print(f"  {OUTPUT_FILE}")
    print()
    print(
        f"Song folders found:       "
        f"{summary['song_folders_found']}"
    )
    print(
        f"Songs included:           "
        f"{summary['songs_included']}"
    )
    print(
        f"Duplicates skipped:       "
        f"{summary['numbered_duplicates_skipped']}"
    )
    print(
        f"Songs with transcripts:   "
        f"{summary['songs_with_transcripts']}"
    )
    print(
        f"Songs without transcripts:"
        f" {summary['songs_without_transcripts']}"
    )
    print()
    print("Complete.")
    print()


if __name__ == "__main__":
    main()
