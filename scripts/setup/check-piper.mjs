#!/usr/bin/env node
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");
const backendDir = path.join(repoRoot, "backend");
const envPath = path.join(backendDir, ".env");
const defaultOutputDir = path.join(backendDir, "data", "audio", "tts");
const testText = "This is a local Piper text to speech test.";
const testFileName = "piper-test.wav";

let hasFailure = false;

function pass(message) {
  console.log(`PASS: ${message}`);
}

function warn(message) {
  console.warn(`WARN: ${message}`);
}

function fail(message) {
  hasFailure = true;
  console.error(`FAIL: ${message}`);
}

function parseEnv(content) {
  const values = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function resolveBackendPath(value, fallback = null) {
  const rawValue = value?.trim() || "";
  if (!rawValue) {
    return fallback;
  }

  return path.resolve(backendDir, rawValue);
}

async function pathExists(filePath) {
  if (!filePath) {
    return false;
  }

  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isExecutable(filePath) {
  if (process.platform === "win32") {
    return true;
  }

  try {
    await access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function runPiper({ binaryPath, modelPath, outputPath, timeoutSeconds }) {
  return new Promise((resolve) => {
    const child = spawn(
      binaryPath,
      ["-m", modelPath, "-f", outputPath],
      {
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutSeconds * 1000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({ ok: false, timedOut, error, stdout, stderr });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({ ok: code === 0 && !timedOut, code, timedOut, stdout, stderr });
    });

    child.stdin.end(testText);
  });
}

async function main() {
  console.log(`Checking Piper configuration from ${envPath}`);

  let envContent = "";
  try {
    envContent = await readFile(envPath, "utf8");
    pass("backend/.env found.");
  } catch {
    fail("backend/.env was not found. Run npm start once or copy backend/.env.example to backend/.env.");
    process.exit(1);
  }

  const env = parseEnv(envContent);
  const ttsEngine = (env.TTS_ENGINE || "mock").trim().toLowerCase();
  const piperBinaryRaw = env.PIPER_BINARY?.trim() || "";
  const piperModelRaw = env.PIPER_MODEL_PATH?.trim() || "";
  const outputDir = resolveBackendPath(env.TTS_OUTPUT_DIR, defaultOutputDir);
  const timeoutSeconds = Number.parseInt(env.TTS_TIMEOUT_SECONDS || "120", 10);
  const effectiveTimeout = Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? timeoutSeconds : 120;

  if (ttsEngine === "mock") {
    warn("Piper is not configured as the active engine. Current engine is mock. This is okay for template development.");
  } else if (ttsEngine === "piper") {
    pass("TTS_ENGINE is piper.");
  } else {
    warn(`TTS_ENGINE is ${ttsEngine || "(blank)"}. This helper only verifies Piper-specific settings.`);
  }

  const piperBinary = resolveBackendPath(piperBinaryRaw);
  const piperModelPath = resolveBackendPath(piperModelRaw);
  const piperIsActive = ttsEngine === "piper";

  if (!piperBinaryRaw) {
    const message = "PIPER_BINARY is missing or blank.";
    piperIsActive ? fail(message) : warn(message);
  } else if (!(await pathExists(piperBinary))) {
    const message = `PIPER_BINARY does not exist: ${piperBinary}`;
    piperIsActive ? fail(message) : warn(message);
  } else {
    pass(`Piper binary found: ${piperBinary}`);

    if (await isExecutable(piperBinary)) {
      pass("Piper binary is executable.");
    } else {
      const message = `Piper binary exists but is not executable: ${piperBinary}`;
      piperIsActive ? fail(message) : warn(message);
    }
  }

  if (!piperModelRaw) {
    const message = "PIPER_MODEL_PATH is missing or blank.";
    piperIsActive ? fail(message) : warn(message);
  } else if (!(await pathExists(piperModelPath))) {
    fail(`PIPER_MODEL_PATH does not exist: ${piperModelPath}`);
  } else {
    pass(`Piper model found: ${piperModelPath}`);
  }

  try {
    await mkdir(outputDir, { recursive: true });
    pass(`TTS output directory is ready: ${outputDir}`);
  } catch (error) {
    fail(`Could not create TTS output directory: ${outputDir}`);
    console.error(error instanceof Error ? error.message : String(error));
  }

  const canAttemptSynthesis =
    piperBinary &&
    piperModelPath &&
    (await pathExists(piperBinary)) &&
    (await pathExists(piperModelPath)) &&
    (await isExecutable(piperBinary));

  if (!canAttemptSynthesis) {
    warn("Skipping Piper synthesis check because the binary and model are not both ready.");
  } else {
    const outputPath = path.join(outputDir, testFileName);
    console.log(`Running Piper synthesis test: ${outputPath}`);

    const result = await runPiper({
      binaryPath: piperBinary,
      modelPath: piperModelPath,
      outputPath,
      timeoutSeconds: effectiveTimeout,
    });

    if (!result.ok) {
      fail(result.timedOut
        ? `Piper synthesis timed out after ${effectiveTimeout} seconds.`
        : `Piper synthesis failed with exit code ${result.code ?? "unknown"}.`);
      if (result.stderr?.trim()) {
        console.error(result.stderr.trim());
      }
    } else if (await pathExists(outputPath)) {
      pass(`Test synthesis created ${testFileName}.`);
    } else {
      fail(`Piper exited successfully but did not create ${testFileName}.`);
    }
  }

  if (hasFailure) {
    process.exit(1);
  }
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
