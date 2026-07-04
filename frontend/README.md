# Frontend Layer

This frontend is a Vite + React + TypeScript renderer application styled with Tailwind CSS and DaisyUI.

## Current Scope

- routed starter UI
- reusable shell with sidebar and topbar
- DaisyUI theme selector
- Voice Lab workflow for local recording, file upload, STT, and TTS
- Settings page wired to backend persistence and secure desktop pickers
- System Health page for local diagnostics
- typed API clients for backend settings, health, STT, and TTS endpoints

## Commands

- `npm install`
- `npm start`
- `npm run build`
- `npm run typecheck`

## Styling Rules

- DaisyUI is the primary component and theme layer.
- Styling should stay inside Tailwind and DaisyUI utilities instead of ad hoc CSS.
