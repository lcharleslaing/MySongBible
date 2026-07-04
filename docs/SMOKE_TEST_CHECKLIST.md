# Smoke Test Checklist

Use this checklist when turning the template into a new project or validating a fresh machine setup.

## Core Launch

- [ ] `npm start` completes bootstrap without fatal errors
- [ ] the frontend window opens
- [ ] the sidebar/topbar render correctly

## Backend Health

- [ ] `GET /api/health` returns `{"status":"ok"}`
- [ ] the Settings page can load backend-backed settings

## Electron

- [ ] Electron launches against the Vite dev server in development
- [ ] `npm run electron:smoke` exits successfully against the built frontend after backend health is reachable

## SQLite

- [ ] the configured SQLite file is created under `./data/` or the chosen app data directory
- [ ] settings changes persist across app restarts

## Whisper

- [ ] Whisper binary path points to a real `whisper-cli`
- [ ] Whisper model path points to a real local model file
- [ ] `/api/voice/status` reflects whether Whisper is configured
- [ ] a sample transcription request succeeds once paths are configured

## TTS

- [ ] the selected TTS engine is visible in settings
- [ ] mock TTS can synthesize a placeholder output locally
- [ ] Piper configuration validates when `TTS_ENGINE=piper`

## Local-Only Rules

- [ ] no cloud STT calls are required
- [ ] no cloud TTS calls are required
- [ ] model downloads are not triggered automatically
- [ ] runtime audio and database files are not committed to Git
