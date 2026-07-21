import { type FormEvent, useEffect, useState } from "react";
import { changeAppLockPassword, disableAppLock, enableAppLock, getAppLockStatus, lockApp } from "../../api/appLock";

type Mode = "enable" | "change" | "disable" | null;

export function AppLockSettings() {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<Mode>(null);
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => { getAppLockStatus().then((status) => setEnabled(status.enabled)).catch(() => setError("Could not load app lock status.")); }, []);
  const clear = () => { setCurrent(""); setPassword(""); setConfirm(""); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const result = mode === "enable" ? await enableAppLock(password, confirm) : mode === "change" ? await changeAppLockPassword(current, password, confirm) : await disableAppLock(current);
      setEnabled(result.enabled); setMessage(result.message || "App lock updated."); setMode(null); setIsOpen(false); clear();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update app lock."); clear(); }
    finally { setBusy(false); }
  };
  const lockNow = async () => { setBusy(true); try { await lockApp(); window.location.reload(); } catch (err) { setError(err instanceof Error ? err.message : "Could not lock app."); setBusy(false); } };

  return (
    <section className="card border border-base-300 bg-base-100 shadow-sm">
      <div className="card-body gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1"><div className="flex items-center gap-3"><h2 className="card-title text-xl">Local App Lock</h2><span className={`badge ${enabled ? "badge-success" : "badge-ghost"}`}>{enabled ? "Enabled" : "Disabled"}</span></div><p className="text-sm text-base-content/70">Optional password protection stored only on this device.</p></div>
        {message ? <div className="alert alert-success text-sm">{message}</div> : null}{error ? <div className="alert alert-error text-sm">{error}</div> : null}
        <button className="btn btn-primary btn-sm" onClick={() => { setIsOpen(true); setMode(enabled ? "change" : "enable"); setError(""); }}>Edit</button>
        {isOpen ? <dialog className="modal modal-open" aria-labelledby="app-lock-editor-title"><div className="modal-box max-w-lg"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">Security</p><h2 id="app-lock-editor-title" className="mt-1 text-2xl font-semibold">Local App Lock</h2></div><button type="button" className="btn btn-circle btn-ghost btn-sm" onClick={() => { setIsOpen(false); setMode(null); clear(); }}>✕</button></div>
        <div className="my-5 flex flex-wrap gap-2">
          {!enabled ? <button className={`btn btn-sm ${mode === "enable" ? "btn-primary" : "btn-outline"}`} onClick={() => setMode("enable")}>Enable</button> : <><button className={`btn btn-sm ${mode === "change" ? "btn-primary" : "btn-outline"}`} onClick={() => setMode("change")}>Change Password</button><button className={`btn btn-sm ${mode === "disable" ? "btn-error" : "btn-outline"}`} onClick={() => setMode("disable")}>Disable</button><button className="btn btn-outline btn-sm" onClick={lockNow} disabled={busy}>Lock Now</button></>}
        </div>
        {mode ? <form className="space-y-3" onSubmit={submit}>
          {mode !== "enable" ? <label className="form-control gap-1"><span className="label-text">Current password</span><input autoComplete="current-password" type="password" className="input input-bordered" value={current} onChange={(e) => setCurrent(e.target.value)} required /></label> : null}
          {mode !== "disable" ? <><label className="form-control gap-1"><span className="label-text">{mode === "enable" ? "New password" : "New password"}</span><input autoComplete="new-password" type="password" minLength={8} className="input input-bordered" value={password} onChange={(e) => setPassword(e.target.value)} required /><span className="label-text-alt">At least 8 characters.</span></label><label className="form-control gap-1"><span className="label-text">Confirm password</span><input autoComplete="new-password" type="password" minLength={8} className="input input-bordered" value={confirm} onChange={(e) => setConfirm(e.target.value)} required /></label></> : null}
          <div className="modal-action"><button type="button" className="btn btn-ghost" onClick={() => { setIsOpen(false); setMode(null); clear(); }}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save"}</button></div>
        </form> : null}</div><button type="button" className="modal-backdrop" onClick={() => { setIsOpen(false); setMode(null); clear(); }}>close</button></dialog> : null}
      </div>
    </section>
  );
}
