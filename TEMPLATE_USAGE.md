# Template Usage

Use this repository as a starting point for a new local-first desktop app. The goal is to rename the app cleanly without changing the core Electron, FastAPI, SQLite, and local-voice architecture.

## 1. Create a New App From the Template

Example:

```bash
cp -R AppTemplateBase MyNewApp
cd MyNewApp
rm -rf .git
git init
```

If you are using a remote template flow instead, the important part is the same: start with a fresh Git history for the new app and then rename the template-facing metadata below.

## 2. Rename the App

Update these template-facing values first.

### App Name

Files to update:

- [`package.json`](package.json)
  - `name`
- [`.env.example`](.env.example)
  - `APP_NAME`
- [`backend/.env.example`](backend/.env.example)
  - `APP_NAME`
- [`backend/app/core/config.py`](backend/app/core/config.py)
  - `app_name` default if you want the backend fallback name to match
- [`README.md`](README.md)
  - project name and description

### Frontend Title

Files to update:

- [`frontend/index.html`](frontend/index.html)
  - `<title>`
- any visible branding in frontend pages or topbar components

### Electron App Metadata

Today Electron uses the root [`package.json`](package.json) for app metadata.

Files to update:

- [`package.json`](package.json)
  - `name`
  - `version`
  - future packaging metadata when packaging is added
- [`electron/README.md`](electron/README.md) if you are documenting a renamed product shell

### Backend Package Name

Files to update:

- [`backend/pyproject.toml`](backend/pyproject.toml)
  - `[project].name`
  - `[project].description`
- [`backend/README.md`](backend/README.md) if the backend product name changes

### Database File Name

Files to update:

- [`.env.example`](.env.example)
  - `DATABASE_URL`
- [`backend/.env.example`](backend/.env.example)
  - `DATABASE_URL`
- [`backend/app/core/config.py`](backend/app/core/config.py)
  - `database_url` default if you want the code fallback name changed too

Recommended pattern:

```env
DATABASE_URL=sqlite:///./data/my_new_app.sqlite3
```

## 3. Keep the Local Data Convention

This template assumes local runtime files live under `./data` by default:

- `./data/<app>.sqlite3`
- `./data/audio/input/`
- `./data/audio/tts/`

And logs live under:

- `./logs/`

Do not commit real runtime data. The repository ignore rules already exclude:

- SQLite databases
- local model files
- recorded audio
- synthesized audio
- generated transcripts
- logs
- build output

## 4. Configure Local Speech Paths

All speech tooling stays local-only.

Set machine-specific backend defaults in `backend/.env` or use the desktop Settings UI for editable voice/audio paths:

```env
WHISPER_CPP_BINARY=/absolute/path/to/whisper-cli
WHISPER_MODEL_PATH=/absolute/path/to/ggml-base.en.bin
TTS_ENGINE=mock
PIPER_BINARY=/absolute/path/to/piper
PIPER_MODEL_PATH=/absolute/path/to/piper-model.onnx
```

No cloud STT or TTS assumptions are built into the template.

## 5. First-Run Commands

From the repository root:

```bash
npm start
```

That bootstrap flow will:

- install Node dependencies if needed
- create `backend/.venv` if needed
- install backend Python dependencies if needed
- launch the desktop app

## 6. Validate the New App

Use:

- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- [docs/SMOKE_TEST_CHECKLIST.md](docs/SMOKE_TEST_CHECKLIST.md)
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

## 7. Recommended First Customizations

- rename app metadata and visible branding
- choose a new SQLite filename
- choose a default DaisyUI theme
- configure local Whisper and TTS paths for the target machine
- replace the starter Home content with your project’s real workflow
