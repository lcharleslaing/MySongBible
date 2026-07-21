const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const LOCAL_AI_LAST_LINE_LIMIT = 200;
const LOCAL_AI_CHECK_TIMEOUT_MS = 5 * 60 * 1000;
const LOCAL_AI_SETUP_TIMEOUT_MS = 60 * 60 * 1000;
const LOCAL_AI_ACTIONS = {
  "setup-whisper": {
    script: "setup:whisper",
    supportsSetupOptions: true,
    timeoutMs: LOCAL_AI_SETUP_TIMEOUT_MS,
  },
  "setup-piper": {
    script: "setup:piper",
    supportsSetupOptions: true,
    timeoutMs: LOCAL_AI_SETUP_TIMEOUT_MS,
  },
  "setup-local-ai": {
    script: "setup:local-ai",
    supportsSetupOptions: true,
    timeoutMs: LOCAL_AI_SETUP_TIMEOUT_MS,
  },
  "check-stt": {
    script: "stt:check",
    supportsSetupOptions: false,
    timeoutMs: LOCAL_AI_CHECK_TIMEOUT_MS,
  },
  "check-tts": {
    script: "tts:check",
    supportsSetupOptions: false,
    timeoutMs: LOCAL_AI_CHECK_TIMEOUT_MS,
  },
  "check-local-ai": {
    script: "check:local-ai",
    supportsSetupOptions: false,
    timeoutMs: LOCAL_AI_CHECK_TIMEOUT_MS,
  },
};
let packageJob = null;
let localAiJob = null;
let localAiLastStatus = {
  running: false,
  action: null,
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  status: "idle",
  message: "No Local AI job has run yet.",
  logPath: null,
  lastLines: [],
  passCount: 0,
  warnCount: 0,
  failCount: 0,
};

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

function getNpmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function getLocalAiLogPath(app) {
  return path.join(app.getPath("logs"), "local-ai-setup.log");
}

function cloneLocalAiStatus(status) {
  return {
    ...status,
    lastLines: [...status.lastLines],
  };
}

function getLocalAiStatus(app) {
  return cloneLocalAiStatus({
    ...localAiLastStatus,
    running: Boolean(localAiJob),
    logPath: getLocalAiLogPath(app),
  });
}

function recordLocalAiOutput(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const displayLines = lines.filter((line) => line.length > 0);

  for (const line of displayLines) {
    if (/^PASS\b/.test(line)) {
      localAiLastStatus.passCount += 1;
    } else if (/^WARN\b/.test(line)) {
      localAiLastStatus.warnCount += 1;
    } else if (/^FAIL\b/.test(line)) {
      localAiLastStatus.failCount += 1;
    }
  }

  localAiLastStatus.lastLines = [...localAiLastStatus.lastLines, ...displayLines]
    .slice(-LOCAL_AI_LAST_LINE_LIMIT);
}

function buildLocalAiCommand(payload) {
  const options = payload && typeof payload === "object" ? payload : {};
  const allowedKeys = new Set(["action", "dryRun", "force"]);
  const unknownKeys = Object.keys(options).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    return {
      ok: false,
      message: `Unsupported Local AI option(s): ${unknownKeys.join(", ")}`,
    };
  }

  const action = options.action;
  const definition = LOCAL_AI_ACTIONS[action];
  if (!definition) {
    return {
      ok: false,
      message: `Unsupported Local AI action: ${action || "missing"}`,
    };
  }

  if (typeof options.dryRun !== "undefined" && typeof options.dryRun !== "boolean") {
    return {
      ok: false,
      message: "Local AI option dryRun must be a boolean.",
    };
  }

  if (typeof options.force !== "undefined" && typeof options.force !== "boolean") {
    return {
      ok: false,
      message: "Local AI option force must be a boolean.",
    };
  }

  const scriptArgs = [];
  if (definition.supportsSetupOptions && (options.dryRun || options.force)) {
    scriptArgs.push("--");
    if (options.dryRun) {
      scriptArgs.push("--dry-run");
    }
    if (options.force) {
      scriptArgs.push("--force");
    }
  } else if (!definition.supportsSetupOptions && options.force) {
      return {
        ok: false,
        message: `Local AI action ${action} does not support force.`,
      };
  }

  return {
    ok: true,
    action,
    command: getNpmCommand(),
    args: ["run", definition.script, ...scriptArgs],
    timeoutMs: definition.timeoutMs,
  };
}

function rejectLocalAiRun(app, message) {
  localAiLastStatus = {
    ...localAiLastStatus,
    running: Boolean(localAiJob),
    message,
    logPath: getLocalAiLogPath(app),
  };

  return {
    ok: false,
    message,
    ...getLocalAiStatus(app),
  };
}

function runLocalAiAction(app, payload) {
  if (localAiJob) {
    return rejectLocalAiRun(app, `A Local AI job is already running: ${localAiJob.action}`);
  }

  const commandSpec = buildLocalAiCommand(payload);
  if (!commandSpec.ok) {
    return rejectLocalAiRun(app, commandSpec.message);
  }

  const logPath = getLocalAiLogPath(app);
  const startedAt = new Date().toISOString();
  const commandText = `${commandSpec.command} ${commandSpec.args.join(" ")}`;
  localAiLastStatus = {
    running: true,
    action: commandSpec.action,
    startedAt,
    finishedAt: null,
    exitCode: null,
    status: "running",
    message: `Local AI ${commandSpec.action} started.`,
    logPath,
    lastLines: [],
    passCount: 0,
    warnCount: 0,
    failCount: 0,
  };

  appendLog(logPath, [
    "",
    "==== Local AI job started ====",
    `Action: ${commandSpec.action}`,
    `Started: ${startedAt}`,
    `Command: ${commandText}`,
    "==== Output ====",
    "",
  ].join("\n"));

  const child = spawn(commandSpec.command, commandSpec.args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "pipe",
    shell: false,
  });

  localAiJob = {
    action: commandSpec.action,
    child,
    timedOut: false,
  };

  const timeout = setTimeout(() => {
    if (!localAiJob || localAiJob.child !== child) {
      return;
    }

    localAiJob.timedOut = true;
    const message = `Local AI ${commandSpec.action} timed out after ${Math.round(commandSpec.timeoutMs / 60000)} minutes.`;
    appendLog(logPath, `\n[${new Date().toISOString()}] ${message}\n`);
    recordLocalAiOutput(`FAIL ${message}`);
    child.kill();
  }, commandSpec.timeoutMs);

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    appendLog(logPath, text);
    recordLocalAiOutput(text);
  });

  child.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    appendLog(logPath, text);
    recordLocalAiOutput(text);
  });

  child.on("error", (error) => {
    clearTimeout(timeout);
    const finishedAt = new Date().toISOString();
    const message = `Failed to start Local AI ${commandSpec.action}: ${error.message}`;
    appendLog(logPath, `\n[${finishedAt}] ${message}\n`);
    recordLocalAiOutput(`FAIL ${message}`);
    localAiJob = null;
    localAiLastStatus = {
      ...localAiLastStatus,
      running: false,
      finishedAt,
      exitCode: null,
      status: "failed",
      message,
    };
  });

  child.on("close", (code) => {
    clearTimeout(timeout);
    const finishedAt = new Date().toISOString();
    const timedOut = localAiJob?.child === child && localAiJob.timedOut;
    const status = timedOut ? "timed_out" : code === 0 ? "succeeded" : "failed";
    const message = timedOut
      ? `Local AI ${commandSpec.action} timed out.`
      : code === 0
        ? `Local AI ${commandSpec.action} completed.`
        : `Local AI ${commandSpec.action} failed with exit code ${code}.`;
    appendLog(logPath, `\n[${finishedAt}] ${message}\n`);
    localAiJob = null;
    localAiLastStatus = {
      ...localAiLastStatus,
      running: false,
      finishedAt,
      exitCode: code,
      status,
      message,
    };
  });

  return {
    ok: true,
    message: localAiLastStatus.message,
    ...getLocalAiStatus(app),
  };
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

function registerDesktopIpc({ app, BrowserWindow, dialog, ipcMain, nativeImage, shell, backendController }) {
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

  const iconDirectory = path.join(repoRoot, "electron", "assets", "icons");
  const iconSourcePath = path.join(iconDirectory, "icon-source.png");
  const iconSizes = [16, 24, 32, 48, 64, 128, 256, 512];

  const readAppIcon = () => {
    const iconPath = fs.existsSync(iconSourcePath)
      ? iconSourcePath
      : path.join(iconDirectory, "icon.png");
    const image = nativeImage.createFromPath(iconPath);
    return {
      ok: !image.isEmpty(),
      path: iconPath,
      dataUrl: image.isEmpty() ? null : image.toDataURL(),
      message: image.isEmpty() ? "The app icon could not be loaded." : null,
    };
  };

  ipcMain.handle("desktop:get-app-icon", readAppIcon);

  ipcMain.handle("desktop:pick-app-icon", async () => {
    const result = await dialog.showOpenDialog(getActiveWindow(BrowserWindow), {
      title: "Select App Icon",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    const selectedPath = normalizeSelectedPath(result.filePaths);
    if (result.canceled || !selectedPath) {
      return { canceled: true, ...readAppIcon() };
    }

    const selectedImage = nativeImage.createFromPath(selectedPath);
    if (selectedImage.isEmpty()) {
      return { canceled: false, ok: false, path: selectedPath, dataUrl: null, message: "The selected image could not be decoded." };
    }

    const sourceSize = selectedImage.getSize();
    if (sourceSize.width < 512 || sourceSize.height < 512) {
      return { canceled: false, ok: false, path: selectedPath, dataUrl: null, message: "Choose an image at least 512 x 512 pixels." };
    }

    const squareSize = Math.min(sourceSize.width, sourceSize.height);
    const squareImage = selectedImage.crop({
      x: Math.floor((sourceSize.width - squareSize) / 2),
      y: Math.floor((sourceSize.height - squareSize) / 2),
      width: squareSize,
      height: squareSize,
    });

    fs.mkdirSync(iconDirectory, { recursive: true });
    fs.writeFileSync(iconSourcePath, squareImage.resize({ width: 1024, height: 1024, quality: "best" }).toPNG());
    for (const size of iconSizes) {
      fs.writeFileSync(
        path.join(iconDirectory, `${size}x${size}.png`),
        squareImage.resize({ width: size, height: size, quality: "best" }).toPNG(),
      );
    }
    fs.copyFileSync(path.join(iconDirectory, "512x512.png"), path.join(iconDirectory, "icon.png"));

    return { canceled: false, ...readAppIcon(), message: "App icon selected and packaging sizes generated." };
  });

  ipcMain.handle("desktop:local-ai-get-status", () => getLocalAiStatus(app));

  ipcMain.handle("desktop:local-ai-run-action", (_event, payload) => runLocalAiAction(app, payload));

  ipcMain.handle("desktop:local-ai-get-log-tail", () => {
    const status = getLocalAiStatus(app);
    return {
      logPath: status.logPath,
      lastLines: status.lastLines,
    };
  });

  ipcMain.handle("desktop:local-ai-open-logs-folder", async () => {
    const logsDir = app.getPath("logs");
    fs.mkdirSync(logsDir, { recursive: true });
    const result = await shell.openPath(logsDir);

    return {
      ok: result === "",
      path: logsDir,
      message: result || null,
    };
  });

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

  ipcMain.handle("desktop:pick-clone-directory", async () => {
    const result = await dialog.showOpenDialog(getActiveWindow(BrowserWindow), {
      title: "Select Clone Location",
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
