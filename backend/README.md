# Backend Layer

This backend is a local FastAPI service intended to run behind the desktop shell.

## Stack

- FastAPI
- SQLModel
- SQLite
- Pydantic settings
- pytest

## Current Scope

- local FastAPI app
- SQLite-backed persistence
- environment-driven settings
- startup database initialization
- transcript CRUD service
- placeholder voice status routes

## Commands

- `python -m venv .venv`
- `source .venv/bin/activate`
- `pip install -e .[dev]`
- `uvicorn app.main:app --reload`
- `pytest`
