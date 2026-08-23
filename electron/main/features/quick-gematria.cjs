"use strict";

const {
  BrowserWindow,
  globalShortcut,
  app,
  ipcMain,
} = require("electron");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const {
  calculateGematria,
} = require("../../../shared/gematria/gematria.cjs");

const DEFAULT_HOTKEY = "CommandOrControl+Alt+G";
const QUICK_WINDOW_LABEL = "quick-gematria";
const MUSIC_WHISPER_BASE_URL = "http://127.0.0.1:8091";
const MIN_AUDIO_BYTES = 512;
const NON_SPEECH_MARKER_PATTERN = /(?:\[(?:blank[_\s-]*audio|silence|music)\]|\((?:blank[_\s-]*audio|silence|music)\))/gi;
const NON_SPEECH_ONLY = new Set([
  "blank_audio",
  "blank audio",
  "silence",
  "music",
]);

let quickWindow = null;
let registeredHotkey = null;
let quickGematriaIpcRegistered = false;

function rendererUrl({ devServerUrl, rendererDistPath }) {
  if (devServerUrl) {
    const url = new URL(devServerUrl);
    url.searchParams.set("quick-gematria", "1");
    return { type: "url", value: url.toString() };
  }

  return {
    type: "file",
    value: path.join(rendererDistPath, "index.html"),
    query: { "quick-gematria": "1" },
  };
}

function createQuickWindow({
  preloadPath,
  iconPath,
  devServerUrl,
  rendererDistPath,
}) {
  if (quickWindow && !quickWindow.isDestroyed()) {
    return quickWindow;
  }

  quickWindow = new BrowserWindow({
    width: 720,
    height: 540,
    minWidth: 640,
    minHeight: 460,
    show: false,
    center: true,
    alwaysOnTop: true,
    resizable: true,
    title: "My Song Bible — Quick Gematria",
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  quickWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      quickWindow.hide();
    }
  });

  quickWindow.on("closed", () => {
    quickWindow = null;
  });

  const target = rendererUrl({ devServerUrl, rendererDistPath });

  if (target.type === "url") {
    void quickWindow.loadURL(target.value);
  } else {
    void quickWindow.loadFile(target.value, { query: target.query });
  }

  return quickWindow;
}

function showQuickGematria(options) {
  const window = createQuickWindow(options);

  if (window.isMinimized()) {
    window.restore();
  }

  window.show();
  window.focus();
  window.setAlwaysOnTop(true);

  if (window.webContents.isLoading()) {
    window.webContents.once("did-finish-load", () => {
      if (!window.isDestroyed()) {
        window.webContents.send("quick-gematria:opened");
      }
    });
  } else {
    window.webContents.send("quick-gematria:opened");
  }
}

function hideQuickGematria() {
  if (quickWindow && !quickWindow.isDestroyed()) {
    quickWindow.hide();
  }
}

function registerQuickGematriaHotkey(options, accelerator = DEFAULT_HOTKEY) {
  if (registeredHotkey) {
    globalShortcut.unregister(registeredHotkey);
  }

  const ok = globalShortcut.register(accelerator, () => {
    showQuickGematria(options);
  });

  if (!ok) {
    throw new Error(
      `Could not register Quick Gematria global hotkey: ${accelerator}`,
    );
  }

  registeredHotkey = accelerator;
  return accelerator;
}

function unregisterQuickGematriaHotkey() {
  if (registeredHotkey) {
    globalShortcut.unregister(registeredHotkey);
    registeredHotkey = null;
  }
}

function runProcess(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `${command} exited with code ${code}\n${stderr || stdout}`,
          ),
        );
      }
    });
  });
}

function extensionForMime(mimeType) {
  const mime = String(mimeType || "").toLowerCase();
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  return "webm";
}

function cleanTranscriptionText(value) {
  let text = String(value || "").replace(NON_SPEECH_MARKER_PATTERN, " ");
  text = text.replace(/\s+/g, " ").trim();
  text = text.replace(/^[\s,.;:!?-]+/, "").replace(/[\s,;:-]+$/, "").trim();

  if (!text) {
    return "";
  }

  if (NON_SPEECH_ONLY.has(normalizeForNonSpeechOnly(text))) {
    return "";
  }

  if (!/[\w]/u.test(text)) {
    return "";
  }

  return text;
}

function normalizeForNonSpeechOnly(value) {
  return String(value || "")
    .replace(/^[\s[(]+|[\s)\]]+$/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractTextFromWhisperResponse(payload) {
  for (const key of ["text", "transcript", "transcription"]) {
    const value = payload?.[key];
    const cleaned = cleanTranscriptionText(value);
    if (cleaned) {
      return cleaned;
    }
  }

  if (Array.isArray(payload?.segments)) {
    const text = payload.segments
      .map((segment) => segment?.text)
      .filter((value) => typeof value === "string" && value.trim())
      .map((value) => cleanTranscriptionText(value))
      .filter(Boolean)
      .join(" ");

    if (text) return cleanTranscriptionText(text);
  }

  return "";
}

function normalizeAudioBuffer(audioBytes) {
  if (Buffer.isBuffer(audioBytes)) {
    return audioBytes;
  }

  if (audioBytes instanceof ArrayBuffer) {
    return Buffer.from(audioBytes);
  }

  if (ArrayBuffer.isView(audioBytes)) {
    return Buffer.from(audioBytes.buffer, audioBytes.byteOffset, audioBytes.byteLength);
  }

  if (Array.isArray(audioBytes)) {
    return Buffer.from(audioBytes);
  }

  return Buffer.alloc(0);
}

async function transcribeWithMusicWhisper({ audioBytes, mimeType }) {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "my-song-bible-gematria-"),
  );

  try {
    const inputPath = path.join(
      tempDir,
      `capture.${extensionForMime(mimeType)}`,
    );
    const wavPath = path.join(tempDir, "capture.wav");

    const buffer = normalizeAudioBuffer(audioBytes);

    if (buffer.length < MIN_AUDIO_BYTES) {
      throw new Error("No usable audio was captured before transcription.");
    }

    await fs.writeFile(inputPath, buffer);

    await runProcess("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-ac",
      "1",
      "-ar",
      "16000",
      wavPath,
    ]);

    const response = await fetch(`${MUSIC_WHISPER_BASE_URL}/transcribe`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        audio_path: wavPath,
        output_dir: tempDir,
      }),
    });

    const bodyText = await response.text();

    if (!response.ok) {
      throw new Error(
        `Music Whisper returned HTTP ${response.status}: ${bodyText}`,
      );
    }

    let payload = {};
    try {
      payload = JSON.parse(bodyText);
    } catch {
      payload = {};
    }

    let text = extractTextFromWhisperResponse(payload);

    if (!text) {
      const files = await fs.readdir(tempDir);
      const txt = files.find((name) => name.toLowerCase().endsWith(".txt"));

      if (txt) {
        text = cleanTranscriptionText(await fs.readFile(path.join(tempDir, txt), "utf8"));
      }
    }

    return { text: cleanTranscriptionText(text) };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function registerQuickGematriaIpc() {
  if (quickGematriaIpcRegistered) {
    return;
  }
  quickGematriaIpcRegistered = true;

  ipcMain.handle("quick-gematria:calculate", (_event, input) => {
    return calculateGematria(String(input ?? ""));
  });

  ipcMain.handle(
    "quick-gematria:transcribe",
    async (_event, payload = {}) => {
      return transcribeWithMusicWhisper({
        audioBytes: payload.audioBytes,
        mimeType: payload.mimeType,
      });
    },
  );

  ipcMain.handle("quick-gematria:hide", () => {
    hideQuickGematria();
    return { ok: true };
  });

  ipcMain.handle("quick-gematria:get-autostart", () => {
    return app.getLoginItemSettings();
  });

  ipcMain.handle("quick-gematria:set-autostart", (_event, payload = {}) => {
    return configureQuickGematriaAutostart({
      enabled: Boolean(payload.enabled),
    });
  });
}

function configureQuickGematriaAutostart({
  enabled = true,
  backgroundArg = "--background",
} = {}) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: enabled ? [backgroundArg] : [],
  });

  return app.getLoginItemSettings();
}

function isBackgroundLaunch(argv = process.argv) {
  return argv.includes("--background");
}

module.exports = {
  DEFAULT_HOTKEY,
  QUICK_WINDOW_LABEL,
  MUSIC_WHISPER_BASE_URL,
  calculateGematria,
  createQuickWindow,
  showQuickGematria,
  hideQuickGematria,
  registerQuickGematriaHotkey,
  unregisterQuickGematriaHotkey,
  registerQuickGematriaIpc,
  configureQuickGematriaAutostart,
  isBackgroundLaunch,
};
