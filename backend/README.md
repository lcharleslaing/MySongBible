# Backend Layer

This backend is a local FastAPI service intended to run behind the desktop shell.

## Stack

- FastAPI
- SQLModel
- SQLite
- Pydantic settings
- pytest

## Current Scope

- local FastAPI app
- SQLite-backed persistence
- environment-driven settings
- startup database initialization
- transcript CRUD service
- local STT upload/transcription flow via `whisper.cpp`
- local TTS synthesis flow through a centralized engine manager
- saved local settings layered over `.env` defaults
- future voice-cloning scaffolding without runtime dependencies

## Commands

- `python -m venv .venv`
- `source .venv/bin/activate`
- `pip install -e .[dev]`
- `uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload`
- `pytest`

## Notes

- SQLite stores metadata and settings only; large audio stays on disk.
- Voice integrations are centralized under `app/local_ai/`.
- Machine-local paths are configurable through `.env` files and persisted settings.
