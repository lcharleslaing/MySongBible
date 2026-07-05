from __future__ import annotations

import argparse

from .constants import DEFAULT_PIPER_VOICE, DEFAULT_WHISPER_MODEL
from .core import (
    Result,
    check_backend_http,
    check_stt,
    check_tts,
    emit,
    local_ai_paths,
    piper_model_path,
    piper_wrapper_path,
    setup_piper,
    setup_whisper,
    whisper_binary_candidates,
    whisper_model_path,
)


def add_common_setup_flags(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--dry-run", action="store_true", help="Show actions without cloning, building, downloading, or editing.")
    parser.add_argument("--force", action="store_true", help="Replace customized backend/.env values.")


def print_summary(stt: Result, tts: Result, env_updated: Result | None = None) -> None:
    paths = local_ai_paths()
    whisper_binary = next((candidate for candidate in whisper_binary_candidates(paths["root"]) if candidate.exists()), None)
    print("\nLocal AI Setup Summary:")
    print(f"- Whisper binary: {'PASS ' + str(whisper_binary) if whisper_binary else 'WARN not found yet'}")
    model = whisper_model_path(DEFAULT_WHISPER_MODEL, paths["root"])
    print(f"- Whisper model: {'PASS ' + str(model) if model.exists() else 'WARN not found yet'}")
    wrapper = piper_wrapper_path(paths["root"])
    print(f"- Piper binary: {'PASS ' + str(wrapper) if wrapper.exists() else 'WARN not found yet'}")
    piper_model = piper_model_path(DEFAULT_PIPER_VOICE, paths["root"])
    print(f"- Piper model: {'PASS ' + str(piper_model) if piper_model.exists() else 'WARN not found yet'}")
    print(f"- backend/.env updated: {(env_updated or Result()).status}")
    print(f"- STT check: {stt.status}")
    print(f"- TTS check: {tts.status}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="local-ai-setup")
    subparsers = parser.add_subparsers(dest="command", required=True)

    local_ai = subparsers.add_parser("setup:local-ai", help="Set up Whisper, Piper, then run checks.")
    add_common_setup_flags(local_ai)

    whisper = subparsers.add_parser("setup:whisper", help="Set up whisper.cpp and a Whisper model.")
    add_common_setup_flags(whisper)
    whisper.add_argument("--model", choices=["tiny.en", "base.en", "small.en"], default=DEFAULT_WHISPER_MODEL)

    piper = subparsers.add_parser("setup:piper", help="Set up Piper and a default voice model.")
    add_common_setup_flags(piper)
    piper.add_argument("--voice", default=DEFAULT_PIPER_VOICE)

    subparsers.add_parser("check:local-ai", help="Run STT, TTS, and backend health checks.")
    subparsers.add_parser("stt:check", help="Validate Whisper configuration.")
    subparsers.add_parser("tts:check", help="Validate Piper configuration and synthesize a test WAV when ready.")

    args = parser.parse_args(argv)

    if args.command == "setup:whisper":
        result = setup_whisper(model=args.model, force=args.force, dry_run=args.dry_run)
        emit(result)
        return 1 if result.failed else 0

    if args.command == "setup:piper":
        result = setup_piper(voice=args.voice, force=args.force, dry_run=args.dry_run)
        emit(result)
        return 1 if result.failed else 0

    if args.command == "setup:local-ai":
        whisper_result = setup_whisper(force=args.force, dry_run=args.dry_run)
        emit(whisper_result)
        piper_result = setup_piper(force=args.force, dry_run=args.dry_run)
        emit(piper_result)
        if args.dry_run:
            stt = Result()
            stt.warn("Dry run only; skipped live STT check.")
            emit(stt)
            tts = Result()
            tts.warn("Dry run only; skipped live TTS check.")
            emit(tts)
        else:
            stt = check_stt()
            emit(stt)
            tts = check_tts()
            emit(tts)
        combined_setup = Result()
        combined_setup.extend(whisper_result)
        combined_setup.extend(piper_result)
        print_summary(stt, tts, combined_setup)
        return 1 if whisper_result.failed or piper_result.failed or stt.failed or tts.failed else 0

    if args.command == "stt:check":
        result = check_stt()
        emit(result)
        return 1 if result.failed else 0

    if args.command == "tts:check":
        result = check_tts()
        emit(result)
        return 1 if result.failed else 0

    if args.command == "check:local-ai":
        stt = check_stt()
        emit(stt)
        tts = check_tts()
        emit(tts)
        backend = check_backend_http()
        emit(backend)
        print_summary(stt, tts)
        return 1 if stt.failed or tts.failed else 0

    parser.error(f"Unknown command: {args.command}")
    return 2
