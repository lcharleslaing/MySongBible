# Codex Task — Integrate Quick Gematria into My Song Bible

You are working directly in the My Song Bible repository.

The actual stack is:

- Electron 31
- React 18
- Vite
- TypeScript
- FastAPI
- SQLite

This project was cloned from App Template Base. Preserve its template architecture and future upstream update compatibility.

A Quick Gematria implementation packet is already present:

- `shared/gematria/gematria.cjs`
- `shared/gematria/gematria.test.cjs`
- `electron/main/features/quick-gematria.cjs`
- `frontend/src/features/quick-gematria/QuickGematriaOverlay.tsx`
- `frontend/src/features/quick-gematria/types.ts`
- `frontend/src/features/quick-gematria/index.ts`
- `docs/QUICK_GEMATRIA.md`

Read all of those files first.

Then inspect these actual existing application files before modifying anything:

- `electron/main/index.cjs`
- `electron/main/ipc.cjs`
- `electron/main/backend.cjs`
- `electron/preload/index.cjs`
- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/src/types/desktop.d.ts`
- `frontend/src/api/stt.ts`
- `backend/app/services/stt.py`
- `backend/app/api/router.py`
- any settings/startup lifecycle files that affect Electron startup

Do not replace these files wholesale.

Integrate Quick Gematria into the current code at the narrowest appropriate points.

## Required behavior

Default global shortcut:

`Ctrl+Alt+G`

When pressed from anywhere on the Linux desktop:

1. My Song Bible's resident Electron process receives the shortcut.
2. A centered Quick Gematria BrowserWindow opens or reopens.
3. It is focused and always on top.
4. It renders only `QuickGematriaOverlay`, not the normal application shell.
5. Microphone capture begins automatically.
6. After speech and about 1.2 seconds of silence, recording stops.
7. The recording is transcribed locally.
8. The phrase appears in an editable text area.
9. Jewish, English, and Simple values appear.
10. Editing the phrase recalculates immediately.
11. Escape hides the popup.
12. Repeated hotkey presses reuse the existing window instead of creating duplicates.

Typed Gematria must work even when Whisper is unavailable.

## Shared calculator

Use:

`shared/gematria/gematria.cjs`

as the authoritative calculation implementation.

Do not copy the cipher formulas into React.

Expose calculation through a narrow Electron preload API.

Expected result shape:

```ts
{
  input: string;
  normalized: string;
  simple: number;
  english: number;
  jewish: number;
  breakdown: Array<{
    character: string;
    simple: number;
    english: number;
    jewish: number;
  }>;
}
```

Regression:

`simple`

must equal:

- Jewish 214
- English 444
- Simple 74

## Electron integration

Use Electron's built-in:

- `globalShortcut`
- `BrowserWindow`
- `app.setLoginItemSettings`
- IPC main/renderer
- current app lifecycle hooks

The feature helper is in:

`electron/main/features/quick-gematria.cjs`

Adapt it to the existing lifecycle conventions where needed.

Do not create a second Electron application or repository.

### Global shortcut

Register after `app.whenReady()`.

Unregister on quit.

If registration fails, log a clear warning/error.

### Window

Use the current renderer dev URL during development and `frontend/dist/index.html` in packaged mode, following the exact strategy already used by `electron/main/index.cjs`.

Pass:

`quick-gematria=1`

to the renderer.

Do not guess dev-server environment variable names. Reuse the existing app's actual values.

### Background mode

Support:

`--background`

When started with this argument:

- keep Electron resident;
- register Quick Gematria;
- do not unnecessarily show the normal main My Song Bible window;
- keep backend/service startup behavior correct;
- allow Ctrl+Alt+G to open Quick Gematria.

Do not break normal `npm start`.

### Close lifecycle

The Quick Gematria popup should hide instead of killing the app.

Do not accidentally change the existing main-window close behavior unless background mode requires an intentional adjustment.

Add a clear explicit Quit path if the template already has tray/menu infrastructure.

## Autostart

Use Electron's:

`app.setLoginItemSettings()`

The implementation packet contains a helper.

Integrate it with the existing application settings architecture if one exists.

Do not silently create an unrelated startup mechanism outside the repository.

For development, do not require autostart testing to succeed because login startup is primarily meaningful for packaged applications.

Document that distinction.

## Preload

Extend `electron/preload/index.cjs` using the existing `contextBridge` style.

Expose a narrow API similar to:

```ts
window.quickGematria.calculate(input)
window.quickGematria.transcribe(payload)
window.quickGematria.hide()
window.quickGematria.onOpened(callback)
```

Do not expose arbitrary `ipcRenderer`.

Update:

`frontend/src/types/desktop.d.ts`

to type the API.

## IPC

Follow the repository's existing IPC organization.

You may integrate handlers into `electron/main/ipc.cjs` or have that file call the registration helper.

Do not register duplicate IPC handlers on reload/reinitialization.

Required channels conceptually:

- `quick-gematria:calculate`
- `quick-gematria:transcribe`
- `quick-gematria:hide`
- `quick-gematria:opened`

Names may be adapted only if the template has a clear naming convention.

## Renderer bootstrap

Inspect `frontend/src/main.tsx`.

At the narrowest possible point:

- if URL query contains `quick-gematria=1`, render `<QuickGematriaOverlay />`;
- otherwise preserve the existing root/providers/router/App behavior exactly.

Do not make the normal app route through the Quick Gematria component.

Preserve existing theme CSS.

## Microphone and STT

Before finalizing the transcription bridge, inspect the app's existing STT implementation:

- `frontend/src/api/stt.ts`
- `backend/app/services/stt.py`
- relevant backend route/schema

Prefer reusing existing My Song Bible/App Template Base speech infrastructure if it can accept the popup recording cleanly.

The user also has a Music Whisper service running at:

`http://127.0.0.1:8091`

with a known `/transcribe` endpoint.

The supplied Electron helper currently includes a direct Music Whisper bridge using FFmpeg and temporary files.

Choose the cleaner integration based on the code already in the repo:

- reuse existing backend STT if it already provides the needed local Whisper behavior; OR
- use the supplied direct Music Whisper bridge.

Do not maintain two unnecessary transcription paths.

Document which one you choose and why.

## Main-app Gematria integration

This feature must be reusable inside My Song Bible.

For this phase, expose a clean `window.quickGematria.calculate()` bridge so future pages can calculate:

- title
- full lyrics
- line
- verse
- chorus
- bridge
- selected phrase
- word

Do not yet redesign the main My Song Bible interface unless a minimal test surface is useful.

If you add a test/demo surface inside the main app, keep it small and clearly reusable.

## Documentation

Update:

`docs/QUICK_GEMATRIA.md`

with the actual integrated architecture.

Document:

- files touched
- lifecycle
- IPC channels
- preload API
- hotkey
- autostart behavior
- background mode
- Whisper/STT path selected
- how to change the hotkey
- troubleshooting
- test commands
- packaged-app considerations

Everything must remain inside this Git repository.

## Validation

Run:

```bash
node --test shared/gematria/gematria.test.cjs
npm run typecheck
npm run build
```

Also run any relevant existing Electron smoke test if safe:

```bash
npm run electron:smoke
```

Do not leave an Electron process hanging after automated smoke tests.

Fix all errors caused by the feature.

Then manually or as far as practical verify:

- normal `npm start`
- main My Song Bible opens normally
- Ctrl+Alt+G while another app has focus
- Quick Gematria appears
- microphone starts
- speech followed by silence ends capture
- local transcription returns
- Jewish/English/Simple calculate
- editing recalculates
- Escape hides
- Ctrl+Alt+G reopens
- background launch does not show normal window
- main app remains usable
- template update functionality remains intact

## Git

Do not commit or push automatically.

Do not modify `songs-import.json` as part of this feature.

At completion show:

- `git status --short`
- files created
- files modified
- tests run and results
- final hotkey
- final transcription path
- background/autostart behavior
- anything still needing a manual packaged test

Make the implementation changes directly. Do not stop at an explanation.
