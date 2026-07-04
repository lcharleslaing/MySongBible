const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  getAppVersion: () => ipcRenderer.invoke("desktop:get-app-version"),
  checkBackendHealth: () => ipcRenderer.invoke("desktop:check-backend-health"),
  openLogsFolder: () => ipcRenderer.invoke("desktop:open-logs-folder"),
  pickWhisperBinary: () => ipcRenderer.invoke("desktop:pick-whisper-binary"),
  pickWhisperModel: () => ipcRenderer.invoke("desktop:pick-whisper-model"),
  pickPiperBinary: () => ipcRenderer.invoke("desktop:pick-piper-binary"),
  pickPiperModel: () => ipcRenderer.invoke("desktop:pick-piper-model"),
  pickAudioInputDirectory: () => ipcRenderer.invoke("desktop:pick-audio-input-directory"),
  pickAudioOutputDirectory: () => ipcRenderer.invoke("desktop:pick-audio-output-directory"),
  pickSqliteDatabase: () => ipcRenderer.invoke("desktop:pick-sqlite-database"),
});
