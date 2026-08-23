#!/usr/bin/env python3

import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path("/home/nonyabiz/Programming/MySongBible")
CATALOG_FILE = PROJECT_ROOT / "songs-import.json"
CATALOG_BUILDER = PROJECT_ROOT / "scripts" / "build_song_catalog.py"

WHISPER_SERVICE = "http://127.0.0.1:8091"
HEALTH_URL = f"{WHISPER_SERVICE}/health"
TRANSCRIBE_URL = f"{WHISPER_SERVICE}/transcribe"

TRANSCRIPT_EXTENSIONS = {
    ".txt",
    ".vtt",
    ".srt",
    ".lrc",
    ".json",
}

LOG_FILE = PROJECT_ROOT / "transcription-batch.log"


def timestamp():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def log(message=""):
    line = f"[{timestamp()}] {message}" if message else ""
    print(line, flush=True)

    if message:
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(line + "\n")


def http_json(url, payload=None, timeout=None):
    if payload is None:
        request = urllib.request.Request(url)
    else:
        body = json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

    with urllib.request.urlopen(
        request,
        timeout=timeout,
    ) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw)


def check_service():
    log("Checking Music Whisper service...")

    try:
        result = http_json(HEALTH_URL, timeout=10)
    except Exception as exc:
        log(f"ERROR: Music Whisper service is unavailable: {exc}")
        return False

    if not result.get("ok"):
        log("ERROR: Music Whisper service reported that it is not ready.")
        log(json.dumps(result, indent=2))
        return False

    log(
        f"Music Whisper ready: "
        f"{result.get('service', 'unknown service')}"
    )

    model = result.get("model")
    if model:
        log(f"Model: {model}")

    return True


def load_catalog():
    if not CATALOG_FILE.exists():
        raise RuntimeError(
            f"Catalog does not exist: {CATALOG_FILE}"
        )

    with CATALOG_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def existing_transcripts(song_folder, audio_file):
    """
    Determine whether this particular song audio already has transcript
    output.

    We primarily match files using the audio filename stem so unrelated
    JSON/text files in the folder don't accidentally count.
    """
    stem = audio_file.stem.casefold()

    matches = []

    try:
        files = list(song_folder.iterdir())
    except OSError:
        return []

    for path in files:
        if not path.is_file():
            continue

        if path.suffix.lower() not in TRANSCRIPT_EXTENSIONS:
            continue

        name = path.name.casefold()

        if (
            name.startswith(stem)
            or path.stem.casefold() == stem
        ):
            matches.append(path)

    return matches


def get_missing_songs(catalog):
    missing = []

    for song in catalog.get("songs", []):
        transcripts = song.get("transcripts")

        if transcripts:
            continue

        song_file = song.get("song_file", {})
        audio_path = song_file.get("path")

        if not audio_path:
            continue

        audio = Path(audio_path)

        missing.append({
            "title": song.get("title", audio.stem),
            "audio": audio,
            "folder": audio.parent,
        })

    return missing


def transcribe_song(song, index, total):
    title = song["title"]
    audio = song["audio"]
    folder = song["folder"]

    log("")
    log("=" * 70)
    log(f"[{index}/{total}] {title}")
    log("=" * 70)
    log(f"Audio:  {audio}")
    log(f"Output: {folder}")

    if not audio.exists():
        log("ERROR: Audio file does not exist.")
        return "failed"

    existing = existing_transcripts(folder, audio)

    if existing:
        log(
            f"SKIP: Found {len(existing)} existing transcript file(s)."
        )

        for path in existing:
            log(f"      {path.name}")

        return "skipped"

    payload = {
        "audio_path": str(audio),
        "output_dir": str(folder),
    }

    start = time.time()

    try:
        result = http_json(
            TRANSCRIBE_URL,
            payload=payload,
            timeout=None,
        )

    except urllib.error.HTTPError as exc:
        try:
            body = exc.read().decode("utf-8")
        except Exception:
            body = ""

        log(f"ERROR: Whisper returned HTTP {exc.code}")

        if body:
            log(body)

        return "failed"

    except urllib.error.URLError as exc:
        log(f"ERROR: Could not reach Music Whisper: {exc}")
        return "failed"

    except KeyboardInterrupt:
        raise

    except Exception as exc:
        log(f"ERROR: {type(exc).__name__}: {exc}")
        return "failed"

    elapsed = time.time() - start

    if not result.get("ok"):
        log("ERROR: Transcription failed.")
        log(json.dumps(result, indent=2))
        return "failed"

    log(f"SUCCESS in {elapsed:.1f} seconds")

    files = result.get("files", {})

    if files:
        log("Created transcript files:")

        for file_type, path in files.items():
            log(f"  {file_type}: {path}")

    segments = result.get("segments")

    if isinstance(segments, list):
        lyric_segments = sum(
            1
            for segment in segments
            if segment.get("type") == "lyrics"
        )

        music_segments = sum(
            1
            for segment in segments
            if segment.get("type") == "music"
        )

        log(
            f"Segments: {len(segments)} total, "
            f"{lyric_segments} lyrics, "
            f"{music_segments} music"
        )

    return "success"


def rebuild_catalog():
    log("")
    log("=" * 70)
    log("REBUILDING SONGS-IMPORT.JSON")
    log("=" * 70)

    if not CATALOG_BUILDER.exists():
        log(
            f"ERROR: Catalog builder not found: "
            f"{CATALOG_BUILDER}"
        )
        return False

    import subprocess

    result = subprocess.run(
        [sys.executable, str(CATALOG_BUILDER)],
        cwd=str(PROJECT_ROOT),
    )

    if result.returncode != 0:
        log(
            f"ERROR: Catalog rebuild returned "
            f"{result.returncode}"
        )
        return False

    log("songs-import.json rebuilt successfully.")
    return True


def print_final_catalog_summary():
    try:
        data = load_catalog()
    except Exception as exc:
        log(f"Could not reload catalog: {exc}")
        return

    summary = data.get("summary", {})

    log("")
    log("=" * 70)
    log("FINAL MY SONG BIBLE CATALOG")
    log("=" * 70)

    log(
        f"Songs included:             "
        f"{summary.get('songs_included', '?')}"
    )

    log(
        f"Songs with transcripts:     "
        f"{summary.get('songs_with_transcripts', '?')}"
    )

    log(
        f"Songs without transcripts:  "
        f"{summary.get('songs_without_transcripts', '?')}"
    )

    log(
        f"Duplicates skipped:         "
        f"{summary.get('numbered_duplicates_skipped', '?')}"
    )


def main():
    print()
    print("======================================================")
    print(" MY SONG BIBLE - MISSING TRANSCRIPT BATCH")
    print("======================================================")
    print()

    if not check_service():
        print()
        print(
            "Start the Music Whisper service and run this again."
        )
        sys.exit(1)

    try:
        catalog = load_catalog()
    except Exception as exc:
        log(f"ERROR loading catalog: {exc}")
        sys.exit(1)

    missing = get_missing_songs(catalog)

    log("")
    log(f"Catalog: {CATALOG_FILE}")
    log(f"Songs currently missing transcripts: {len(missing)}")
    log("")

    if not missing:
        log("Nothing needs transcription.")
        rebuild_catalog()
        print_final_catalog_summary()
        return

    successful = 0
    skipped = 0
    failed = 0

    try:
        for index, song in enumerate(missing, start=1):
            result = transcribe_song(
                song,
                index,
                len(missing),
            )

            if result == "success":
                successful += 1
            elif result == "skipped":
                skipped += 1
            else:
                failed += 1

            completed = successful + skipped + failed

            log("")
            log(
                f"Progress: {completed}/{len(missing)} | "
                f"new={successful} | "
                f"already done={skipped} | "
                f"failed={failed}"
            )

    except KeyboardInterrupt:
        log("")
        log("Batch interrupted by user.")
        log(
            "Completed transcript files remain saved and will "
            "be skipped next time."
        )

        rebuild_catalog()
        print_final_catalog_summary()

        print()
        print("Terminal left open.")
        return

    log("")
    log("=" * 70)
    log("TRANSCRIPTION BATCH COMPLETE")
    log("=" * 70)

    log(f"Newly transcribed: {successful}")
    log(f"Already completed: {skipped}")
    log(f"Failed:            {failed}")

    rebuild_catalog()
    print_final_catalog_summary()

    log("")
    log(f"Batch log: {LOG_FILE}")
    log("Done.")


if __name__ == "__main__":
    main()
