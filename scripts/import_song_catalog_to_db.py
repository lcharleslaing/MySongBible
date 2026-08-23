#!/usr/bin/env python3

import argparse
import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = PROJECT_ROOT / "backend"
DEFAULT_CATALOG_PATH = PROJECT_ROOT / "songs-import.json"


def configure_backend_imports() -> None:
    os.chdir(BACKEND_ROOT)
    sys.path.insert(0, str(BACKEND_ROOT))


def print_mapping(title: str, rows: list[dict[str, object]]) -> None:
    print(f"\n{title}")
    if not rows:
        print("(no rows)")
        return

    for row in rows:
        print(" | ".join(f"{key}={value}" for key, value in row.items()))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import the My Song Bible corpus into the existing SQLite database.",
    )
    parser.add_argument(
        "--catalog",
        type=Path,
        default=DEFAULT_CATALOG_PATH,
        help="Path to songs-import.json.",
    )
    args = parser.parse_args()

    configure_backend_imports()

    from app.services.song_catalog_import import import_song_catalog

    result = import_song_catalog(args.catalog.resolve())

    print("Song catalog import complete")
    print(f"DB path used: {result['db_path']}")
    print(f"DB size before import: {result['db_size_before']}")
    print(f"DB size after import: {result['db_size_after']}")
    print(f"Import duration seconds: {result['duration_seconds']:.2f}")

    print("\nRow counts")
    for name, count in result["counts"].items():
        print(f"{name}: {count}")

    print("\nTranscript source counts")
    for source, count in sorted(result["transcript_source_counts"].items()):
        print(f"{source}: {count}")

    print("\nValidation")
    for name, ok in result["validations"].items():
        print(f"{name}: {'pass' if ok else 'fail'}")

    print("\nUnrelated existing table counts preserved")
    for name, count in sorted(result["unrelated_table_counts"].items()):
        print(f"{name}: {count}")

    print_mapping("Words sharing Simple = 54", result["examples"]["words_simple_54"])
    print_mapping("Exact lyric-line collisions", result["examples"]["exact_line_collisions"])
    print_mapping("Title to lyric-line matches", result["examples"]["title_line_matches"])
    print_mapping("Word to title matches", result["examples"]["word_title_matches"])

    print("\nIndex list")
    for table_name, indexes in result["indexes"].items():
        print(f"{table_name}: {', '.join(indexes) if indexes else '(none)'}")


if __name__ == "__main__":
    main()
