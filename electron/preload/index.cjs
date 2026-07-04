const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  getAppVersion: () => ipcRenderer.invoke("desktop:get-app-version"),
  checkBackendHealth: () => ipcRenderer.invoke("desktop:check-backend-health"),
  openLogsFolder: () => ipcRenderer.invoke("desktop:open-logs-folder"),
});
