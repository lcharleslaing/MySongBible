# Clean Clone Verification

Use this when validating that ignored local files are not hiding setup problems.

## Fresh Setup

```bash
git clone <repo-url> AppTemplateBase-clean
cd AppTemplateBase-clean
cp backend/.env.example backend/.env
npm install
npm run start:bootstrap-only
```

Do not copy `node_modules/`, `frontend/dist/`, `backend/.venv/`, `backend/data/`, `.pytest_cache/`, local audio, or model files from another checkout.

## Verification

```bash
npm run typecheck
npm run build
backend/.venv/bin/python -m pytest -vv
npm run electron:smoke
```

## Manual Launch Checks

```bash
npm run frontend:dev
cd backend && .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
npm run electron:dev
```

Confirm:

- `GET http://127.0.0.1:8000/api/health` returns `{"status":"ok"}`
- Settings loads and saves editable voice/audio settings
- SQLite database path is displayed read-only
- no generated runtime files are staged for Git
