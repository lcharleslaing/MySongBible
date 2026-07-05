const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..", "..");
const releaseDir = path.join(repoRoot, "release");

function findNewestDeb() {
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

const debPath = findNewestDeb();
if (!debPath) {
  console.error("No .deb package found in release/. Run npm run package:linux first.");
  process.exit(1);
}

console.log(`Installing ${debPath}`);
const child = spawn("sudo", ["apt", "install", "-y", debPath], {
  cwd: repoRoot,
  stdio: "inherit",
  shell: false,
});

child.on("error", (error) => {
  console.error(`Could not start sudo apt install: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

