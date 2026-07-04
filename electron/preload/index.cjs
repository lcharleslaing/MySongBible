const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  getAppVersion: () => ipcRenderer.invoke("desktop:get-app-version"),
  checkBackendHealth: () => ipcRenderer.invoke("desktop:check-backend-health"),
  openLogsFolder: () => ipcRenderer.invoke("desktop:open-logs-folder"),
  pickWhisperBinary: () => ipcRenderer.invoke("desktop:pick-whisper-binary"),
  pickWhisperModel: () => ipcRenderer.invoke("desktop:pick-whisper-model"),
  pickSqliteDatabase: () => ipcRenderer.invoke("desktop:pick-sqlite-database"),
});
