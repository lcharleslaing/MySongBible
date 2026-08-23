const fs = require("node:fs");
const net = require("node:net");
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

function findAvailablePort(host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host, port: 0, exclusive: true }, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) {
          reject(error);
        } else if (!port) {
          reject(new Error("Could not determine the allocated backend port."));
        } else {
          resolve(port);
        }
      });
    });
  });
}

async function startBackendProcess({ app, isDev }) {
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
  const configuredPort = process.env.ELECTRON_BACKEND_PORT || process.env.BACKEND_PORT;
  const port = configuredPort || String(await findAvailablePort(host));
  const baseUrl = process.env.ELECTRON_BACKEND_BASE_URL || `http://${host}:${port}`;
  const appDataDir = process.env.APP_DATA_DIR || path.join(app.getPath("userData"), "data");

  const env = {
    ...process.env,
    BACKEND_HOST: process.env.BACKEND_HOST || host,
    BACKEND_PORT: process.env.BACKEND_PORT || port,
    APP_DATA_DIR: appDataDir,
    DATABASE_URL: process.env.DATABASE_URL || (isDev ? undefined : `sqlite:///${path.join(appDataDir, "my_song_bible.sqlite3")}`),
    LOG_DIR: process.env.LOG_DIR || logsDir,
  };

  appendLog(electronLogPath, `${new Date().toISOString()} Starting backend from ${backendDir} on ${baseUrl}.\n`);
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

    if (message.includes("address already in use") || message.includes("EADDRINUSE")) {
      const note = `Backend port ${port} became unavailable before startup completed. Restart this app to allocate another port.`;
      console.warn(note);
      appendLog(electronLogPath, `${new Date().toISOString()} ${note}\n`);
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
  findAvailablePort,
  startBackendProcess,
  stopBackendProcess,
};
