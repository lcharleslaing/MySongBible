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

function startBackendProcess({ app, isDev }) {
  const disabled = process.env.APP_DISABLE_BACKEND === "1";
  if (disabled) {
    return null;
  }

  const { backendDir, venvPython } = resolveBackendPaths(isDev);
  if (!fs.existsSync(backendDir)) {
    const message = isDev
      ? `Backend directory not found, skipping backend startup: ${backendDir}`
      : `Packaged backend resources were not found at ${backendDir}. Production packaging is not fully configured yet; run the app in development mode or add backend resources to the packaged app.`;
    console.warn(message);
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
  };

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
    process.stdout.write(`[backend] ${chunk}`);
  });

  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[backend] ${chunk}`);
  });

  child.on("error", (error) => {
    console.error("Backend process failed to start:", error);
  });

  return {
    child,
    baseUrl,
    healthUrl: process.env.ELECTRON_BACKEND_HEALTH_URL || `${baseUrl}/api/health`,
    logsDir: app.getPath("logs"),
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
