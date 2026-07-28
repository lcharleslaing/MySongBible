const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const backendDir = path.join(repoRoot, "backend");
const templateInitScript = path.join(repoRoot, "scripts", "template", "init-template.cjs");
const templateUpdateCheckScript = path.join(repoRoot, "scripts", "template", "check-template-updates.cjs");
const bootstrapOnly = process.argv.includes("--bootstrap-only");
const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const rootDependencyMarker = path.join(repoRoot, "node_modules", ".apptemplatebase-root-deps.json");
const backendDependencyMarker = path.join(
  backendDir,
  ".venv",
  ".apptemplatebase-backend-deps.json",
);

function logStep(message) {
  process.stdout.write(`\n[bootstrap] ${message}\n`);
}

function fileExists(targetPath) {
  return fs.existsSync(targetPath);
}

function readJsonFile(targetPath) {
  if (!fileExists(targetPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf-8"));
  } catch {
    return null;
  }
}

function writeJsonFile(targetPath, value) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function getFileSignature(targetPath) {
  const stats = fs.statSync(targetPath);
  return {
    size: stats.size,
    mtimeMs: Math.trunc(stats.mtimeMs),
  };
}

function buildManifestSnapshot(relativePaths) {
  return Object.fromEntries(
    relativePaths.map((relativePath) => {
      const absolutePath = path.join(repoRoot, relativePath);
      return [
        relativePath,
        fileExists(absolutePath) ? getFileSignature(absolutePath) : null,
      ];
    }),
  );
}

function snapshotsMatch(left, right) {
  if (!left || !right) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => {
    const leftValue = left[key];
    const rightValue = right[key];
    return JSON.stringify(leftValue) === JSON.stringify(rightValue);
  });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || repoRoot,
      env: options.env || process.env,
      stdio: options.stdio || "inherit",
      shell: false,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

function probeCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: "ignore",
      shell: false,
    });

    child.on("error", () => resolve(false));
    child.on("exit", (code) => resolve(code === 0));
  });
}

async function resolvePythonCommand() {
  const configured = process.env.APP_TEMPLATE_PYTHON;
  const candidates = configured
    ? [configured]
    : isWindows
      ? ["py", "python", "python3"]
      : ["python3", "python"];

  for (const candidate of candidates) {
    const args = candidate === "py" ? ["-3", "--version"] : ["--version"];
    if (await probeCommand(candidate, args)) {
      return {
        command: candidate,
        versionArgs: args,
        venvArgs:
          candidate === "py"
            ? ["-3", "-m", "venv", ".venv"]
            : ["-m", "venv", ".venv"],
      };
    }
  }

  throw new Error(
    "Python was not found. Install Python 3.11+ or set APP_TEMPLATE_PYTHON to the correct executable.",
  );
}

function getRootDependencySnapshot() {
  return buildManifestSnapshot([
    "package.json",
    "package-lock.json",
    "frontend/package.json",
    "frontend/package-lock.json",
  ]);
}

function shouldInstallRootNodeModules() {
  if (!fileExists(path.join(repoRoot, "node_modules", "electron"))) {
    return {
      install: true,
      reason: "Root Node dependencies are missing.",
    };
  }

  const currentSnapshot = getRootDependencySnapshot();
  const savedState = readJsonFile(rootDependencyMarker);

  if (!savedState || !snapshotsMatch(savedState.snapshot, currentSnapshot)) {
    return {
      install: true,
      reason: "Root/frontend package manifests changed since the last successful npm install.",
    };
  }

  return {
    install: false,
    reason: "Root Node dependencies already match the current manifests.",
  };
}

async function ensureRootNodeModules() {
  const decision = shouldInstallRootNodeModules();
  if (!decision.install) {
    logStep(`${decision.reason} Skipping npm install.`);
    return;
  }

  logStep(`${decision.reason} Running npm install.`);
  await runCommand(npmCommand, ["install"]);
  writeJsonFile(rootDependencyMarker, {
    snapshot: getRootDependencySnapshot(),
  });
}

function resolveVenvPaths() {
  const binDir = isWindows ? "Scripts" : "bin";
  return {
    python: path.join(backendDir, ".venv", binDir, isWindows ? "python.exe" : "python"),
    pip: path.join(backendDir, ".venv", binDir, isWindows ? "pip.exe" : "pip"),
  };
}

async function ensureBackendVenv() {
  const { python } = resolveVenvPaths();
  if (fileExists(python)) {
    logStep("Backend virtualenv already present. Skipping venv creation.");
    return;
  }

  const pythonCommand = await resolvePythonCommand();
  logStep(`Creating backend virtualenv using ${pythonCommand.command}.`);
  await runCommand(pythonCommand.command, pythonCommand.venvArgs, { cwd: backendDir });
}

async function backendDependenciesInstalled() {
  const { python } = resolveVenvPaths();
  if (!fileExists(python)) {
    return false;
  }

  return probeCommand(python, [
    "-c",
    "import fastapi, sqlmodel, uvicorn, pydantic_settings, multipart",
  ]);
}

function getBackendDependencySnapshot() {
  return buildManifestSnapshot([
    "backend/pyproject.toml",
    "backend/.env.example",
  ]);
}

async function ensureBackendDependencies() {
  const depsPresent = await backendDependenciesInstalled();
  const currentSnapshot = getBackendDependencySnapshot();
  const savedState = readJsonFile(backendDependencyMarker);
  const manifestsMatch = savedState && snapshotsMatch(savedState.snapshot, currentSnapshot);

  if (depsPresent && manifestsMatch) {
    logStep("Backend Python dependencies already match the current backend manifests. Skipping pip install.");
    return;
  }

  const { pip } = resolveVenvPaths();
  const reason = depsPresent
    ? "Backend dependency manifests changed since the last successful pip install."
    : "Backend Python dependencies are missing.";
  logStep(`${reason} Running pip install -e .[dev].`);
  await runCommand(pip, ["install", "-e", ".[dev]"], { cwd: backendDir });
  writeJsonFile(backendDependencyMarker, {
    snapshot: currentSnapshot,
  });
}

function printWhisperReminder() {
  const rootEnvPath = path.join(repoRoot, ".env");
  const backendEnvPath = path.join(backendDir, ".env");
  const hasLocalEnv = fileExists(rootEnvPath) || fileExists(backendEnvPath);

  if (!hasLocalEnv) {
    logStep(
      "No local .env file found yet. Whisper paths remain configurable and can be added later without blocking app startup.",
    );
  }
}

async function main() {
  logStep("Running template initialization checks.");
  await runCommand(process.execPath, [templateInitScript]);
  logStep("Checking AppTemplateBase for upstream updates.");
  await runCommand(process.execPath, [templateUpdateCheckScript]);
  await ensureRootNodeModules();
  await ensureBackendVenv();
  await ensureBackendDependencies();
  printWhisperReminder();

  if (bootstrapOnly) {
    logStep("Bootstrap-only mode complete. Skipping app launch.");
    return;
  }

  logStep("Starting the full desktop app stack.");
  await runCommand(npmCommand, ["run", "app:dev"]);
}

main().catch((error) => {
  console.error(`\n[bootstrap] Startup failed: ${error.message}`);
  process.exit(1);
});
