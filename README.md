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

## Repository Layout

- `electron/` Electron desktop shell
- `frontend/` Vite React renderer
- `backend/` FastAPI service
- `shared/` shared configuration and cross-layer contracts
- `scripts/` development and build helpers
- `docs/` architecture and implementation documentation

This repository currently contains the initial project structure only. Runtime implementation is intentionally deferred.

## Current Commands

From the repository root:

- `npm start` runs the frontend development server
- `npm run build` builds the frontend
- `npm run typecheck` runs the frontend TypeScript check
