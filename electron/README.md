# Electron Layer

This directory contains the desktop wrapper for AppTemplateBase.

## Current Scope

- Electron main process and window lifecycle
- secure preload bridge
- development loading from the Vite dev server
- production loading from the built frontend
- simple backend child-process management
- native file and directory pickers for local settings
- narrow IPC methods for desktop status and utility actions

## IPC Methods

- `desktop.getAppVersion()`
- `desktop.checkBackendHealth()`
- `desktop.openLogsFolder()`
- `desktop.pickWhisperBinary()`
- `desktop.pickWhisperModel()`
- `desktop.pickPiperBinary()`
- `desktop.pickPiperModel()`
- `desktop.pickAudioInputDirectory()`
- `desktop.pickAudioOutputDirectory()`
- `desktop.pickSqliteDatabase()`

## Security Notes

- `contextIsolation` stays enabled.
- `nodeIntegration` stays disabled in the renderer.
- Filesystem access flows through preload and the Electron main process only.
