import { useEffect, useState } from "react";

type BackendHealth = {
  ok: boolean;
  status: number | null;
  payload?: unknown;
  message?: string;
};

export function DesktopInfoCard() {
  const [version, setVersion] = useState<string>("unavailable");
  const [health, setHealth] = useState<BackendHealth | null>(null);
  const [logsMessage, setLogsMessage] = useState<string>("");

  useEffect(() => {
    if (!window.desktop) {
      return;
    }

    window.desktop.getAppVersion().then(setVersion).catch(() => {
      setVersion("unavailable");
    });

    window.desktop.checkBackendHealth().then(setHealth).catch(() => {
      setHealth({
        ok: false,
        status: null,
        message: "Desktop bridge could not reach the backend.",
      });
    });
  }, []);

  const onOpenLogs = async () => {
    if (!window.desktop) {
      setLogsMessage("Logs folder is only available inside Electron.");
      return;
    }

    const result = await window.desktop.openLogsFolder();
    setLogsMessage(result.ok ? `Opened ${result.path}` : result.message || "Could not open logs folder.");
  };

  return (
    <section className="card border border-base-300 bg-base-100 shadow-sm">
      <div className="card-body gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="card-title text-xl">Desktop Shell</h2>
          <span className="badge badge-outline">Electron</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-box bg-base-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">
              App Version
            </p>
            <p className="mt-2 text-lg font-semibold">{version}</p>
          </div>
          <div className="rounded-box bg-base-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">
              Backend Health
            </p>
            <p className="mt-2 text-sm">
              {health
                ? health.ok
                  ? `Connected (${health.status})`
                  : health.message || "Unavailable"
                : "Checking..."}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-base-content/70">
            The preload bridge exposes safe desktop-only helpers without enabling Node in the renderer.
          </p>
          <button type="button" className="btn btn-outline btn-sm" onClick={onOpenLogs}>
            Open Logs Folder
          </button>
        </div>
        {logsMessage ? <p className="text-xs text-base-content/60">{logsMessage}</p> : null}
      </div>
    </section>
  );
}
