const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = process.cwd();
const backendDir = path.join(repoRoot, "backend");
const statePath = path.join(repoRoot, ".app-template-state.json");
const dryRun = process.argv.includes("--dry-run") || process.env.TEMPLATE_INIT_DRY_RUN === "1";
const force = process.argv.includes("--force") || process.env.TEMPLATE_INIT_FORCE === "1";
const skipRepository = process.argv.includes("--skip-repository") || process.env.TEMPLATE_INIT_SKIP_REPOSITORY === "1";
const repositoryOnly = process.argv.includes("--repository-only");

const templateNames = new Set(["apptemplatebase", "app-template-base"]);
const homeDir = os.homedir();
const localAiHome = process.env.LOCAL_AI_HOME || path.join(homeDir, "local-ai");
const whisperBinaryCandidates = [
  path.join(localAiHome, "whisper.cpp", "build", "bin", "whisper-cli"),
  path.join(homeDir, "whisper.cpp", "build", "bin", "whisper-cli"),
];
const whisperModelCandidates = [
  path.join(localAiHome, "whisper-models", "ggml-tiny.en.bin"),
  path.join(localAiHome, "whisper-models", "ggml-base.en.bin"),
  path.join(localAiHome, "whisper-models", "ggml-small.en.bin"),
  path.join(homeDir, "whisper.cpp", "models", "ggml-tiny.en.bin"),
  path.join(homeDir, "whisper.cpp", "models", "ggml-base.en.bin"),
  path.join(homeDir, "whisper.cpp", "models", "ggml-small.en.bin"),
];
const templateRepositoryPattern = /(?:^|[/:])AppTemplateBase(?:\.git)?$/i;
const identityFiles = [
  ".env.example",
  "README.md",
  "backend/.env.example",
  "backend/app/api/routes/health.py",
  "backend/app/core/config.py",
  "backend/app/core/runtime_paths.py",
  "backend/pyproject.toml",
  "frontend/index.html",
  "frontend/package-lock.json",
  "frontend/package.json",
  "package-lock.json",
  "package.json",
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

function run(command, args, { allowFailure = false } = {}) {
  if (dryRun) {
    log(`Would run: ${command} ${args.join(" ")}`);
    return { status: 0, stdout: "", stderr: "" };
  }
  const completed = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf-8",
    env: { ...process.env, GH_PROMPT_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });
  if (completed.error && !allowFailure) {
    throw completed.error;
  }
  if (completed.status !== 0 && !allowFailure) {
    throw new Error((completed.stderr || "").trim() || `${command} exited with ${completed.status}`);
  }
  return completed;
}

function commandAvailable(command, args = ["--version"]) {
  const completed = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf-8",
    env: { ...process.env, GH_PROMPT_DISABLED: "1" },
    stdio: "ignore",
    timeout: 10_000,
  });
  return completed.status === 0;
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
  const databaseName = packageName.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const backendIdentity = `com.localfirst.${packageName.replace(/[-_]/g, ".")}.backend`;

  const rootPackagePath = path.join(repoRoot, "package.json");
  const rootPackage = readJson(rootPackagePath);
  rootPackage.name = packageName;
  rootPackage.desktopName = packageName;
  rootPackage.build = {
    ...(rootPackage.build || {}),
    appId: `com.localfirst.${packageName.replace(/[-_]/g, ".")}`,
    productName: displayName,
  };
  writeJson(rootPackagePath, rootPackage);
  changed.push("Electron package identity");

  const frontendPackagePath = path.join(repoRoot, "frontend", "package.json");
  const frontendPackage = readJson(frontendPackagePath);
  frontendPackage.name = `${packageName}-frontend`;
  writeJson(frontendPackagePath, frontendPackage);
  changed.push("root/frontend package names");
  for (const [relativePath, lockName] of [
    ["package-lock.json", packageName],
    ["frontend/package-lock.json", `${packageName}-frontend`],
  ]) {
    const targetPath = path.join(repoRoot, relativePath);
    if (!fileExists(targetPath)) {
      continue;
    }
    const lock = readJson(targetPath);
    lock.name = lockName;
    if (lock.packages?.[""]) {
      lock.packages[""].name = lockName;
    }
    if (relativePath === "package-lock.json" && lock.packages?.frontend) {
      lock.packages.frontend.name = `${packageName}-frontend`;
    }
    writeJson(targetPath, lock);
    changed.push(`${relativePath} name`);
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

  for (const relativePath of [".env.example", "backend/.env.example"]) {
    const targetPath = path.join(repoRoot, relativePath);
    if (!fileExists(targetPath)) {
      continue;
    }
    const lines = readEnvFile(targetPath);
    const appName = relativePath.startsWith("backend/") ? `${displayName} Backend` : displayName;
    let fileChanged = upsertEnv(lines, "APP_NAME", appName, { overwrite: true });
    fileChanged = upsertEnv(
      lines,
      "DATABASE_URL",
      `sqlite:///./data/${databaseName}.sqlite3`,
      { overwrite: true },
    ) || fileChanged;
    if (fileChanged) {
      writeText(targetPath, `${lines.join("\n").replace(/\n+$/g, "")}\n`);
      changed.push(`${relativePath} identity`);
    }
  }

  const backendPyprojectPath = path.join(repoRoot, "backend", "pyproject.toml");
  if (fileExists(backendPyprojectPath)) {
    let content = fs.readFileSync(backendPyprojectPath, "utf-8");
    content = content
      .replace(/^name = "apptemplatebase-backend"$/m, `name = "${packageName}-backend"`)
      .replace(/^description = ".*AppTemplateBase"$/m, `description = "Local FastAPI backend for ${displayName}"`);
    writeText(backendPyprojectPath, content);
    changed.push("backend package identity");
  }

  const runtimePathsPath = path.join(repoRoot, "backend", "app", "core", "runtime_paths.py");
  if (fileExists(runtimePathsPath)) {
    const content = fs.readFileSync(runtimePathsPath, "utf-8");
    const nextContent = content.replace(/^APP_DIRECTORY_NAME = ".*"$/m, `APP_DIRECTORY_NAME = "${displayName}"`);
    if (nextContent !== content) {
      writeText(runtimePathsPath, nextContent);
      changed.push("backend runtime identity");
    }
  }

  const backendConfigPath = path.join(repoRoot, "backend", "app", "core", "config.py");
  if (fileExists(backendConfigPath)) {
    const content = fs.readFileSync(backendConfigPath, "utf-8");
    const nextContent = content
      .replace(/^(\s*)app_name: str = ".*"$/m, `$1app_name: str = "${displayName}"`)
      .replace(
        /^(\s*)self\.database_url = f"sqlite:\/\/\/.*"$/m,
        `$1self.database_url = f"sqlite:///{self.app_data_dir / 'database' / '${databaseName}.sqlite3'}"`,
      );
    if (nextContent !== content) {
      writeText(backendConfigPath, nextContent);
      changed.push("backend fallback identity");
    }
  }

  const healthPath = path.join(repoRoot, "backend", "app", "api", "routes", "health.py");
  if (fileExists(healthPath)) {
    const content = fs.readFileSync(healthPath, "utf-8");
    const version = String(rootPackage.version || "0.1.0");
    const nextContent = content
      .replace(/^(\s*)app_name=".*",$/gm, `$1app_name="${displayName}",`)
      .replace(/^(\s*)backend_version=".*",$/gm, `$1backend_version="${version}",`)
      .replace(/^(\s*)identity=".*",$/gm, `$1identity="${backendIdentity}",`)
      .replace(
        /^(\s*)return \{"app_name": ".*", "identity": ".*", "backend_version": ".*"\}$/gm,
        `$1return {"app_name": "${displayName}", "identity": "${backendIdentity}", "backend_version": "${version}"}`,
      );
    if (nextContent !== content) {
      writeText(healthPath, nextContent);
      changed.push("backend health identity");
    }
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

function ensureCsvEnvIncludes(lines, key, requiredValues, fallbackValues = requiredValues) {
  const matcher = new RegExp(`^${key}=`);
  const index = lines.findIndex((line) => matcher.test(line));
  if (index === -1) {
    lines.push(`${key}=${fallbackValues.join(",")}`);
    return true;
  }

  const currentValue = lines[index].slice(key.length + 1);
  const values = currentValue
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const normalizedValues = new Set(values.map((item) => item.toLowerCase()));
  const missingValues = requiredValues.filter((item) => !normalizedValues.has(item.toLowerCase()));

  if (missingValues.length === 0) {
    return false;
  }

  lines[index] = `${key}=${[...values, ...missingValues].join(",")}`;
  return true;
}

function chooseWhisperModel() {
  return whisperModelCandidates.find((candidate) => fileExists(candidate)) || "";
}

function chooseWhisperBinary() {
  return whisperBinaryCandidates.find((candidate) => fileExists(candidate)) || whisperBinaryCandidates[0];
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

  const whisperBinaryPath = chooseWhisperBinary();
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

  if (ensureCsvEnvIncludes(
    lines,
    "ALLOWED_AUDIO_EXTENSIONS",
    ["webm"],
    ["wav", "mp3", "ogg", "flac", "m4a", "webm"],
  )) {
    changed = true;
    log("Ensured WebM recordings are allowed for STT uploads.");
  }
  if (ensureCsvEnvIncludes(
    lines,
    "ALLOWED_AUDIO_MIME_TYPES",
    ["audio/webm"],
    [
      "audio/wav",
      "audio/x-wav",
      "audio/mpeg",
      "audio/mp3",
      "audio/ogg",
      "audio/flac",
      "audio/x-flac",
      "audio/mp4",
      "audio/m4a",
      "audio/webm",
    ],
  )) {
    changed = true;
    log("Ensured audio/webm recordings are allowed for STT uploads.");
  }

  if (changed) {
    writeText(envPath, `${lines.join("\n").replace(/\n+$/g, "")}\n`);
  }
}

function gitOutput(args, { allowFailure = false } = {}) {
  return run("git", args, { allowFailure }).stdout.trim();
}

function remoteUrl(name) {
  return gitOutput(["remote", "get-url", name], { allowFailure: true });
}

function ensureTemplateUpstream() {
  const origin = remoteUrl("origin");
  const upstream = remoteUrl("upstream");
  if (upstream) {
    if (origin && templateRepositoryPattern.test(origin)) {
      log("Removing duplicate template origin; AppTemplateBase is already preserved as upstream.");
      run("git", ["remote", "remove", "origin"]);
      return "";
    }
    return origin;
  }
  if (!origin || !templateRepositoryPattern.test(origin)) {
    return origin;
  }
  log("Preserving AppTemplateBase as the upstream remote.");
  run("git", ["remote", "rename", "origin", "upstream"]);
  return "";
}

function githubOwner() {
  if (process.env.APP_REPOSITORY_OWNER) {
    return process.env.APP_REPOSITORY_OWNER.trim();
  }
  return run("gh", ["api", "user", "--jq", ".login"]).stdout.trim();
}

function githubRepositoryExists(fullName) {
  return run("gh", ["repo", "view", fullName, "--json", "url"], { allowFailure: true }).status === 0;
}

function updatePackageRepository(repositoryUrl) {
  const packagePath = path.join(repoRoot, "package.json");
  const packageData = readJson(packagePath);
  const nextRepository = { type: "git", url: repositoryUrl };
  if (JSON.stringify(packageData.repository) === JSON.stringify(nextRepository)) {
    return false;
  }
  packageData.repository = nextRepository;
  writeJson(packagePath, packageData);
  return true;
}

function configureAppRepository({ displayName, packageName }) {
  const folderIsTemplate = packageStillTemplate(toNpmPackageName(currentFolderName()));
  if (skipRepository || packageStillTemplate(packageName) || folderIsTemplate) {
    if (skipRepository) {
      log("Skipping app repository setup by request.");
    }
    return { configured: false, skipped: true };
  }
  if (!fileExists(path.join(repoRoot, ".git"))) {
    warn("This clone is not a Git repository; skipping GitHub repository setup.");
    return { configured: false };
  }
  if (!commandAvailable("gh")) {
    warn("GitHub CLI is not installed; repository setup will retry next time.");
    return { configured: false };
  }
  if (run("gh", ["auth", "status"], { allowFailure: true }).status !== 0) {
    warn("GitHub CLI is not authenticated; run `gh auth login`. Repository setup will retry next time.");
    return { configured: false };
  }

  let origin = ensureTemplateUpstream();
  let repositoryUrl;
  if (origin && !templateRepositoryPattern.test(origin)) {
    repositoryUrl = origin;
    updatePackageRepository(origin);
    log(`App repository is already configured as origin: ${origin}`);
  } else {
    const owner = githubOwner();
    const repositoryName = (process.env.APP_REPOSITORY_NAME || currentFolderName()).trim();
    const visibility = (process.env.APP_REPOSITORY_VISIBILITY || "private").trim().toLowerCase();
    if (!["private", "public", "internal"].includes(visibility)) {
      throw new Error(`APP_REPOSITORY_VISIBILITY must be private, public, or internal; received '${visibility}'.`);
    }
    const fullName = `${owner}/${repositoryName}`;
    repositoryUrl = `https://github.com/${fullName}.git`;

    if (githubRepositoryExists(fullName)) {
      log(`Using existing GitHub repository: ${fullName}`);
      run("git", ["remote", "add", "origin", repositoryUrl]);
    } else {
      log(`Creating ${visibility} GitHub repository: ${fullName}`);
      run("gh", ["repo", "create", fullName, `--${visibility}`, "--source", ".", "--remote", "origin"]);
    }
  }

  updatePackageRepository(repositoryUrl);
  run("git", ["add", "--", ...identityFiles.filter((relativePath) => fileExists(path.join(repoRoot, relativePath)))]);
  const staged = gitOutput(["diff", "--cached", "--name-only"]);
  if (staged) {
    run("git", ["commit", "-m", `Adopt AppTemplateBase as ${displayName}`]);
  }
  const branch = gitOutput(["branch", "--show-current"]) || "main";
  run("git", ["push", "--set-upstream", "origin", branch]);
  log(`App repository ready: ${repositoryUrl}`);
  return { configured: true, repositoryUrl };
}

function safelyConfigureAppRepository(identity) {
  try {
    return configureAppRepository(identity);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    warn(`App repository setup is incomplete: ${message}`);
    warn("The app will continue and repository setup will retry on the next start.");
    return { configured: false, error: message };
  }
}

function writeState({ displayName, packageName, identityChanges, repository }) {
  const state = {
    initializedAt: new Date().toISOString(),
    folderName: currentFolderName(),
    displayName,
    packageName,
    identityChanges,
    repository,
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

  if (repositoryOnly) {
    const packageData = readJson(path.join(repoRoot, "package.json"));
    const packageName = String(packageData.name || "");
    const displayName = String(packageData.build?.productName || packageName);
    safelyConfigureAppRepository({ displayName, packageName });
    return;
  }

  let identityChanges = [];
  const rootPackage = readJson(path.join(repoRoot, "package.json"));
  const currentPackageName = String(rootPackage.name || "").toLowerCase();
  const packageRepository = typeof rootPackage.repository === "string"
    ? rootPackage.repository
    : String(rootPackage.repository?.url || "");
  const sourceStillTemplate = packageStillTemplate(currentPackageName) || templateRepositoryPattern.test(packageRepository);
  const shouldRunIdentity = force || !stateExists;

  if (!shouldRunIdentity) {
    log("Template initialization already complete. Skipping identity setup.");
  } else if (sourceStillTemplate && !packageStillTemplate(packageName)) {
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
    writeState({
      displayName: folderName,
      packageName,
      identityChanges,
      repository: { configured: false, pendingAppIdentity: true },
    });
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
