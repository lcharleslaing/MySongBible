# Architecture Summary

## Purpose

My Song Bible is a local-first desktop application built from App Template Base and intended to keep the template architecture easy to merge from upstream.

## High-Level Structure

- `electron/` contains the desktop wrapper, preload bridge, and process orchestration.
- `frontend/` contains the Vite + React + TypeScript renderer application.
- `backend/` contains the FastAPI service, database layer, and local AI integrations.
- `shared/` contains shared configuration and cross-layer schemas/contracts.
- `scripts/` contains setup, development, and packaging helpers.
- `docs/` contains architecture and project documentation.

## Local-First Boundaries

- Electron owns desktop lifecycle and local process management.
- FastAPI owns app services, database access, and voice orchestration.
- Voice logic is centralized in backend `local_ai` modules.
- Frontend communicates through backend APIs and a minimal Electron bridge.

## Planned Voice Module Direction

- Speech-to-text will use configurable `whisper.cpp` paths.
- Text-to-speech will use a pluggable engine interface.
- Voice cloning stays as backend scaffolding until heavier local engines are intentionally added.
- No cloud STT or cloud TTS is planned.

## Configuration Direction

- Environment files provide defaults.
- Runtime settings are persisted in SQLite through the `AppSetting` table.
- Machine-specific paths must stay configurable and out of committed code.
- Electron owns native file and directory pickers so the renderer does not receive raw filesystem access.
