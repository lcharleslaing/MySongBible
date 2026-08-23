const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? "npm.cmd" : "npm";
const frontendHost = "127.0.0.1";

function log(message) {
  process.stdout.write(`[app:dev] ${message}\n`);
}

function displayFromSocketName(fileName) {
  const match = /^X(\d+)$/.exec(fileName);
  return match ? `:${match[1]}` : null;
}

function findOwnedXAuthority(display) {
  const runtimeDir = process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid?.()}`;
  if (!runtimeDir || !fs.existsSync(runtimeDir)) {
    return null;
  }

  const candidates = fs.readdirSync(runtimeDir)
    .filter((fileName) => fileName.startsWith(".mutter-Xwaylandauth."))
    .map((fileName) => path.join(runtimeDir, fileName))
    .filter((candidate) => {
      try {
        return fs.statSync(candidate).uid === process.getuid?.();
      } catch {
        return false;
      }
    });

  if (candidates.length === 1) {
    return candidates[0];
  }

  if (display && candidates.length > 0) {
    return candidates.sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)[0];
  }

  return null;
}

function detectDisplayEnv() {
  if (process.platform !== "linux") {
    return {};
  }

  const existingDisplay = process.env.DISPLAY;
  const socketDir = "/tmp/.X11-unix";
  if (!fs.existsSync(socketDir)) {
    return {};
  }

  const uid = process.getuid?.();
  const displays = fs.readdirSync(socketDir)
    .map((fileName) => {
      const display = displayFromSocketName(fileName);
      if (!display) {
        return null;
      }

      const socketPath = path.join(socketDir, fileName);
      try {
        const stats = fs.statSync(socketPath);
        return { display, socketPath, owned: uid === undefined || stats.uid === uid, mtimeMs: stats.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((left, right) => Number(right.owned) - Number(left.owned) || right.mtimeMs - left.mtimeMs);

  const existingSocket = existingDisplay
    ? displays.find((candidate) => candidate.display === existingDisplay)
    : null;
  const selected = existingSocket?.owned ? existingSocket : displays.find((candidate) => candidate.owned) || existingSocket;

  if (!selected) {
    return {};
  }

  const xAuthority = process.env.XAUTHORITY || findOwnedXAuthority(selected.display);
  const detected = { DISPLAY: selected.display };
  if (xAuthority) {
    detected.XAUTHORITY = xAuthority;
  }

  if (selected.display !== existingDisplay) {
    log(`Using detected desktop display ${selected.display}${xAuthority ? ` with ${xAuthority}` : ""}.`);
  }

  return detected;
}

function parsePort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}

function parseRange(prefix, defaultMin, defaultMax) {
  const min = parsePort(process.env[`${prefix}_MIN`], defaultMin);
  const max = parsePort(process.env[`${prefix}_MAX`], defaultMax);
  return min <= max ? { min, max } : { min: defaultMin, max: defaultMax };
}

function shuffle(values) {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function canBindPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, frontendHost);
  });
}

async function choosePort({ explicitPort, range, exclude = new Set() }) {
  if (explicitPort) {
    if (exclude.has(explicitPort)) {
      throw new Error(`Configured port ${explicitPort} conflicts with another dev service port.`);
    }
    if (await canBindPort(explicitPort)) {
      return explicitPort;
    }
    throw new Error(`Configured port ${explicitPort} is already in use.`);
  }

  const candidates = [];
  for (let port = range.min; port <= range.max; port += 1) {
    if (!exclude.has(port) && port !== explicitPort) {
      candidates.push(port);
    }
  }

  for (const port of shuffle(candidates)) {
    if (await canBindPort(port)) {
      return port;
    }
  }

  throw new Error(`No open port found in ${range.min}-${range.max}.`);
}

function prefixOutput(stream, prefix, write) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      write(`${prefix} ${line}\n`);
    }
  });
  stream.on("end", () => {
    if (buffer) {
      write(`${prefix} ${buffer}\n`);
      buffer = "";
    }
  });
}

function spawnManaged(command, args, options) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });

  prefixOutput(child.stdout, options.prefix, (message) => process.stdout.write(message));
  prefixOutput(child.stderr, options.prefix, (message) => process.stderr.write(message));
  return child;
}

function waitForTcp(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host: frontendHost, port });
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) {
          reject(new Error(`Timed out waiting for ${frontendHost}:${port}.`));
          return;
        }
        setTimeout(tryConnect, 250);
      });
    };

    tryConnect();
  });
}

function stopChild(child) {
  if (!child || child.killed || child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
}

async function main() {
  const frontendRange = parseRange("APP_TEMPLATE_FRONTEND_PORT", 5173, 5273);
  const backendRange = parseRange("APP_TEMPLATE_BACKEND_PORT", 8000, 8100);
  const explicitFrontendPort = parsePort(process.env.VITE_DEV_SERVER_PORT || process.env.PORT, null);
  const explicitBackendPort = parsePort(process.env.ELECTRON_BACKEND_PORT || process.env.BACKEND_PORT, null);
  const backendPort = await choosePort({ explicitPort: explicitBackendPort, range: backendRange });
  const frontendPort = await choosePort({
    explicitPort: explicitFrontendPort,
    range: frontendRange,
    exclude: new Set([backendPort]),
  });
  const backendUrl = `http://${frontendHost}:${backendPort}`;
  const rendererUrl = `http://${frontendHost}:${frontendPort}`;
  const existingCors = process.env.CORS_ORIGINS || process.env.BACKEND_CORS_ORIGINS;
  const corsOrigins = existingCors
    ? Array.from(new Set([...existingCors.split(",").map((value) => value.trim()).filter(Boolean), rendererUrl])).join(",")
    : `${rendererUrl},file://,null`;
  const env = {
    ...process.env,
    ...detectDisplayEnv(),
    PORT: String(frontendPort),
    VITE_DEV_SERVER_PORT: String(frontendPort),
    VITE_API_BASE_URL: backendUrl,
    ELECTRON_RENDERER_URL: rendererUrl,
    ELECTRON_BACKEND_PORT: String(backendPort),
    BACKEND_PORT: String(backendPort),
    ELECTRON_BACKEND_BASE_URL: backendUrl,
    ELECTRON_BACKEND_HEALTH_URL: `${backendUrl}/api/health`,
    CORS_ORIGINS: corsOrigins,
    BACKEND_CORS_ORIGINS: corsOrigins,
  };

  log(`Using renderer ${rendererUrl} and backend ${backendUrl}.`);

  const frontend = spawnManaged(npmCommand, ["run", "frontend:dev"], {
    env,
    cwd: process.cwd(),
    prefix: "[frontend:dev]",
  });

  let electron = null;
  let shuttingDown = false;

  const shutdown = (code = 0) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    stopChild(frontend);
    stopChild(electron);
    setTimeout(() => process.exit(code), 250);
  };

  process.on("SIGINT", () => shutdown(130));
  process.on("SIGTERM", () => shutdown(143));

  frontend.once("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    const exitCode = code ?? (signal ? 1 : 0);
    log(`Frontend exited with ${signal || exitCode}.`);
    shutdown(exitCode);
  });

  await waitForTcp(frontendPort);

  electron = spawnManaged(npmCommand, ["run", "electron:dev"], {
    env,
    cwd: process.cwd(),
    prefix: "[electron:dev]",
  });

  electron.once("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    const exitCode = code ?? (signal ? 1 : 0);
    log(`Electron exited with ${signal || exitCode}.`);
    shutdown(exitCode);
  });
}

main().catch((error) => {
  console.error(`[app:dev] ${error.message}`);
  process.exit(1);
});
