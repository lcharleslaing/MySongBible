const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
let packageJob = null;

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

function appendLog(logPath, message) {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, message, "utf-8");
}

function findNewestDeb(releaseDir) {
  if (!fs.existsSync(releaseDir)) {
    return null;
  }

  return fs.readdirSync(releaseDir)
    .filter((fileName) => fileName.endsWith(".deb"))
    .map((fileName) => {
      const filePath = path.join(releaseDir, fileName);
      return {
        filePath,
        mtimeMs: fs.statSync(filePath).mtimeMs,
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.filePath || null;
}

function getPackageArtifacts() {
  const releaseDir = path.join(repoRoot, "release");
  if (!fs.existsSync(releaseDir)) {
    return [];
  }

  return fs.readdirSync(releaseDir)
    .filter((fileName) => fileName.endsWith(".deb") || fileName.endsWith(".AppImage"))
    .map((fileName) => {
      const filePath = path.join(releaseDir, fileName);
      const stats = fs.statSync(filePath);
      return {
        name: fileName,
        path: filePath,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function getPackageName() {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8"));
    return packageJson.name || "apptemplatebase";
  } catch {
    return "apptemplatebase";
  }
}

function getDebInstallStatus() {
  const packageName = getPackageName();
  const result = spawnSync("dpkg-query", ["-W", "-f=${Status}\t${Version}", packageName], {
    encoding: "utf-8",
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  const installed = result.status === 0 && output.includes("install ok installed");
  const version = installed ? output.split("\t")[1] || null : null;

  return {
    packageName,
    installed,
    version,
  };
}

function getPackageStatus(app) {
  return {
    running: Boolean(packageJob),
    action: packageJob?.action || null,
    startedAt: packageJob?.startedAt || null,
    logsPath: path.join(app.getPath("logs"), "build-package.log"),
    releaseDir: path.join(repoRoot, "release"),
    artifacts: getPackageArtifacts(),
    installStatus: getDebInstallStatus(),
  };
}

function runCommandJob({ app, action, command, args }) {
  if (packageJob) {
    return Promise.resolve({
      ok: false,
      message: `A packaging job is already running: ${packageJob.action}`,
      ...getPackageStatus(app),
    });
  }

  const logsPath = path.join(app.getPath("logs"), "build-package.log");
  const startedAt = new Date().toISOString();
  packageJob = { action, startedAt };
  appendLog(logsPath, `\n[${startedAt}] Starting ${action}: ${command} ${args.join(" ")}\n`);

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: "pipe",
      shell: false,
    });

    child.stdout.on("data", (chunk) => appendLog(logsPath, chunk.toString()));
    child.stderr.on("data", (chunk) => appendLog(logsPath, chunk.toString()));

    child.on("error", (error) => {
      appendLog(logsPath, `[${new Date().toISOString()}] Failed to start ${action}: ${error.message}\n`);
      packageJob = null;
      resolve({
        ok: false,
        message: error.message,
        ...getPackageStatus(app),
      });
    });

    child.on("close", (code) => {
      const finishedAt = new Date().toISOString();
      const ok = code === 0;
      appendLog(logsPath, `[${finishedAt}] Finished ${action} with exit code ${code}.\n`);
      packageJob = null;
      resolve({
        ok,
        message: ok ? `${action} completed.` : `${action} failed with exit code ${code}. Check build-package.log.`,
        ...getPackageStatus(app),
      });
    });
  });
}

async function runPackageAndReinstall(app) {
  const buildResult = await runCommandJob({
    app,
    action: "Build Linux packages",
    command: "npm",
    args: ["run", "package:linux"],
  });

  if (!buildResult.ok) {
    return buildResult;
  }

  return runReinstall(app);
}

function runReinstall(app) {
  const releaseDir = path.join(repoRoot, "release");
  const debPath = findNewestDeb(releaseDir);
  if (!debPath) {
    return Promise.resolve({
      ok: false,
      message: "No .deb package found. Build Linux packages first.",
      ...getPackageStatus(app),
    });
  }

  const pkexecCheck = spawnSync("which", ["pkexec"], { stdio: "ignore" });
  if (pkexecCheck.status !== 0) {
    return Promise.resolve({
      ok: false,
      message: `pkexec was not found. Run this manually: sudo apt install -y ${debPath}`,
      ...getPackageStatus(app),
    });
  }

  return runCommandJob({
    app,
    action: "Install latest .deb",
    command: "pkexec",
    args: ["apt", "install", "-y", debPath],
  });
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

  ipcMain.handle("desktop:open-release-folder", async () => {
    const releaseDir = path.join(repoRoot, "release");
    fs.mkdirSync(releaseDir, { recursive: true });
    const result = await shell.openPath(releaseDir);

    return {
      ok: result === "",
      path: releaseDir,
      message: result || null,
    };
  });

  ipcMain.handle("desktop:get-package-status", () => getPackageStatus(app));

  ipcMain.handle("desktop:run-linux-package", () => runCommandJob({
    app,
    action: "Build Linux packages",
    command: "npm",
    args: ["run", "package:linux"],
  }));

  ipcMain.handle("desktop:reinstall-linux-package", () => runReinstall(app));

  ipcMain.handle("desktop:package-and-reinstall-linux", () => runPackageAndReinstall(app));

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
