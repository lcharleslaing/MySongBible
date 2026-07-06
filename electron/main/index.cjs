const path = require("node:path");
const { app, BrowserWindow, dialog, ipcMain, screen, shell } = require("electron");

const { registerDesktopIpc } = require("./ipc.cjs");
const { startBackendProcess, stopBackendProcess } = require("./backend.cjs");

const isDev = !app.isPackaged;
const rendererUrl = process.env.ELECTRON_RENDERER_URL || "http://127.0.0.1:5173";
const useLocalDist = process.env.APP_TEMPLATE_RENDERER_MODE === "dist";
const smokeMode = process.env.APP_TEMPLATE_SMOKE === "1";

if (smokeMode || process.env.APP_TEMPLATE_DISABLE_CHROMIUM_SANDBOX === "1") {
  app.commandLine.appendSwitch("no-sandbox");
}

if (process.env.APP_TEMPLATE_USER_DATA_DIR) {
  app.setPath("userData", path.resolve(process.env.APP_TEMPLATE_USER_DATA_DIR));
}

let mainWindow = null;
let backendController = null;

const zoomStep = 0.1;
const minZoomFactor = 0.7;
const maxZoomFactor = 1.8;

function clampZoomFactor(value) {
  return Math.min(maxZoomFactor, Math.max(minZoomFactor, value));
}

function adjustWindowZoom(window, delta) {
  const currentZoom = window.webContents.getZoomFactor();
  window.webContents.setZoomFactor(clampZoomFactor(Number((currentZoom + delta).toFixed(2))));
}

function getWindowDisplayBounds(window) {
  const display = screen.getDisplayMatching(window.getBounds()) || screen.getPrimaryDisplay();
  return display.workArea;
}

function getCenteredDefaultBounds(window) {
  const bounds = getWindowDisplayBounds(window);
  const width = Math.round(bounds.width * 0.75);
  const height = Math.round(bounds.height * 0.75);

  return {
    x: bounds.x + Math.round((bounds.width - width) / 2),
    y: bounds.y + Math.round((bounds.height - height) / 2),
    width,
    height,
  };
}

function restoreWindowToDefaultSize(window) {
  if (window.isDestroyed()) {
    return;
  }

  if (window.isMaximized()) {
    window.unmaximize();
  }
  window.setMinimumSize(800, 600);
  window.setBounds(getCenteredDefaultBounds(window), false);
  window.focus();
}

function exitFullScreenToDisplayWindow(window) {
  if (!window.isFullScreen()) {
    return false;
  }

  window.setFullScreen(false);
  return true;
}

function createMainWindow() {
  const preloadPath = path.join(__dirname, "..", "preload", "index.cjs");
  const initialBounds = screen.getPrimaryDisplay().workArea;
  const minWidth = Math.min(1100, initialBounds.width);
  const minHeight = Math.min(720, initialBounds.height);

  const window = new BrowserWindow({
    x: initialBounds.x,
    y: initialBounds.y,
    width: initialBounds.width,
    height: initialBounds.height,
    minWidth,
    minHeight,
    fullscreen: false,
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

  window.on("leave-full-screen", () => {
    setTimeout(() => restoreWindowToDefaultSize(window), 50);
  });

  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") {
      return;
    }

    const controlOrCommand = input.control || input.meta;

    if (controlOrCommand && ["+", "=", "numadd"].includes(input.key.toLowerCase())) {
      adjustWindowZoom(window, zoomStep);
      event.preventDefault();
    } else if (controlOrCommand && ["-", "numsub"].includes(input.key.toLowerCase())) {
      adjustWindowZoom(window, -zoomStep);
      event.preventDefault();
    } else if (controlOrCommand && input.key === "0") {
      window.webContents.setZoomFactor(1);
      event.preventDefault();
    } else if (input.key === "F11") {
      window.setFullScreen(!window.isFullScreen());
      event.preventDefault();
    } else if (["Escape", "Esc"].includes(input.key) && exitFullScreenToDisplayWindow(window)) {
      event.preventDefault();
    }
  });

  window.once("ready-to-show", () => {
    window.setFullScreen(true);
    window.show();
  });

  window.webContents.on("did-finish-load", async () => {
    if (smokeMode) {
      if (backendController?.healthUrl) {
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
          const result = await fetch(backendController.healthUrl).then((response) => response.ok).catch(() => false);
          if (result) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      setTimeout(() => {
        app.quit();
      }, 750);
    }
  });

  if (isDev && !useLocalDist) {
    window.loadURL(rendererUrl);
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
    BrowserWindow,
    dialog,
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
