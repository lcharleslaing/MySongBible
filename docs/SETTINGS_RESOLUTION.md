# Settings Resolution

AppTemplateBase resolves editable local settings in two layers:

## 1. Environment Defaults

Environment variables and `.env` files provide the default values used at startup.

Examples:

- `WHISPER_CPP_BINARY`
- `WHISPER_MODEL_PATH`
- `WHISPER_THREAD_COUNT`
- `TTS_ENGINE`
- `PIPER_BINARY`
- `PIPER_MODEL_PATH`
- `AUDIO_INPUT_DIR`
- `TTS_OUTPUT_DIR`

## 2. Local Saved Overrides

When the user saves settings in the desktop UI, those values are stored in SQLite through the `AppSetting` table.

On future launches:

- the backend loads environment values first
- saved local overrides are read from SQLite
- saved local overrides win over environment defaults

## Why This Split Exists

- environment files remain useful for bootstrapping and per-machine defaults
- local saved settings let the desktop app remember user choices without editing source-controlled files
- the renderer never gets raw filesystem access; path picking stays inside the Electron main process

## Current Editable Local Settings

- Whisper binary path
- Whisper model path
- Whisper thread count
- TTS engine
- Piper binary path
- Piper model path
- Audio input directory
- Audio output directory
- SQLite database path
