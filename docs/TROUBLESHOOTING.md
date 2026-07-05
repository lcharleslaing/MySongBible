# Troubleshooting

## `npm start` Does Not Launch

Check:

- `node` and `npm` are installed
- `python3` is installed and available on `PATH`
- the machine can open Electron windows

If bootstrap fails, run:

```bash
npm run start:bootstrap-only
```

This isolates setup failures from runtime launch failures.

## Backend Virtualenv Issues

If backend dependencies are missing or corrupted:

```bash
cd backend
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
```

Then retry:

```bash
cd ..
npm start
```

## `/api/health` Fails

Possible causes:

- Electron could not start the backend child process
- the backend virtualenv is missing dependencies
- another process is already bound to port `8000`

Run the backend manually to isolate the problem:

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Then open:

```bash
curl -I http://127.0.0.1:8000/api/health
```

## Whisper Transcription Fails

Check all of the following:

- `WHISPER_CPP_BINARY` points to a real `whisper-cli` binary
- `WHISPER_MODEL_PATH` points to a real model file
- the uploaded audio file exists and is readable
- the configured thread count is reasonable for the machine

Common issues:

- wrong binary path
- wrong model path
- audio format unsupported by the current `whisper.cpp` build
- a model file that does not match the expected runtime format

The backend validates file existence and returns clear API errors when configuration is missing.

## Recorded Audio Does Not Transcribe

Electron/Chromium recording commonly produces `webm` or `ogg`, not MP3. The backend converts recorded `webm` audio to WAV with `ffmpeg` before invoking `whisper.cpp`. If your local transcription flow still rejects the recording:

- try uploading a known-good `.wav` or `.mp3` file manually
- keep the recorded file for inspection
- confirm `ffmpeg` is installed and available on `PATH`

Current template behavior is file-based, not live streaming.

## Piper TTS Fails

Check:

- `TTS_ENGINE=piper` is selected
- `PIPER_BINARY` points to a real Piper binary
- `PIPER_MODEL_PATH` points to a real Piper model file

If Piper is not configured, use the mock engine to verify the rest of the app flow first.

## Mock TTS Returns a Placeholder WAV

That is expected. The mock engine exists so the template can exercise the local TTS pipeline without requiring Piper or a heavier local runtime.

## Settings Do Not Persist

Settings are stored in SQLite through the `AppSetting` table.

Check:

- the configured SQLite path is writable
- the app has permission to create files under the chosen data directory
- the backend is using the expected database file

See [SETTINGS_RESOLUTION.md](SETTINGS_RESOLUTION.md) for precedence rules.

## Local-Only Behavior Questions

The template is designed to stay local-only:

- no cloud STT requests
- no cloud TTS requests
- no automatic model downloads
- large audio stored on disk, not inside SQLite

If a future feature would require network access, document it explicitly instead of silently adding it.
