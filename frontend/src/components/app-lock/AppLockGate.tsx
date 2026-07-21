import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { getAppLockStatus, unlockApp } from "../../api/appLock";

export function AppLockGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "locked" | "open" | "error">("checking");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getAppLockStatus()
      .then((status) => setState(status.enabled && !status.unlocked ? "locked" : "open"))
      .catch(() => setState("error"));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await unlockApp(password);
      setPassword("");
      setState("open");
    } catch (error) {
      setPassword("");
      setMessage(error instanceof Error ? error.message : "Incorrect password.");
    } finally {
      setBusy(false);
    }
  };

  if (state === "open") return <>{children}</>;

  return (
    <main className="flex min-h-screen items-center justify-center bg-base-200 p-6">
      <div className="card w-full max-w-md border border-base-300 bg-base-100 shadow-xl">
        <div className="card-body">
          <h1 className="card-title text-2xl">{state === "error" ? "Backend unavailable" : "App locked"}</h1>
          <p className="text-base-content/70">
            {state === "checking" ? "Checking local lock status…" : state === "error" ? "Could not check the local app lock. Restart the app or backend and try again." : "Enter your local password to continue."}
          </p>
          {state === "checking" ? <span className="loading loading-spinner loading-md self-center" /> : null}
          {state === "locked" ? (
            <form className="mt-2 space-y-4" onSubmit={submit}>
              <label className="form-control gap-2">
                <span className="label-text font-medium">Password</span>
                <input autoFocus autoComplete="current-password" type="password" className="input input-bordered" value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} />
              </label>
              {message ? <div className="alert alert-error text-sm">{message}</div> : null}
              <button className="btn btn-primary w-full" disabled={busy || !password}>{busy ? "Unlocking…" : "Unlock"}</button>
            </form>
          ) : null}
        </div>
      </div>
    </main>
  );
}
