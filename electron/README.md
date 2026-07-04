# Electron Layer

This directory is reserved for the desktop shell.

Planned responsibilities:

- application startup and shutdown
- BrowserWindow lifecycle
- preload bridge
- backend process orchestration
- desktop-only integrations such as file dialogs and app paths

Suggested internal layout:

- `main/` Electron main process files
- `preload/` secure renderer bridge
- `assets/` desktop icons and packaged resources
