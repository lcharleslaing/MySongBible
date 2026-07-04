const fs = require("node:fs");
const path = require("node:path");

const repoRoot = process.cwd();
const backendDir = path.join(repoRoot, "backend");
const statePath = path.join(repoRoot, ".app-template-state.json");
const dryRun = process.argv.includes("--dry-run") || process.env.TEMPLATE_INIT_DRY_RUN === "1";
const force = process.argv.includes("--force") || process.env.TEMPLATE_INIT_FORCE === "1";

const templateNames = new Set(["apptemplatebase", "app-template-base"]);
const whisperBinaryPath = "/home/llaing/whisper.cpp/build/bin/whisper-cli";
const whisperModelCandidates = [
  "/home/llaing/whisper.cpp/models/ggml-tiny.en.bin",
  "/home/llaing/whisper.cpp/models/ggml-base.en.bin",
  "/home/llaing/whisper.cpp/models/ggml-small.en.bin",
];

function log(message) {
  process.stdout.write(`[template:init] ${message}\n`);
}

function warn(message) {
  process.stdout.write(`[template:init] Warning: ${message}\n`);
}

function fileExists(targetPath) {
  return fs.existsSync(targetPath);
}

function readJson(targetPath) {
  return JSON.parse(fs.readFileSync(targetPath, "utf-8"));
}

function writeJson(targetPath, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (dryRun) {
    log(`Would write ${path.relative(repoRoot, targetPath)}.`);
    return;
  }
  fs.writeFileSync(targetPath, content, "utf-8");
}

function writeText(targetPath, content) {
  if (dryRun) {
    log(`Would write ${path.relative(repoRoot, targetPath)}.`);
    return;
  }
  fs.writeFileSync(targetPath, content, "utf-8");
}

function toNpmPackageName(folderName) {
  const withWordBreaks = folderName
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-zA-Z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .toLowerCase();

  return withWordBreaks;
}

function isValidNpmPackageName(packageName) {
  return /^[a-z0-9][a-z0-9._-]*$/.test(packageName) && !packageName.includes("..") && packageName.length <= 214;
}

function currentFolderName() {
  return path.basename(repoRoot);
}

function packageStillTemplate(packageName) {
  return templateNames.has(String(packageName || "").toLowerCase());
}

function replaceExactFileText(relativePath, from, to) {
  const targetPath = path.join(repoRoot, relativePath);
  if (!fileExists(targetPath)) {
    return false;
  }

  const current = fs.readFileSync(targetPath, "utf-8");
  if (!current.includes(from)) {
    return false;
  }

  writeText(targetPath, current.replace(from, to));
  return true;
}

function maybeUpdateJsonName(relativePath, nextName, currentNames) {
  const targetPath = path.join(repoRoot, relativePath);
  if (!fileExists(targetPath)) {
    return false;
  }

  const data = readJson(targetPath);
  if (!currentNames.has(String(data.name || "").toLowerCase())) {
    return false;
  }

  data.name = nextName;
  writeJson(targetPath, data);
  return true;
}

function updateIdentity({ displayName, packageName }) {
  const changed = [];

  if (maybeUpdateJsonName("package.json", packageName, templateNames)) {
    changed.push("package.json name");
  }

  const frontendTemplateNames = new Set(["apptemplatebase-frontend", "app-template-base-frontend"]);
  if (maybeUpdateJsonName("frontend/package.json", `${packageName}-frontend`, frontendTemplateNames)) {
    changed.push("frontend/package.json name");
  }

  if (replaceExactFileText("frontend/index.html", "<title>AppTemplateBase</title>", `<title>${displayName}</title>`)) {
    changed.push("frontend/index.html title");
  }

  if (replaceExactFileText(
    "frontend/src/components/layout/Sidebar.tsx",
    "            AppTemplateBase",
    `            ${displayName}`,
  )) {
    changed.push("frontend sidebar title");
  }

  if (replaceExactFileText("README.md", "# AppTemplateBase\n", `# ${displayName}\n`)) {
    changed.push("README title");
  }

  return changed;
}

function readEnvFile(targetPath) {
  if (!fileExists(targetPath)) {
    return [];
  }
  return fs.readFileSync(targetPath, "utf-8").split(/\r?\n/);
}

function isGenericEnvValue(value) {
  const trimmed = value.trim();
  return (
    trimmed === "" ||
    trimmed === "/absolute/path/to/whisper-cli" ||
    trimmed === "/absolute/path/to/ggml-base.en.bin" ||
    trimmed === "/path/to/whisper-cli" ||
    trimmed === "/path/to/ggml-model.bin"
  );
}

function upsertEnv(lines, key, value, { overwrite = false } = {}) {
  const matcher = new RegExp(`^${key}=`);
  const index = lines.findIndex((line) => matcher.test(line));
  if (index === -1) {
    lines.push(`${key}=${value}`);
    return true;
  }

  const currentValue = lines[index].slice(key.length + 1);
  if (!overwrite && !isGenericEnvValue(currentValue)) {
    return false;
  }

  if (currentValue === value) {
    return false;
  }

  lines[index] = `${key}=${value}`;
  return true;
}

function chooseWhisperModel() {
  return whisperModelCandidates.find((candidate) => fileExists(candidate)) || "";
}

function ensureBackendEnv() {
  const envPath = path.join(backendDir, ".env");
  const examplePath = path.join(backendDir, ".env.example");

  if (!fileExists(envPath)) {
    log("Preparing backend/.env...");
    if (!fileExists(examplePath)) {
      throw new Error("backend/.env.example was not found; cannot create backend/.env.");
    }
    if (dryRun) {
      log("Would copy backend/.env.example to backend/.env.");
    } else {
      fs.copyFileSync(examplePath, envPath);
    }
  } else {
    log("Backend environment found.");
  }

  const lines = readEnvFile(envPath);
  let changed = false;
  const overwrite = force;

  const whisperBinaryExists = fileExists(whisperBinaryPath);
  if (upsertEnv(lines, "WHISPER_CPP_BINARY", whisperBinaryPath, { overwrite })) {
    changed = true;
  }
  if (whisperBinaryExists) {
    log(`Using Whisper binary: ${whisperBinaryPath}`);
  } else {
    warn(`Whisper binary was not found at configured path: ${whisperBinaryPath}`);
  }

  const whisperModelPath = chooseWhisperModel();
  if (whisperModelPath) {
    if (upsertEnv(lines, "WHISPER_MODEL_PATH", whisperModelPath, { overwrite })) {
      changed = true;
    }
    log(`Using Whisper model: ${whisperModelPath}`);
  } else {
    warn("No local Whisper model was found. Set WHISPER_MODEL_PATH in backend/.env.");
  }

  if (upsertEnv(lines, "TTS_ENGINE", "mock", { overwrite })) {
    changed = true;
  }
  log("Using TTS engine: mock");

  if (changed) {
    writeText(envPath, `${lines.join("\n").replace(/\n+$/g, "")}\n`);
  }
}

function writeState({ displayName, packageName, identityChanges }) {
  const state = {
    initializedAt: new Date().toISOString(),
    folderName: currentFolderName(),
    displayName,
    packageName,
    identityChanges,
  };
  writeJson(statePath, state);
}

function main() {
  const folderName = currentFolderName();
  const packageName = toNpmPackageName(folderName);
  const stateExists = fileExists(statePath);

  log(`Detected cloned project name: ${folderName}`);

  if (!isValidNpmPackageName(packageName)) {
    warn(`Could not derive a valid npm package name from folder '${folderName}'. Skipping identity setup.`);
    ensureBackendEnv();
    return;
  }

  let identityChanges = [];
  const rootPackage = readJson(path.join(repoRoot, "package.json"));
  const currentPackageName = String(rootPackage.name || "").toLowerCase();
  const shouldRunIdentity = force || !stateExists;

  if (!shouldRunIdentity) {
    log("Template initialization already complete. Skipping identity setup.");
  } else if (packageStillTemplate(currentPackageName) && !packageStillTemplate(packageName)) {
    log(`Updating template identity from AppTemplateBase to ${folderName}...`);
    identityChanges = updateIdentity({ displayName: folderName, packageName });
    if (identityChanges.length === 0) {
      log("No safe template identity fields needed updates.");
    } else {
      log(`Updated: ${identityChanges.join(", ")}.`);
    }
  } else if (currentPackageName === packageName || (packageStillTemplate(currentPackageName) && packageStillTemplate(packageName))) {
    log("Package identity already matches the current folder. No identity changes needed.");
  } else {
    log("Package identity is already customized. Skipping identity setup.");
  }

  ensureBackendEnv();
  if (force || !stateExists) {
    writeState({ displayName: folderName, packageName, identityChanges });
  }
  log("Template initialization complete.");
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[template:init] Failed: ${message}`);
  process.exit(1);
}
