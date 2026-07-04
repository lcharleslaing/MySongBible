# AppTemplateBase

AppTemplateBase is a reusable local-first desktop application template for building future apps with a consistent architecture.

## Stack

- Electron desktop shell
- Vite + React + TypeScript frontend
- Tailwind CSS + DaisyUI styling
- FastAPI backend
- SQLite database
- SQLModel or SQLAlchemy ORM
- Local speech-to-text via `whisper.cpp`
- Local text-to-speech via pluggable engines

## Goals

- Keep all core functionality local-first.
- Avoid cloud speech services.
- Centralize STT/TTS logic in reusable local voice modules.
- Provide a clean base structure for future desktop products.
- Keep machine-specific paths configurable through environment variables and saved local settings.

## Repository Layout

- `electron/` Electron desktop shell
- `frontend/` Vite React renderer
- `backend/` FastAPI service
- `shared/` shared configuration and cross-layer contracts
- `scripts/` development and build helpers
- `docs/` architecture and implementation documentation

## Current Capabilities

- Electron launches the desktop shell in development and production modes.
- React, Tailwind, and DaisyUI provide the renderer UI.
- FastAPI runs locally behind Electron with SQLite-backed persistence.
- `whisper.cpp` speech-to-text is supported through configurable binary and model paths.
- Local TTS is centralized behind a pluggable engine layer with `mock` and Piper support.
- Editable machine-local settings are stored in SQLite and override `.env` defaults.
- Voice cloning remains scaffold-only and does not download models or add heavy runtimes yet.

## Current Commands

From the repository root:

- `npm start` bootstraps missing dependencies, then runs the full desktop app in development mode
- `npm run start:bootstrap-only` performs first-run setup checks without launching the app
- `npm run frontend:dev` runs the Vite renderer only
- `npm run electron:dev` runs Electron against the Vite dev server
- `npm run build` builds the renderer bundle used by Electron production mode
- `npm run typecheck` runs the frontend TypeScript check
- `npm run electron:smoke` launches Electron against the built frontend for a lightweight smoke test

## Backend Commands

From `backend/`:

- `python3 -m venv .venv`
- `source .venv/bin/activate`
- `pip install -e .[dev]`
- `uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload`
- `pytest`

## Local-Only Expectations

- No cloud STT or TTS calls are used by the template.
- Audio files are stored on disk, not in SQLite blobs.
- Whisper, Piper, SQLite, and output paths must stay configurable.
- Renderer filesystem access stays behind the Electron preload bridge.

Start with [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for setup and [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for common issues.
