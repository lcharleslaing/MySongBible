# Development

This project is a local-first desktop template. Electron is the desktop entrypoint, FastAPI runs locally behind it, and the renderer is a Vite + React + DaisyUI app.

## Prerequisites

- `node` and `npm`
- `python3`
- a working desktop environment for Electron
- optional local speech runtimes such as `whisper.cpp` and Piper if you want real STT or TTS

## First-Run Setup

From the repository root:

```bash
npm start
```

The bootstrap script will:

- check the cloned app's `upstream` AppTemplateBase remote for updates
- install root and frontend Node dependencies when needed
- create `backend/.venv` when missing
- install backend Python dependencies when needed
- launch the frontend and Electron app

The template update check only fetches and reports incoming commits. It does not merge them into app-specific code. It is non-blocking when offline.

In an adopted desktop clone, Settings includes a Template Updates panel for checking and merging without terminal commands. Merge is disabled while the worktree has uncommitted changes, and conflicting merges are aborted automatically.

## Run Modes

### Full Desktop App

```bash
npm start
```

Starts:

- Vite renderer dev server
- Electron desktop shell
- FastAPI backend as an Electron-managed child process

### Bootstrap Only

```bash
npm run start:bootstrap-only
```

Checks and installs local prerequisites without launching the app.

### Frontend Only

```bash
npm run frontend:dev
```

When no explicit `VITE_DEV_SERVER_PORT` is set, Vite starts at `5173` and picks another open local port if needed.

### Full Desktop App

```bash
npm run app:dev
```

The full dev stack allocates open frontend and backend ports automatically. Override the search windows with `APP_TEMPLATE_FRONTEND_PORT_MIN`, `APP_TEMPLATE_FRONTEND_PORT_MAX`, `APP_TEMPLATE_BACKEND_PORT_MIN`, and `APP_TEMPLATE_BACKEND_PORT_MAX`.

### Electron Only

```bash
npm run electron:dev
```

This expects `ELECTRON_RENDERER_URL` to point at a running Vite dev server. Prefer `npm run app:dev` unless you are intentionally managing the renderer separately.

### Backend Only

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

## Verification Commands

### Frontend Typecheck

```bash
npm run typecheck
```

### Frontend Build

```bash
npm run build
```

### Electron Smoke Test

```bash
npm run electron:smoke
```

### Backend Tests

```bash
cd backend
source .venv/bin/activate
python -m pytest -vv
```

## Local Configuration

Backend environment defaults should go in `backend/.env` copied from `backend/.env.example`. Saved local settings in SQLite can override editable voice/audio values later.

Useful variables:

```env
APP_DATA_DIR=./data
DATABASE_URL=sqlite:///./data/my_song_bible.sqlite3
WHISPER_CPP_BINARY=/absolute/path/to/whisper-cli
WHISPER_MODEL_PATH=/absolute/path/to/ggml-base.en.bin
WHISPER_THREAD_COUNT=4
TTS_ENGINE=mock
PIPER_BINARY=/absolute/path/to/piper
PIPER_MODEL_PATH=/absolute/path/to/piper-model.onnx
TTS_OUTPUT_DIR=./data/audio/tts
```

`DATABASE_URL` is startup-only. The Settings page displays the active SQLite path read-only; change `DATABASE_URL` in `backend/.env` and restart the backend to use another database.

Production packaging is not fully configured yet. Development mode and the smoke test are supported, but a distributable build still needs an explicit strategy for bundling the backend, Python runtime, and backend dependencies.

See:

- [LOCAL_WHISPER.md](LOCAL_WHISPER.md)
- [LOCAL_TTS.md](LOCAL_TTS.md)
- [SETTINGS_RESOLUTION.md](SETTINGS_RESOLUTION.md)
