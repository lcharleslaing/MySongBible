const fs = require("node:fs");

async function checkBackendHealth(healthUrl) {
  try {
    const response = await fetch(healthUrl);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        message: `Backend returned HTTP ${response.status}`,
      };
    }

    const payload = await response.json();
    return {
      ok: true,
      status: response.status,
      payload,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      message: error instanceof Error ? error.message : "Backend health check failed",
    };
  }
}

function getActiveWindow(BrowserWindow) {
  return BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || null;
}

function normalizeSelectedPath(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return null;
  }

  return filePaths[0];
}

function registerDesktopIpc({ app, BrowserWindow, dialog, ipcMain, shell, backendController }) {
  ipcMain.handle("desktop:get-app-version", () => app.getVersion());

  ipcMain.handle("desktop:check-backend-health", async () => {
    const healthUrl = backendController?.healthUrl || "http://127.0.0.1:8000/api/health";
    return checkBackendHealth(healthUrl);
  });

  ipcMain.handle("desktop:open-logs-folder", async () => {
    const logsDir = backendController?.logsDir || app.getPath("logs");
    fs.mkdirSync(logsDir, { recursive: true });
    const result = await shell.openPath(logsDir);

    return {
      ok: result === "",
      path: logsDir,
      message: result || null,
    };
  });

  ipcMain.handle("desktop:pick-whisper-binary", async () => {
    const result = await dialog.showOpenDialog(getActiveWindow(BrowserWindow), {
      title: "Select Whisper Binary",
      properties: ["openFile"],
    });

    return {
      canceled: result.canceled,
      path: normalizeSelectedPath(result.filePaths),
    };
  });

  ipcMain.handle("desktop:pick-whisper-model", async () => {
    const result = await dialog.showOpenDialog(getActiveWindow(BrowserWindow), {
      title: "Select Whisper Model",
      properties: ["openFile"],
      filters: [
        { name: "Whisper Models", extensions: ["bin", "gguf"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });

    return {
      canceled: result.canceled,
      path: normalizeSelectedPath(result.filePaths),
    };
  });

  ipcMain.handle("desktop:pick-sqlite-database", async () => {
    const result = await dialog.showSaveDialog(getActiveWindow(BrowserWindow), {
      title: "Select SQLite Database Path",
      defaultPath: "app_template_base.sqlite3",
      filters: [
        { name: "SQLite Databases", extensions: ["sqlite3", "sqlite", "db"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });

    return {
      canceled: result.canceled,
      path: result.canceled ? null : result.filePath || null,
    };
  });
}

module.exports = {
  registerDesktopIpc,
};
