const fs = require("node:fs");
const path = require("node:path");

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

function firstExistingPath(paths) {
  return paths.find((candidate) => candidate && fs.existsSync(candidate)) || undefined;
}

function registerDesktopIpc({ app, BrowserWindow, dialog, ipcMain, shell, backendController }) {
  ipcMain.handle("desktop:get-app-version", () => app.getVersion());
  ipcMain.handle("desktop:get-backend-base-url", () => backendController?.baseUrl || "http://127.0.0.1:8000");

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

  ipcMain.handle("desktop:pick-piper-binary", async () => {
    const homeDir = app.getPath("home");
    const result = await dialog.showOpenDialog(getActiveWindow(BrowserWindow), {
      title: "Select Piper Executable (usually named piper)",
      defaultPath: firstExistingPath([
        "/usr/local/bin",
        "/usr/bin",
        path.join(homeDir, ".local", "bin"),
        path.join(homeDir, "piper"),
        homeDir,
      ]),
      properties: ["openFile"],
    });

    return {
      canceled: result.canceled,
      path: normalizeSelectedPath(result.filePaths),
    };
  });

  ipcMain.handle("desktop:pick-piper-model", async () => {
    const homeDir = app.getPath("home");
    const result = await dialog.showOpenDialog(getActiveWindow(BrowserWindow), {
      title: "Select Piper Voice Model (.onnx)",
      defaultPath: firstExistingPath([
        path.join(homeDir, "piper", "models"),
        path.join(homeDir, "piper"),
        path.join(homeDir, "models"),
        homeDir,
      ]),
      properties: ["openFile"],
      filters: [
        { name: "Piper Voice Models (.onnx)", extensions: ["onnx"] },
      ],
    });

    return {
      canceled: result.canceled,
      path: normalizeSelectedPath(result.filePaths),
    };
  });

  ipcMain.handle("desktop:pick-audio-input-directory", async () => {
    const result = await dialog.showOpenDialog(getActiveWindow(BrowserWindow), {
      title: "Select Audio Input Directory",
      properties: ["openDirectory", "createDirectory"],
    });

    return {
      canceled: result.canceled,
      path: normalizeSelectedPath(result.filePaths),
    };
  });

  ipcMain.handle("desktop:pick-audio-output-directory", async () => {
    const result = await dialog.showOpenDialog(getActiveWindow(BrowserWindow), {
      title: "Select Audio Output Directory",
      properties: ["openDirectory", "createDirectory"],
    });

    return {
      canceled: result.canceled,
      path: normalizeSelectedPath(result.filePaths),
    };
  });

}

module.exports = {
  registerDesktopIpc,
};
