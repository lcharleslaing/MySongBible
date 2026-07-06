import { useEffect, useState } from "react";

import { ApiError } from "../api/client";
import { cloneApp, getAppCloneDefaults, getAppCloneStatus, AppCloneStatus } from "../api/appCloner";
import { PageHeader } from "../components/ui/PageHeader";

function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    const detail = error.details as { detail?: string | { message?: string } } | null | undefined;
    if (typeof detail?.detail === "string") {
      return detail.detail;
    }
    if (typeof detail?.detail === "object" && detail.detail?.message) {
      return detail.detail.message;
    }
    return error.message || fallback;
  }

  return error instanceof Error ? error.message : fallback;
}

function statusBadgeClass(status: string) {
  switch (status) {
    case "started":
    case "cloned":
      return "badge-success";
    case "running":
      return "badge-info";
    case "failed":
      return "badge-error";
    default:
      return "badge-neutral";
  }
}

function deriveDirectoryName(repoUrl: string) {
  const cleaned = repoUrl.trim().replace(/\/$/, "");
  const lastPart = cleaned.split("/").pop() || "";
  return lastPart.replace(/\.git$/, "").replace(/[^A-Za-z0-9._-]/g, "-");
}

export function AppClonerPage() {
  const [repoUrl, setRepoUrl] = useState("");
  const [destinationParent, setDestinationParent] = useState("");
  const [directoryName, setDirectoryName] = useState("");
  const [runNpmStart, setRunNpmStart] = useState(true);
  const [status, setStatus] = useState<AppCloneStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    loadInitialState();
  }, []);

  useEffect(() => {
    if (!status?.running) {
      return;
    }

    const timer = window.setInterval(() => {
      refreshStatus();
    }, 1500);

    return () => window.clearInterval(timer);
  }, [status?.running]);

  async function loadInitialState() {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const [defaults, nextStatus] = await Promise.all([getAppCloneDefaults(), getAppCloneStatus()]);
      if (defaults.repo_url) {
        setRepoUrl(defaults.repo_url);
        setDirectoryName(deriveDirectoryName(defaults.repo_url));
      }
      setStatus(nextStatus);
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Could not load clone settings."));
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshStatus() {
    try {
      setStatus(await getAppCloneStatus());
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Could not refresh clone status."));
    }
  }

  async function chooseLocation() {
    if (!window.desktop?.pickCloneDirectory) {
      setErrorMessage("Folder picker is only available in the desktop app.");
      return;
    }

    const result = await window.desktop.pickCloneDirectory();
    if (!result.canceled && result.path) {
      setDestinationParent(result.path);
      setErrorMessage("");
    }
  }

  async function handleClone() {
    if (!repoUrl.trim() || !destinationParent.trim()) {
      setErrorMessage("Repository URL and clone location are required.");
      return;
    }

    setIsStarting(true);
    setErrorMessage("");
    setMessage("");

    try {
      const nextStatus = await cloneApp({
        repo_url: repoUrl.trim(),
        destination_parent: destinationParent.trim(),
        directory_name: directoryName.trim() || null,
        run_npm_start: runNpmStart,
      });
      setStatus(nextStatus);
      setMessage("Clone started.");
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Could not start clone."));
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Project Tools"
        title="Clone App"
        description="Clone a GitHub repository to a local folder and launch it with npm start."
      />

      {errorMessage ? (
        <div className="alert alert-error">
          <span>{errorMessage}</span>
        </div>
      ) : null}
      {message ? (
        <div className="alert alert-success">
          <span>{message}</span>
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="card-title text-xl">Clone repository</h2>
                <p className="text-sm text-base-content/60">The clone runs locally with Git, then launches npm start.</p>
              </div>
              {isLoading ? <span className="loading loading-spinner loading-sm" /> : null}
            </div>

            <label className="form-control">
              <span className="label-text">GitHub repo URL</span>
              <input
                className="input input-bordered"
                value={repoUrl}
                onChange={(event) => {
                  const value = event.target.value;
                  setRepoUrl(value);
                  if (!directoryName.trim()) {
                    setDirectoryName(deriveDirectoryName(value));
                  }
                }}
                placeholder="https://github.com/owner/repo.git"
              />
            </label>

            <label className="form-control">
              <span className="label-text">Clone location</span>
              <div className="join w-full">
                <input
                  className="input input-bordered join-item w-full"
                  value={destinationParent}
                  onChange={(event) => setDestinationParent(event.target.value)}
                  placeholder="/home/user/Programming"
                />
                <button type="button" className="btn join-item" onClick={chooseLocation}>
                  Browse
                </button>
              </div>
            </label>

            <label className="form-control">
              <span className="label-text">Folder name</span>
              <input
                className="input input-bordered"
                value={directoryName}
                onChange={(event) => setDirectoryName(event.target.value)}
                placeholder="AppTemplateBase"
              />
            </label>

            <label className="label cursor-pointer justify-start gap-3">
              <input
                type="checkbox"
                className="checkbox checkbox-primary"
                checked={runNpmStart}
                onChange={(event) => setRunNpmStart(event.target.checked)}
              />
              <span className="label-text">Run npm start after clone</span>
            </label>

            <div className="alert alert-warning text-sm">
              <span>
                The cloned app may use the same default ports as this app. If npm start fails, check the log and stop the
                conflicting process or adjust ports in the clone.
              </span>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              disabled={isStarting || Boolean(status?.running)}
              onClick={handleClone}
            >
              {isStarting || status?.running ? "Cloning..." : "Clone"}
            </button>
          </div>
        </div>

        <div className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="card-title text-xl">Clone status</h2>
                <p className="text-sm text-base-content/60">{status?.message || "No clone has been started."}</p>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={refreshStatus}>
                Refresh
              </button>
            </div>

            {status ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <span className={`badge ${statusBadgeClass(status.status)}`}>{status.status}</span>
                  {status.running ? <span className="badge badge-info">running</span> : null}
                  {status.npm_start_pid ? <span className="badge badge-outline">PID {status.npm_start_pid}</span> : null}
                </div>

                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <span>Repo: {status.repo_url || "n/a"}</span>
                  <span>Git exit: {status.git_exit_code ?? "n/a"}</span>
                  <span>Frontend port: {status.frontend_port ?? "n/a"}</span>
                  <span>Backend port: {status.backend_port ?? "n/a"}</span>
                  <span className="md:col-span-2">Clone path: {status.clone_path || "n/a"}</span>
                  <span className="md:col-span-2">App data: {status.app_data_dir || "n/a"}</span>
                  <span className="md:col-span-2">Electron data: {status.user_data_dir || "n/a"}</span>
                  <span className="md:col-span-2">Log: {status.log_path}</span>
                </div>

                <div className="mockup-code max-h-96 overflow-y-auto text-xs">
                  {status.last_lines.length ? (
                    status.last_lines.map((line, index) => (
                      <pre key={`${line}-${index}`} data-prefix=">">
                        <code>{line || " "}</code>
                      </pre>
                    ))
                  ) : (
                    <pre data-prefix=">">
                      <code>No log output yet.</code>
                    </pre>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-base-300 p-4 text-sm text-base-content/60">
                Status unavailable.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
