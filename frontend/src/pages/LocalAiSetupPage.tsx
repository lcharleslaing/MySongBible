import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getSettings, type SettingsRecord } from "../api/settings";
import { getVoiceStatus, type VoiceEngineStatusRecord, type VoiceStatusRecord } from "../api/system";
import { PageHeader } from "../components/ui/PageHeader";

type BadgeTone = "success" | "warning" | "error" | "info" | "ghost";

type SetupAction = Extract<LocalAiActionId, "setup-whisper" | "setup-piper" | "setup-local-ai">;
type CheckAction = Extract<LocalAiActionId, "check-stt" | "check-tts" | "check-local-ai">;

const setupActions: Array<{ action: SetupAction; label: string; detail: string }> = [
  {
    action: "setup-whisper",
    label: "Setup Whisper",
    detail: "Builds whisper.cpp and prepares the default Whisper model.",
  },
  {
    action: "setup-piper",
    label: "Setup Piper",
    detail: "Creates the Piper runtime and downloads the default voice model.",
  },
  {
    action: "setup-local-ai",
    label: "Setup All Local AI",
    detail: "Runs Whisper setup, Piper setup, and checks the result.",
  },
];

const checkActions: Array<{ action: CheckAction; label: string; detail: string }> = [
  {
    action: "check-stt",
    label: "Check STT",
    detail: "Validates the configured Whisper binary and model.",
  },
  {
    action: "check-tts",
    label: "Check TTS",
    detail: "Validates Piper configuration and attempts a test synthesis.",
  },
  {
    action: "check-local-ai",
    label: "Check All Local AI",
    detail: "Runs STT, TTS, and backend health checks.",
  },
];

function getDesktopLocalAi() {
  return typeof window !== "undefined" ? window.desktop?.localAi : undefined;
}

function badgeClass(tone: BadgeTone) {
  const tones: Record<BadgeTone, string> = {
    success: "badge-success",
    warning: "badge-warning",
    error: "badge-error",
    info: "badge-info",
    ghost: "badge-ghost",
  };

  return `badge ${tones[tone]}`;
}

function pathValue(value: string | null | undefined) {
  return value && value.trim() ? value : "Not configured";
}

function deriveLocalAiHome(settings: SettingsRecord | null, voiceStatus: VoiceStatusRecord | null) {
  const paths = [
    settings?.whisper_cpp_binary,
    settings?.whisper_model_path,
    settings?.piper_binary,
    settings?.piper_model_path,
    voiceStatus?.whisper_cpp_binary,
    voiceStatus?.whisper_model_path,
    voiceStatus?.piper_binary,
    voiceStatus?.piper_model_path,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of paths) {
    const marker = "/local-ai/";
    const markerIndex = candidate.indexOf(marker);
    if (markerIndex >= 0) {
      return candidate.slice(0, markerIndex + marker.length - 1);
    }
  }

  return "Not reported";
}

function findEngine(voiceStatus: VoiceStatusRecord | null, engineId: string): VoiceEngineStatusRecord | null {
  return voiceStatus?.engines.find((engine) => engine.id === engineId) || null;
}

function getSttReadiness(voiceStatus: VoiceStatusRecord | null) {
  if (!voiceStatus) {
    return { label: "missing", tone: "ghost" as const };
  }

  if (voiceStatus.stt_ready) {
    return { label: "ready", tone: "success" as const };
  }

  const hasConfiguredPath = Boolean(voiceStatus.whisper_cpp_binary || voiceStatus.whisper_model_path);
  if (hasConfiguredPath) {
    return { label: "partial", tone: "warning" as const };
  }
  return { label: "missing", tone: "error" as const };
}

function getTtsReadiness(voiceStatus: VoiceStatusRecord | null) {
  if (!voiceStatus) {
    return { label: "missing", tone: "ghost" as const };
  }

  const piper = findEngine(voiceStatus, "piper");
  if (voiceStatus.tts_ready || piper?.available) {
    return { label: "ready", tone: "success" as const };
  }
  if (piper?.configured || voiceStatus.piper_binary || voiceStatus.piper_model_path || voiceStatus.tts_engine === "piper") {
    return { label: "partial", tone: "warning" as const };
  }
  return { label: "missing", tone: "error" as const };
}

function getJobTone(status: LocalAiJobStatus): BadgeTone {
  if (status === "succeeded") {
    return "success";
  }
  if (status === "running") {
    return "info";
  }
  if (status === "failed" || status === "timed_out") {
    return "error";
  }
  return "ghost";
}

function formatDate(value: string | null) {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString();
}

function StatRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-base-content/60">{label}</p>
      <p className="mt-2 break-all text-sm text-base-content/80">{value ?? "Not available"}</p>
    </div>
  );
}

function getCompletionMessage(action: LocalAiActionId, fallback: string) {
  if (action === "setup-local-ai") {
    return "Setup All Local AI completed successfully. Whisper/Piper status has been refreshed.";
  }
  if (action === "check-local-ai") {
    return "Check All Local AI completed successfully. Local AI readiness has been refreshed.";
  }

  return fallback;
}

export function LocalAiSetupPage() {
  const [settings, setSettings] = useState<SettingsRecord | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatusRecord | null>(null);
  const [localAiStatus, setLocalAiStatus] = useState<LocalAiStatusResult | null>(null);
  const [logTail, setLogTail] = useState<string[]>([]);
  const [isLoadingStatus, setIsLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [localAiMessage, setLocalAiMessage] = useState<string | null>(null);
  const [localAiError, setLocalAiError] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState(false);
  const [force, setForce] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const wasRunningRef = useRef(false);

  const desktopLocalAi = getDesktopLocalAi();
  const isElectronLocalAiAvailable = Boolean(desktopLocalAi);
  const isRunning = Boolean(localAiStatus?.running);
  const sttReadiness = getSttReadiness(voiceStatus);
  const ttsReadiness = getTtsReadiness(voiceStatus);
  const piperStatus = findEngine(voiceStatus, "piper");

  const localAiHome = useMemo(
    () => deriveLocalAiHome(settings, voiceStatus),
    [settings, voiceStatus],
  );

  const refreshBackendStatus = useCallback(async () => {
    setStatusError(null);
    try {
      const [nextSettings, nextVoiceStatus] = await Promise.all([
        getSettings(),
        getVoiceStatus(),
      ]);
      setSettings(nextSettings);
      setVoiceStatus(nextVoiceStatus);
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : "Could not load Local AI status.");
    }
  }, []);

  const refreshLocalAiStatus = useCallback(async () => {
    const localAi = getDesktopLocalAi();
    if (!localAi) {
      return;
    }

    const [nextStatus, nextLogTail] = await Promise.all([
      localAi.getStatus(),
      localAi.getLogTail(),
    ]);
    setLocalAiStatus(nextStatus);
    setLogTail(nextLogTail.lastLines);
  }, []);

  const refreshAll = useCallback(async () => {
    setIsLoadingStatus(true);
    try {
      await Promise.all([
        refreshBackendStatus(),
        refreshLocalAiStatus(),
      ]);
    } finally {
      setIsLoadingStatus(false);
    }
  }, [refreshBackendStatus, refreshLocalAiStatus]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!isRunning) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void refreshLocalAiStatus();
    }, 1500);

    return () => window.clearInterval(interval);
  }, [isRunning, refreshLocalAiStatus]);

  useEffect(() => {
    if (wasRunningRef.current && !isRunning) {
      if (localAiStatus?.status === "succeeded" && localAiStatus.action) {
        setLocalAiMessage(getCompletionMessage(localAiStatus.action, localAiStatus.message));
      }
      void refreshAll();
    }
    wasRunningRef.current = isRunning;
  }, [isRunning, localAiStatus, refreshAll]);

  const runSetupAction = async (action: SetupAction) => {
    const localAi = getDesktopLocalAi();
    if (!localAi) {
      setLocalAiError("Local AI setup actions are available only in the Electron desktop app.");
      return;
    }

    const confirmed = window.confirm(
      "Local AI setup may clone, build, and download tools/models into ~/local-ai. It does not run sudo. Continue?",
    );
    if (!confirmed) {
      return;
    }

    setLocalAiError(null);
    setLocalAiMessage(null);
    const result = await localAi.runAction({
      action,
      dryRun,
      force,
    });
    setLocalAiStatus(result);
    setLogTail(result.lastLines);
    if (result.ok) {
      setLocalAiMessage(getCompletionMessage(action, result.message));
    } else {
      setLocalAiError(result.message);
    }
  };

  const runCheckAction = async (action: CheckAction) => {
    const localAi = getDesktopLocalAi();
    if (!localAi) {
      setLocalAiError("Local AI setup actions are available only in the Electron desktop app.");
      return;
    }

    setLocalAiError(null);
    setLocalAiMessage(null);
    const result = await localAi.runAction({ action, dryRun });
    setLocalAiStatus(result);
    setLogTail(result.lastLines);
    if (result.ok) {
      setLocalAiMessage(getCompletionMessage(action, result.message));
    } else {
      setLocalAiError(result.message);
    }
  };

  const refreshLogs = async () => {
    const localAi = getDesktopLocalAi();
    if (!localAi) {
      return;
    }

    const nextLogTail = await localAi.getLogTail();
    setLogTail(nextLogTail.lastLines);
  };

  const openLogsFolder = async () => {
    const localAi = getDesktopLocalAi();
    if (!localAi) {
      setLocalAiError("Logs folder access is available only in the Electron desktop app.");
      return;
    }

    const result = await localAi.openLogsFolder();
    if (result.ok) {
      setLocalAiMessage(`Opened ${result.path}`);
    } else {
      setLocalAiError(result.message || "Could not open logs folder.");
    }
  };

  const copyLogText = async () => {
    const text = logTail.join("\n");
    if (!text) {
      return;
    }

    await navigator.clipboard.writeText(text);
    setCopyMessage("Copied log text.");
    window.setTimeout(() => setCopyMessage(null), 2000);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Local AI"
        title="Local AI Setup"
        description="Prepare local Whisper speech-to-text and Piper text-to-speech from the desktop app without typing setup commands by hand."
      />

      <div className="alert alert-warning">
        <span>
          Setup may clone, build, and download local AI tools/models into <span className="font-mono">~/local-ai</span>. It does not run sudo. This can take several minutes.
        </span>
      </div>

      {!isElectronLocalAiAvailable ? (
        <div className="alert alert-info">
          <span>Local AI setup actions are available only in the Electron desktop app.</span>
        </div>
      ) : null}

      {statusError ? (
        <div className="alert alert-error">
          <span>{statusError}</span>
        </div>
      ) : null}

      <section className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="card-title text-xl">Current Runtime Status</h2>
              <p className="text-sm text-base-content/60">Live backend settings and voice readiness for this machine.</p>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={refreshAll} disabled={isLoadingStatus || isRunning}>
              {isLoadingStatus ? <span className="loading loading-spinner loading-xs" /> : null}
              Refresh
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <StatRow label="LOCAL_AI_HOME" value={localAiHome} />
            <StatRow label="Whisper Binary" value={pathValue(voiceStatus?.whisper_cpp_binary || settings?.whisper_cpp_binary)} />
            <StatRow label="Whisper Model" value={pathValue(voiceStatus?.whisper_model_path || settings?.whisper_model_path)} />
            <StatRow label="Piper Binary" value={pathValue(voiceStatus?.piper_binary || settings?.piper_binary)} />
            <StatRow label="Piper Model" value={pathValue(voiceStatus?.piper_model_path || settings?.piper_model_path)} />
            <StatRow label="TTS Engine" value={voiceStatus?.tts_engine || settings?.tts_engine || "Not reported"} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-box border border-base-300 bg-base-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">STT Readiness</p>
                  <p className="mt-1 text-sm text-base-content/60">{voiceStatus?.stt_message || voiceStatus?.stt_engine || "Whisper status is not available yet."}</p>
                </div>
                <span className={badgeClass(sttReadiness.tone)}>{sttReadiness.label}</span>
              </div>
            </div>

            <div className="rounded-box border border-base-300 bg-base-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">TTS Readiness</p>
                  <p className="mt-1 text-sm text-base-content/60">{voiceStatus?.tts_message || piperStatus?.message || voiceStatus?.message || "Piper status is not available yet."}</p>
                </div>
                <span className={badgeClass(ttsReadiness.tone)}>{ttsReadiness.label}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <div className="card border border-base-300 bg-base-100 shadow-sm">
            <div className="card-body gap-4">
              <h2 className="card-title text-xl">Setup Actions</h2>
              <div className="grid gap-3 md:grid-cols-3">
                {setupActions.map((item) => (
                  <button
                    key={item.action}
                    type="button"
                    className={`btn btn-primary h-auto min-h-24 flex-col items-start justify-center text-left ${isRunning && localAiStatus?.action === item.action ? "loading" : ""}`}
                    disabled={!isElectronLocalAiAvailable || isRunning}
                    onClick={() => void runSetupAction(item.action)}
                  >
                    <span>{item.label}</span>
                    <span className="text-xs font-normal opacity-80">{item.detail}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card border border-base-300 bg-base-100 shadow-sm">
            <div className="card-body gap-4">
              <h2 className="card-title text-xl">Check Actions</h2>
              <div className="grid gap-3 md:grid-cols-3">
                {checkActions.map((item) => (
                  <button
                    key={item.action}
                    type="button"
                    className={`btn btn-secondary h-auto min-h-24 flex-col items-start justify-center text-left ${isRunning && localAiStatus?.action === item.action ? "loading" : ""}`}
                    disabled={!isElectronLocalAiAvailable || isRunning}
                    onClick={() => void runCheckAction(item.action)}
                  >
                    <span>{item.label}</span>
                    <span className="text-xs font-normal opacity-80">{item.detail}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card border border-base-300 bg-base-100 shadow-sm">
            <div className="card-body gap-4">
              <h2 className="card-title text-xl">Logs</h2>
              <div className="mockup-code max-h-96 overflow-y-auto bg-neutral text-neutral-content">
                {logTail.length ? (
                  logTail.map((line, index) => (
                    <pre key={`${line}-${index}`} data-prefix=">"><code>{line}</code></pre>
                  ))
                ) : (
                  <pre data-prefix=">"><code>No Local AI log output yet.</code></pre>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-outline btn-sm" onClick={() => void refreshLogs()} disabled={!isElectronLocalAiAvailable}>
                  Refresh Logs
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => void openLogsFolder()} disabled={!isElectronLocalAiAvailable}>
                  Open Logs Folder
                </button>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => void copyLogText()} disabled={!logTail.length}>
                  Copy Log Text
                </button>
              </div>
              {copyMessage ? <p className="text-sm text-success">{copyMessage}</p> : null}

              <div className="divider my-1" />
              <div className="flex flex-wrap gap-2">
                <Link to="/voice-lab" className="btn btn-outline btn-sm">Open Voice Lab</Link>
                <Link to="/settings" className="btn btn-outline btn-sm">Open Settings</Link>
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="card border border-base-300 bg-base-100 shadow-sm">
            <div className="card-body gap-4">
              <h2 className="card-title text-xl">Options</h2>

              <label className="label cursor-pointer justify-start gap-3 rounded-box bg-base-200 p-4">
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary"
                  checked={dryRun}
                  disabled={isRunning}
                  onChange={(event) => setDryRun(event.target.checked)}
                />
                <span>
                  <span className="font-medium">Dry Run</span>
                  <span className="block text-xs text-base-content/60">Preview setup actions without editing or downloading. Check actions are already read-only.</span>
                </span>
              </label>

              <label className="label cursor-pointer justify-start gap-3 rounded-box bg-base-200 p-4">
                <input
                  type="checkbox"
                  className="checkbox checkbox-warning"
                  checked={force}
                  disabled={isRunning}
                  onChange={(event) => setForce(event.target.checked)}
                />
                <span>
                  <span className="font-medium">Force</span>
                  <span className="block text-xs text-warning">Force may overwrite generated setup values in backend/.env.</span>
                </span>
              </label>
            </div>
          </div>

          <div className="card border border-base-300 bg-base-100 shadow-sm">
            <div className="card-body gap-4">
              <div className="flex items-start justify-between gap-3">
                <h2 className="card-title text-xl">Latest Job</h2>
                <span className={badgeClass(getJobTone(localAiStatus?.status || "idle"))}>
                  {isRunning ? "running" : localAiStatus?.status || "idle"}
                </span>
              </div>

              {localAiMessage ? (
                <div className="alert alert-success py-2">
                  <span className="text-sm">{localAiMessage}</span>
                </div>
              ) : null}

              {localAiError ? (
                <div className="alert alert-error py-2">
                  <span className="text-sm">{localAiError}</span>
                </div>
              ) : null}

              {isRunning ? (
                <div className="alert py-2">
                  <span className="loading loading-spinner loading-xs" />
                  <span className="text-sm">{localAiStatus?.action} is running.</span>
                </div>
              ) : null}

              <div className="grid gap-2 text-sm">
                <StatRow label="Action" value={localAiStatus?.action || "None"} />
                <StatRow label="Started" value={formatDate(localAiStatus?.startedAt || null)} />
                <StatRow label="Finished" value={formatDate(localAiStatus?.finishedAt || null)} />
                <StatRow label="Exit Code" value={localAiStatus?.exitCode ?? "Not available"} />
                <StatRow label="Message" value={localAiStatus?.message || "No Local AI job has run yet."} />
                <StatRow label="Log Path" value={localAiStatus?.logPath || "Not available"} />
              </div>

              <div className="stats stats-vertical border border-base-300 bg-base-200 shadow-none">
                <div className="stat py-3">
                  <div className="stat-title">PASS</div>
                  <div className="stat-value text-success">{localAiStatus?.passCount ?? 0}</div>
                </div>
                <div className="stat py-3">
                  <div className="stat-title">WARN</div>
                  <div className="stat-value text-warning">{localAiStatus?.warnCount ?? 0}</div>
                </div>
                <div className="stat py-3">
                  <div className="stat-title">FAIL</div>
                  <div className="stat-value text-error">{localAiStatus?.failCount ?? 0}</div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
