const path = require("node:path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");

const { registerDesktopIpc } = require("./ipc.cjs");
const { startBackendProcess, stopBackendProcess } = require("./backend.cjs");

const isDev = !app.isPackaged;
const rendererUrl = process.env.ELECTRON_RENDERER_URL || "http://127.0.0.1:5173";
const useLocalDist = process.env.APP_TEMPLATE_RENDERER_MODE === "dist";
const smokeMode = process.env.APP_TEMPLATE_SMOKE === "1";

let mainWindow = null;
let backendController = null;

function createMainWindow() {
  const preloadPath = path.join(__dirname, "..", "preload", "index.cjs");

  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f3f6ef",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      sandbox: false,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  window.once("ready-to-show", () => {
    window.show();
  });

  window.webContents.on("did-finish-load", () => {
    if (smokeMode) {
      setTimeout(() => {
        app.quit();
      }, 750);
    }
  });

  if (isDev && !useLocalDist) {
    window.loadURL(rendererUrl);
    if (!smokeMode) {
      window.webContents.openDevTools({ mode: "detach" });
    }
  } else {
    const indexPath = path.join(app.getAppPath(), "frontend", "dist", "index.html");
    window.loadFile(indexPath);
  }

  return window;
}

async function bootstrap() {
  await app.whenReady();

  backendController = startBackendProcess({
    app,
    isDev,
  });

  registerDesktopIpc({
    app,
    ipcMain,
    shell,
    backendController,
  });

  mainWindow = createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
}

app.on("window-all-closed", async () => {
  if (process.platform !== "darwin") {
    await stopBackendProcess(backendController);
    app.quit();
  }
});

app.on("before-quit", async () => {
  await stopBackendProcess(backendController);
});

bootstrap().catch(async (error) => {
  console.error("Failed to bootstrap Electron app:", error);
  await stopBackendProcess(backendController);
  app.exit(1);
});
