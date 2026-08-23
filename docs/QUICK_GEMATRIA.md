# My Song Bible — Quick Gematria

## Goal

Quick Gematria is part of My Song Bible, not a separate application.

It has two uses:

1. My Song Bible can call a shared Gematria engine internally.
2. The Electron desktop process can remain resident in the background and expose a system-wide Quick Gematria popup.

Default shortcut:

`Ctrl+Alt+G`

The popup automatically begins microphone capture, transcribes locally through the Music Whisper service, and displays three Gematria values.

## Architecture

My Song Bible currently uses:

- Electron desktop shell
- React + Vite renderer
- FastAPI backend
- SQLite
- local-first services

Quick Gematria follows that architecture and is now wired into the existing
Electron lifecycle rather than running as a second application.

### Shared deterministic engine

`shared/gematria/gematria.cjs`

This is the authoritative calculator. Do not duplicate the formulas in React or Python unless a future backend use requires a formally tested port.

Electron exposes it to the renderer through IPC.

### Electron feature module

`electron/main/features/quick-gematria.cjs`

Responsibilities:

- global shortcut
- quick popup BrowserWindow
- background launch helpers
- autostart helper
- Gematria IPC
- microphone recording transcription bridge
- FFmpeg conversion
- Music Whisper call

`electron/main/index.cjs` registers the feature after `app.whenReady()` and
unregisters the hotkey during `before-quit`.

### Renderer UI

`frontend/src/features/quick-gematria/QuickGematriaOverlay.tsx`

Responsibilities:

- editable phrase
- automatic microphone recording
- silence detection
- transcription request
- live recalculation
- results display
- Escape-to-hide

## Gematria systems

### Simple Gematria

A=1 through Z=26.

### English Gematria

Simple value multiplied by six.

A=6 through Z=156.

### Jewish / Hebrew Gematria as used by Gematrix for English letters

| Letter | Value | Letter | Value |
|---|---:|---|---:|
| A | 1 | N | 40 |
| B | 2 | O | 50 |
| C | 3 | P | 60 |
| D | 4 | Q | 70 |
| E | 5 | R | 80 |
| F | 6 | S | 90 |
| G | 7 | T | 100 |
| H | 8 | U | 200 |
| I | 9 | V | 700 |
| J | 600 | W | 900 |
| K | 10 | X | 300 |
| L | 20 | Y | 400 |
| M | 30 | Z | 500 |

Characters outside A-Z are ignored for numeric calculation.

Regression example:

`simple`

- Jewish: 214
- English: 444
- Simple: 74

## Voice flow

1. Press `Ctrl+Alt+G`.
2. Electron opens/focuses Quick Gematria.
3. Renderer asks for microphone access.
4. Recording begins.
5. Speech detection watches microphone energy.
6. After speech has occurred and approximately 1.2 seconds of silence follows, recording stops.
7. Renderer sends audio bytes to Electron through IPC.
8. Electron writes a temporary recording.
9. FFmpeg converts it to mono 16 kHz WAV.
10. Electron calls Music Whisper.
11. Transcribed text is returned to the renderer.
12. Electron calculates Gematria using the shared engine.
13. Results appear.
14. Editing the text recalculates immediately.

Maximum automatic recording length for v1 is 15 seconds.

## Music Whisper

Current service base URL:

`http://127.0.0.1:8091`

Known endpoint:

`POST /transcribe`

Known request structure:

```json
{
  "audio_path": "/path/to/audio.wav",
  "output_dir": "/temporary/output"
}
```

The current integrated path uses the supplied direct Music Whisper bridge in
Electron. The existing FastAPI `/api/stt/transcribe` route persists transcript
records and depends on the app's whisper.cpp settings, which is useful for
normal My Song Bible transcription but heavier than the throwaway popup phrase
capture. Quick Gematria therefore sends a temporary WAV path directly to
Music Whisper and deletes the temporary directory after the call.

Typed Gematria must continue to work if Whisper is stopped.

If Music Whisper is unavailable, the overlay shows an error status and leaves
the editable text area usable. Calculation stays local through
`window.quickGematria.calculate()`.

## Electron lifecycle

### Normal launch

`npm start`

My Song Bible opens normally.

The app also registers `Ctrl+Alt+G` while the normal main window is open.

### Background launch

The packaged application may be launched with:

`--background`

The Electron process starts but the normal main application window does not need to be displayed.

The global hotkey remains active.

The backend startup path is unchanged in background mode, so services needed by
the resident app still start.

### Quick popup

The Quick Gematria BrowserWindow is created lazily.

Closing or pressing Escape hides it rather than terminating the Electron process.

Repeated hotkey presses reuse the same BrowserWindow and send
`quick-gematria:opened` to restart microphone capture.

### Quit

An explicit application Quit must terminate the background process and unregister shortcuts.
There is no tray/menu infrastructure in this template at the time of this
integration, so no new tray was added.

## Autostart

Electron provides:

`app.setLoginItemSettings()`

The Quick Gematria feature includes a helper for enabling login startup with:

`--background`

There was no existing startup/background setting surface in the template. The
preload bridge exposes narrow autostart methods for a future settings UI:

- `window.quickGematria.getAutostart()`
- `window.quickGematria.setAutostart(enabled)`

When enabled, Electron login startup is configured with `--background`.
Autostart is meaningful for packaged applications; development runs should not
be treated as proof that OS login startup works.

## Security

Keep:

- `contextIsolation: true`
- `nodeIntegration: false`

Expose only narrow Quick Gematria methods through the existing preload bridge.

Do not expose `ipcRenderer` wholesale to React.

Current preload API:

```ts
window.quickGematria.calculate(input)
window.quickGematria.transcribe({ audioBytes, mimeType })
window.quickGematria.hide()
window.quickGematria.onOpened(callback)
window.quickGematria.getAutostart()
window.quickGematria.setAutostart(enabled)
```

IPC channels:

- `quick-gematria:calculate`
- `quick-gematria:transcribe`
- `quick-gematria:hide`
- `quick-gematria:opened`
- `quick-gematria:get-autostart`
- `quick-gematria:set-autostart`

IPC registration is guarded so handlers are not duplicated if the feature
registration function is called again.

## Renderer bootstrap

`frontend/src/main.tsx` checks the renderer URL query string. When
`quick-gematria=1` is present, it renders only
`<QuickGematriaOverlay />`. Otherwise it preserves the existing
`BrowserRouter` and `<App />` application shell.

Development windows load the existing `ELECTRON_RENDERER_URL` value, defaulting
to `http://127.0.0.1:5173`. Packaged/dist windows load
`frontend/dist/index.html` with the same `quick-gematria=1` query flag.

## Hotkey

Default hotkey:

`Ctrl+Alt+G`

Electron registers this as:

`CommandOrControl+Alt+G`

To change it, edit `DEFAULT_HOTKEY` in
`electron/main/features/quick-gematria.cjs`.

If registration fails because another application owns the shortcut, Electron
logs a warning and the rest of My Song Bible continues to run.

## Future My Song Bible uses

The shared calculator can later be used for:

- song title values
- complete lyrics
- individual lines
- verses
- choruses
- bridges
- phrases
- words
- selected text
- SQLite indexing/search
- numeric pattern analysis

The calculator should remain deterministic and independent of AI.

## Tests

Shared engine:

```bash
node --test shared/gematria/gematria.test.cjs
```

Application:

```bash
npm run typecheck
npm run build
```

Electron smoke:

```bash
npm run electron:smoke
```

Then manually test:

- normal application launch
- Ctrl+Alt+G from another application
- automatic microphone capture
- silence detection
- Whisper transcription
- typed fallback
- all three values
- Escape hide
- repeated hotkey reopening
- background launch
- login/autostart after packaging

## Troubleshooting

- If `Ctrl+Alt+G` does nothing, check the Electron main-process logs for a
  shortcut registration warning. Another desktop application may already own
  that accelerator.
- If typed values work but speech does not, confirm `ffmpeg` is installed and
  Music Whisper is reachable at `http://127.0.0.1:8091`.
- If the popup opens but does not capture audio, check OS microphone
  permissions for the Electron app.
- If packaged Quick Gematria cannot calculate, confirm the package includes
  `shared/gematria/**/*`; this repository's `package.json` now includes it.
- Autostart should be manually verified from an installed `.deb` or AppImage
  context, not from the Vite/Electron development process.

## Files

- `shared/gematria/gematria.cjs`
- `shared/gematria/gematria.test.cjs`
- `electron/main/features/quick-gematria.cjs`
- `frontend/src/features/quick-gematria/QuickGematriaOverlay.tsx`
- `frontend/src/features/quick-gematria/types.ts`
- `frontend/src/features/quick-gematria/index.ts`
- `docs/QUICK_GEMATRIA.md`
- `docs/CODEX_QUICK_GEMATRIA_PROMPT.md`

Integrated touch points:

- `electron/main/index.cjs`
- `electron/preload/index.cjs`
- `frontend/src/main.tsx`
- `frontend/src/types/desktop.d.ts`
- `package.json`

## Validation notes

As of integration:

- `node --test shared/gematria/gematria.test.cjs` passes.
- `npm run typecheck` passes.
- `npm run build` passes.
- `npm run electron:smoke` builds the renderer but could not complete in this
  Codex session because Electron had no usable X display:
  `Missing X server or $DISPLAY`.
