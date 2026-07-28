# Template Usage

Use this repository as a starting point for a new local-first desktop app. The goal is to rename the app cleanly without changing the core Electron, FastAPI, SQLite, and local-voice architecture.

## 1. Create a New App From the Template

Clone AppTemplateBase into a folder named for the new application:

```bash
git clone https://github.com/lcharleslaing/AppTemplateBase.git MyNewApp
cd MyNewApp
npm start
```

On first start, the cloned app derives an initial local identity from `MyNewApp`. Open Settings inside the cloned app, edit App Identity, and select **Save & Finish**. That explicit save runs the adoption workflow: it creates a private GitHub repository for the signed-in GitHub CLI user and configures:

```text
origin   -> MyNewApp
upstream -> AppTemplateBase
```

This keeps the app's commits and releases in its own repository while retaining AppTemplateBase as an upstream source for future merges. Set `APP_REPOSITORY_VISIBILITY=public` or `internal` before saving App Identity to choose a different visibility. `APP_REPOSITORY_OWNER` and `APP_REPOSITORY_NAME` can override the detected GitHub user and folder name.

## 2. Rename the App

On first `npm start`, AppTemplateBase detects the current folder name and updates a small set of safe identity fields if they still contain the original template identity. It then writes an ignored `.app-template-state.json` marker so later starts skip identity setup.

You can also make the cloned app identity explicit from the desktop UI. Open Settings, use the `App Definition` area, then save. That updates visible UI labels, package names, version metadata, the browser title, README title, and environment example app names for the clone.

The automatic setup updates:

- root/frontend package names and package-lock metadata
- Electron desktop name, product name, and application ID
- `frontend/index.html` title
- frontend-visible identity stored by App Identity
- root/backend environment example names and SQLite filenames
- backend package name, version, runtime directory name, and health identity
- `README.md` title
- package repository metadata
- Git remotes, identity commit, and initial push

GitHub CLI (`gh`) must be installed and authenticated. If it is unavailable, the App Identity save still succeeds locally and repository adoption retries the next time you save App Identity. To retry explicitly:

```bash
npm run template:repository
```

Saving App Identity later reruns repository synchronization automatically, commits the generated identity files, and pushes them to the app's `origin`.

If you want to rename more fields manually, update these template-facing values.

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

Local AI and audio paths are usually different on every computer. In Settings, use `Device Profiles` to name the current machine, save its Whisper/Piper/audio paths, and later apply a saved profile after cloning onto another device. Saved profiles are written to `shared/config/device-profiles.json` so they can travel with the project when you choose to commit them; the currently selected device remains a local SQLite setting.

Set machine-specific backend defaults in `backend/.env` or use the desktop Settings UI for editable voice/audio paths:

```env
WHISPER_CPP_BINARY=/absolute/path/to/whisper-cli
WHISPER_MODEL_PATH=/absolute/path/to/ggml-base.en.bin
TTS_ENGINE=mock
PIPER_BINARY=/absolute/path/to/piper
PIPER_MODEL_PATH=/absolute/path/to/piper-model.onnx
```

No cloud STT or TTS assumptions are built into the template.

`npm start` creates `backend/.env` when missing. On this development machine it also writes the local `whisper.cpp` binary path and chooses the first existing model in this order: tiny, base, then small. Tiny is preferred because it starts faster on slower laptops. For reusable local Whisper/Piper setup, run `npm run setup:local-ai`; it creates local AI folders under `~/local-ai`, downloads default models, and updates `backend/.env`. See [docs/LOCAL_AI_SETUP.md](docs/LOCAL_AI_SETUP.md) for the full setup flow and `docs/LOCAL_TTS.md` for TTS architecture details.

## 5. First-Run Commands

From the repository root:

```bash
npm start
```

That bootstrap flow will:

- run one-time safe template identity initialization
- create or refresh `backend/.env` local defaults when needed
- install Node dependencies if needed
- create `backend/.venv` if needed
- install backend Python dependencies if needed
- launch the desktop app

## 6. Validate the New App

Use:

- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- [docs/LOCAL_AI_SETUP.md](docs/LOCAL_AI_SETUP.md)
- [docs/SMOKE_TEST_CHECKLIST.md](docs/SMOKE_TEST_CHECKLIST.md)
- [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

## 7. Recommended First Customizations

- rename app metadata and visible branding
- choose a new SQLite filename
- choose a default DaisyUI theme
- configure local Whisper and TTS paths for the target machine
- replace the starter Home content with your project’s real workflow
