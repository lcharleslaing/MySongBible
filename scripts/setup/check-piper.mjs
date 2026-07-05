#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const child = spawn("python3", ["-m", "tools.local_ai_setup", "tts:check"], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: false,
});

child.on("error", (error) => {
  console.error(`FAIL: Could not launch local AI TTS check: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
