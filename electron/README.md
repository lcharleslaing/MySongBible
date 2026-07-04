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

## Packaging Status

Production packaging is not fully configured yet. The main process contains a guard for missing packaged backend resources, but a distributable build still needs an explicit strategy for bundling the backend, Python runtime, virtual environment or installed dependencies, and local runtime directories.
