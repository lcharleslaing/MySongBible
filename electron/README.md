# Electron Layer

This directory contains the desktop wrapper for AppTemplateBase.

## Current Scope

- Electron main process and window lifecycle
- secure preload bridge
- development loading from the Vite dev server
- production loading from the built frontend
- simple backend child-process management
- placeholder desktop IPC methods

## IPC Methods

- `desktop.getAppVersion()`
- `desktop.checkBackendHealth()`
- `desktop.openLogsFolder()`
