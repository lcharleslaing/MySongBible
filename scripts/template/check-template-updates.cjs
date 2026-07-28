const { spawnSync } = require("node:child_process");

const repoRoot = process.cwd();
const noFetch = process.argv.includes("--no-fetch");

function log(message) {
  process.stdout.write(`[template:update] ${message}\n`);
}

function warn(message) {
  process.stdout.write(`[template:update] Warning: ${message}\n`);
}

function git(args, { allowFailure = false, timeout = 30_000 } = {}) {
  const completed = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf-8",
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
  });
  if ((completed.error || completed.status !== 0) && !allowFailure) {
    throw completed.error || new Error((completed.stderr || "").trim() || `git ${args.join(" ")} failed`);
  }
  return completed;
}

function gitOutput(args, options) {
  return (git(args, options).stdout || "").trim();
}

function upstreamBranch() {
  const symbolic = gitOutput(
    ["symbolic-ref", "--quiet", "--short", "refs/remotes/upstream/HEAD"],
    { allowFailure: true },
  );
  if (symbolic) {
    return symbolic;
  }
  const branches = gitOutput(
    ["for-each-ref", "--format=%(refname:short)", "refs/remotes/upstream"],
    { allowFailure: true },
  ).split(/\r?\n/).filter(Boolean);
  return branches.find((branch) => branch === "upstream/main")
    || branches.find((branch) => branch === "upstream/master")
    || branches[0]
    || "";
}

function main() {
  if (git(["rev-parse", "--is-inside-work-tree"], { allowFailure: true }).status !== 0) {
    log("Not a Git worktree; skipping AppTemplateBase update check.");
    return;
  }
  const upstreamUrl = gitOutput(["remote", "get-url", "upstream"], { allowFailure: true });
  if (!upstreamUrl) {
    log("No upstream remote is configured yet; skipping AppTemplateBase update check.");
    return;
  }

  if (!noFetch) {
    log(`Checking ${upstreamUrl} for template updates.`);
    const fetched = git(["fetch", "--quiet", "upstream"], { allowFailure: true, timeout: 15_000 });
    if (fetched.status !== 0) {
      warn(`Could not fetch upstream: ${(fetched.stderr || fetched.error?.message || "network unavailable").trim()}`);
      warn("Startup will continue using the last known template state.");
    }
  }

  const branch = upstreamBranch();
  if (!branch) {
    warn("No upstream default branch was found; startup will continue.");
    return;
  }
  const incoming = Number(gitOutput(["rev-list", "--count", `HEAD..${branch}`]) || "0");
  if (incoming === 0) {
    log(`This app is current with ${branch}.`);
    return;
  }

  const summaries = gitOutput(["log", "--oneline", "--max-count=5", `HEAD..${branch}`]);
  log(`${incoming} AppTemplateBase update${incoming === 1 ? " is" : "s are"} available from ${branch}:`);
  if (summaries) {
    process.stdout.write(`${summaries}\n`);
  }
  log(`Review with: git log --oneline HEAD..${branch}`);
  log(`Apply when ready with: git merge ${branch}`);
}

try {
  main();
} catch (error) {
  warn(`${error instanceof Error ? error.message : String(error)}. Startup will continue.`);
}
