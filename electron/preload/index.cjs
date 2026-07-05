const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  getAppVersion: () => ipcRenderer.invoke("desktop:get-app-version"),
  getBackendBaseUrl: () => ipcRenderer.invoke("desktop:get-backend-base-url"),
  checkBackendHealth: () => ipcRenderer.invoke("desktop:check-backend-health"),
  openLogsFolder: () => ipcRenderer.invoke("desktop:open-logs-folder"),
  openReleaseFolder: () => ipcRenderer.invoke("desktop:open-release-folder"),
  getPackageStatus: () => ipcRenderer.invoke("desktop:get-package-status"),
  runLinuxPackage: () => ipcRenderer.invoke("desktop:run-linux-package"),
  reinstallLinuxPackage: () => ipcRenderer.invoke("desktop:reinstall-linux-package"),
  packageAndReinstallLinux: () => ipcRenderer.invoke("desktop:package-and-reinstall-linux"),
  pickWhisperBinary: () => ipcRenderer.invoke("desktop:pick-whisper-binary"),
  pickWhisperModel: () => ipcRenderer.invoke("desktop:pick-whisper-model"),
  pickPiperBinary: () => ipcRenderer.invoke("desktop:pick-piper-binary"),
  pickPiperModel: () => ipcRenderer.invoke("desktop:pick-piper-model"),
  pickAudioInputDirectory: () => ipcRenderer.invoke("desktop:pick-audio-input-directory"),
  pickAudioOutputDirectory: () => ipcRenderer.invoke("desktop:pick-audio-output-directory"),
});
