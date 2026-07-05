# Electron Layer

This directory contains the desktop wrapper for AppTemplateBase.

## Current Scope

- Electron main process and window lifecycle
- secure preload bridge
- development loading from the Vite dev server
- smoke-test loading from the built frontend
- simple backend child-process management
- native file and directory pickers for local settings
- narrow IPC methods for desktop status and utility actions

## IPC Methods

- `desktop.getAppVersion()`
- `desktop.getBackendBaseUrl()`
- `desktop.checkBackendHealth()`
- `desktop.openLogsFolder()`
- `desktop.pickWhisperBinary()`
- `desktop.pickWhisperModel()`
- `desktop.pickPiperBinary()`
- `desktop.pickPiperModel()`
- `desktop.pickAudioInputDirectory()`
- `desktop.pickAudioOutputDirectory()`

## Security Notes

- `contextIsolation` stays enabled.
- `nodeIntegration` stays disabled in the renderer.
- `sandbox` is currently disabled because Electron's Chromium sandbox fails in the supported Linux development/smoke environment with `sandbox_host_linux.cc` permission errors. Keep `contextIsolation` enabled and `nodeIntegration` disabled; re-enable sandbox only after validating the target packaging/runtime environment.
- Smoke mode also passes Chromium `--no-sandbox` so CI/container runs can launch Electron without Linux sandbox permissions.
- Filesystem access flows through preload and the Electron main process only.

## Linux Packaging

Linux packaging is configured through `electron-builder`.

From the repository root:

```bash
npm run package:linux
```

This generates Linux icons, builds the frontend, and creates both:

- `.deb`
- `.AppImage`

Artifacts are written to `release/`.

To install or replace the current local `.deb` build:

```bash
npm run reinstall:linux
```

To build and then immediately reinstall the newest `.deb`:

```bash
npm run package:linux:reinstall
```

The packaged app includes the backend source and current backend virtualenv so it can run on this Linux machine without expecting backend dependencies to be installed globally. Local AI model files and runtime data are not bundled.
