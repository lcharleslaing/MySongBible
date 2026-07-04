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

- Electron launches the desktop shell in development mode. Production packaging is not fully configured yet.
- React, Tailwind, and DaisyUI provide the renderer UI.
- FastAPI runs locally behind Electron with SQLite-backed persistence.
- `whisper.cpp` speech-to-text is supported through configurable binary and model paths.
- Local TTS is centralized behind a pluggable engine layer with `mock` and Piper support.
- Editable machine-local settings are stored in SQLite and override backend environment defaults, except `DATABASE_URL`, which is startup-only.
- Voice cloning remains scaffold-only and does not download models or add heavy runtimes yet.

## Current Commands

From the repository root:

- `npm start` runs one-time template initialization, prepares `backend/.env`, bootstraps missing dependencies, then runs the full desktop app in development mode
- `npm run start:bootstrap-only` performs first-run setup checks without launching the app
- `npm run template:init` forces the template identity/default-path setup to run again
- `npm run frontend:dev` runs the Vite renderer only
- `npm run electron:dev` runs Electron against the Vite dev server
- `npm run build` builds the renderer bundle used by Electron production mode
- `npm run typecheck` runs the frontend TypeScript check
- `npm run electron:smoke` launches Electron against the built frontend and waits for backend health

## Backend Commands

From `backend/`:

- `python3 -m venv .venv`
- `source .venv/bin/activate`
- `pip install -e .[dev]`
- `uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload`
- `pytest`

## First-Run Template Initialization

On first `npm start`, the template initializer:

- detects the current folder name
- updates safe identity fields only if they still contain the template identity
- writes an ignored `.app-template-state.json` marker so later starts skip identity setup
- creates `backend/.env` from `backend/.env.example` when missing
- writes local Whisper defaults to `backend/.env` when values are blank or still generic

For this development machine, the initializer uses:

- `WHISPER_CPP_BINARY=/home/llaing/whisper.cpp/build/bin/whisper-cli`
- the first existing model in this order:
  - `/home/llaing/whisper.cpp/models/ggml-tiny.en.bin`
  - `/home/llaing/whisper.cpp/models/ggml-base.en.bin`
  - `/home/llaing/whisper.cpp/models/ggml-small.en.bin`
- `TTS_ENGINE=mock`

It does not rename folders, change Git remotes, rewrite architecture docs, rename Python modules, or guess Piper paths. To rerun intentionally:

```bash
npm run template:init
# or
TEMPLATE_INIT_FORCE=1 npm start
```

Edit `backend/.env` manually if you want different Whisper or Piper paths.

## Local-Only Expectations

- No cloud STT or TTS calls are used by the template.
- Audio files are stored on disk, not in SQLite blobs.
- Whisper, Piper, SQLite, and output paths must stay configurable.
- Renderer filesystem access stays behind the Electron preload bridge.

Start with [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for setup and [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for common issues.

If you are using this repository as a base for a new product, start with [TEMPLATE_USAGE.md](TEMPLATE_USAGE.md).
