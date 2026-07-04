import { useState } from "react";

import { PageHeader } from "../components/ui/PageHeader";

export function SettingsPage() {
  const [whisperBinaryPath, setWhisperBinaryPath] = useState("");
  const [whisperModelPath, setWhisperModelPath] = useState("");
  const [sqliteDatabasePath, setSqliteDatabasePath] = useState("./data/app_template_base.sqlite3");

  const pickWhisperBinary = async () => {
    if (!window.desktop) {
      return;
    }

    const result = await window.desktop.pickWhisperBinary();
    if (!result.canceled && result.path) {
      setWhisperBinaryPath(result.path);
    }
  };

  const pickWhisperModel = async () => {
    if (!window.desktop) {
      return;
    }

    const result = await window.desktop.pickWhisperModel();
    if (!result.canceled && result.path) {
      setWhisperModelPath(result.path);
    }
  };

  const pickSqliteDatabase = async () => {
    if (!window.desktop) {
      return;
    }

    const result = await window.desktop.pickSqliteDatabase();
    if (!result.canceled && result.path) {
      setSqliteDatabasePath(result.path);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Local configuration preview"
        description="These fields are UI placeholders for future persisted settings. They reflect the intended local-first configuration surface."
      />

      <section className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <label className="form-control gap-2">
              <span className="label-text font-medium">Whisper Binary Path</span>
              <div className="join">
                <input
                  type="text"
                  className="input input-bordered join-item w-full"
                  placeholder="/path/to/whisper-cli"
                  value={whisperBinaryPath}
                  onChange={(event) => setWhisperBinaryPath(event.target.value)}
                />
                <button type="button" className="btn btn-outline join-item" onClick={pickWhisperBinary}>
                  Browse
                </button>
              </div>
            </label>

            <label className="form-control gap-2">
              <span className="label-text font-medium">Whisper Model Path</span>
              <div className="join">
                <input
                  type="text"
                  className="input input-bordered join-item w-full"
                  placeholder="/path/to/ggml-model.bin"
                  value={whisperModelPath}
                  onChange={(event) => setWhisperModelPath(event.target.value)}
                />
                <button type="button" className="btn btn-outline join-item" onClick={pickWhisperModel}>
                  Browse
                </button>
              </div>
            </label>

            <label className="form-control gap-2">
              <span className="label-text font-medium">TTS Engine</span>
              <select className="select select-bordered" defaultValue="placeholder">
                <option value="placeholder">Placeholder</option>
                <option value="piper">Piper</option>
              </select>
            </label>

            <label className="form-control gap-2">
              <span className="label-text font-medium">SQLite Database Path</span>
              <div className="join">
                <input
                  type="text"
                  className="input input-bordered join-item w-full"
                  value={sqliteDatabasePath}
                  onChange={(event) => setSqliteDatabasePath(event.target.value)}
                />
                <button type="button" className="btn btn-outline join-item" onClick={pickSqliteDatabase}>
                  Browse
                </button>
              </div>
            </label>
          </div>

          <div className="alert">
            <span className="text-sm">
              Settings persistence is not connected yet. This page is only establishing the frontend contract.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
