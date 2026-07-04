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

- install root and frontend Node dependencies when needed
- create `backend/.venv` when missing
- install backend Python dependencies when needed
- launch the frontend and Electron app

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

### Electron Only

```bash
npm run electron:dev
```

This expects the Vite dev server to be reachable on `127.0.0.1:5173`.

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
pytest
```

## Local Configuration

Environment files provide defaults. Saved local settings in SQLite can override them later.

Useful variables:

```env
APP_DATA_DIR=./data
DATABASE_URL=sqlite:///./data/app_template_base.sqlite3
WHISPER_CPP_BINARY=/absolute/path/to/whisper-cli
WHISPER_MODEL_PATH=/absolute/path/to/ggml-base.en.bin
WHISPER_THREAD_COUNT=4
TTS_ENGINE=mock
PIPER_BINARY=/absolute/path/to/piper
PIPER_MODEL_PATH=/absolute/path/to/piper-model.onnx
TTS_OUTPUT_DIR=./data/audio/tts
```

See:

- [LOCAL_WHISPER.md](LOCAL_WHISPER.md)
- [LOCAL_TTS.md](LOCAL_TTS.md)
- [SETTINGS_RESOLUTION.md](SETTINGS_RESOLUTION.md)
