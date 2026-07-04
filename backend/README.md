# Backend Layer

This directory is reserved for the FastAPI backend.

Planned responsibilities:

- HTTP API routes
- application services
- SQLite database access
- runtime configuration
- local speech modules

Suggested internal layout:

- `app/api/` route definitions
- `app/core/` configuration, logging, lifecycle
- `app/db/` models, sessions, repositories
- `app/local_ai/` local STT/TTS modules
- `tests/` backend tests
