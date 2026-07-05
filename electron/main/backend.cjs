const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

function resolveProjectRoot() {
  return path.resolve(__dirname, "..", "..");
}

function resolveBackendPaths(isDev) {
  if (isDev) {
    const projectRoot = resolveProjectRoot();
    return {
      backendDir: path.join(projectRoot, "backend"),
      venvPython: path.join(projectRoot, "backend", ".venv", "bin", "python"),
    };
  }

  const packagedBackendDir = path.join(process.resourcesPath, "backend");
  return {
    backendDir: packagedBackendDir,
    venvPython: path.join(packagedBackendDir, ".venv", "bin", "python"),
  };
}

function appendLog(logPath, message) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, message, "utf-8");
}

async function checkBackendHealth(healthUrl) {
  try {
    const response = await fetch(healthUrl);
    if (!response.ok) {
      return false;
    }

    const payload = await response.json();
    return payload?.status === "ok" && payload?.app_name === "AppTemplateBase Backend";
  } catch {
    return false;
  }
}

function startBackendProcess({ app, isDev }) {
  const disabled = process.env.APP_DISABLE_BACKEND === "1";
  const logsDir = app.getPath("logs");
  const backendLogPath = path.join(logsDir, "backend.log");
  const electronLogPath = path.join(logsDir, "electron-main.log");
  fs.mkdirSync(logsDir, { recursive: true });

  if (disabled) {
    appendLog(electronLogPath, `${new Date().toISOString()} Backend startup disabled by APP_DISABLE_BACKEND.\n`);
    return null;
  }

  const { backendDir, venvPython } = resolveBackendPaths(isDev);
  if (!fs.existsSync(backendDir)) {
    const message = isDev
      ? `Backend directory not found, skipping backend startup: ${backendDir}`
      : `Packaged backend resources were not found at ${backendDir}. Production packaging is not fully configured yet; run the app in development mode or add backend resources to the packaged app.`;
    console.warn(message);
    appendLog(electronLogPath, `${new Date().toISOString()} ${message}\n`);
    return null;
  }

  const pythonBinary = fs.existsSync(venvPython) ? venvPython : "python3";
  const host = process.env.ELECTRON_BACKEND_HOST || "127.0.0.1";
  const port = process.env.ELECTRON_BACKEND_PORT || "8000";
  const baseUrl = process.env.ELECTRON_BACKEND_BASE_URL || `http://${host}:${port}`;
  const env = {
    ...process.env,
    BACKEND_HOST: process.env.BACKEND_HOST || host,
    BACKEND_PORT: process.env.BACKEND_PORT || port,
    APP_DATA_DIR: process.env.APP_DATA_DIR || path.join(app.getPath("userData"), "data"),
    LOG_DIR: process.env.LOG_DIR || logsDir,
  };

  appendLog(electronLogPath, `${new Date().toISOString()} Starting backend from ${backendDir} on ${baseUrl}.\n`);
  let portConflictChecked = false;

  const child = spawn(
    pythonBinary,
    ["-m", "uvicorn", "app.main:app", "--host", host, "--port", port],
    {
      cwd: backendDir,
      env,
      stdio: "pipe",
    },
  );

  child.stdout.on("data", (chunk) => {
    const message = `[backend] ${chunk}`;
    process.stdout.write(message);
    appendLog(backendLogPath, message);
  });

  child.stderr.on("data", (chunk) => {
    const message = `[backend] ${chunk}`;
    process.stderr.write(message);
    appendLog(backendLogPath, message);

    if (!portConflictChecked && (message.includes("address already in use") || message.includes("EADDRINUSE"))) {
      portConflictChecked = true;
      void checkBackendHealth(process.env.ELECTRON_BACKEND_HEALTH_URL || `${baseUrl}/api/health`).then((isHealthy) => {
        const note = isHealthy
          ? `Port ${port} is already in use; reusing existing backend because ${baseUrl}/api/health matches this app.`
          : `Port ${port} is already in use and ${baseUrl}/api/health did not match this app. This looks like a backend port conflict.`;
        console.warn(note);
        appendLog(electronLogPath, `${new Date().toISOString()} ${note}\n`);
      });
    }
  });

  child.on("error", (error) => {
    console.error("Backend process failed to start:", error);
    appendLog(electronLogPath, `${new Date().toISOString()} Backend process failed to start: ${error.stack || error.message}\n`);
  });

  child.on("exit", (code, signal) => {
    appendLog(electronLogPath, `${new Date().toISOString()} Backend process exited with code ${code ?? "null"} and signal ${signal ?? "null"}.\n`);
  });

  return {
    child,
    baseUrl,
    healthUrl: process.env.ELECTRON_BACKEND_HEALTH_URL || `${baseUrl}/api/health`,
    logsDir,
  };
}

async function stopBackendProcess(controller) {
  if (!controller?.child || controller.child.killed) {
    return;
  }

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      if (!controller.child.killed) {
        controller.child.kill("SIGKILL");
      }
      resolve();
    }, 4000);

    controller.child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });

    controller.child.kill("SIGTERM");
  });
}

module.exports = {
  startBackendProcess,
  stopBackendProcess,
};
