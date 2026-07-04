import { useEffect, useMemo, useRef, useState } from "react";

import { ApiError } from "../api/client";
import { getSettings, type SettingsRecord, updateSettings } from "../api/settings";
import { PageHeader } from "../components/ui/PageHeader";

export function SettingsPage() {
  const [whisperBinaryPath, setWhisperBinaryPath] = useState("");
  const [whisperModelPath, setWhisperModelPath] = useState("");
  const [ttsEngine, setTtsEngine] = useState("placeholder");
  const [sqliteDatabasePath, setSqliteDatabasePath] = useState("./data/app_template_base.sqlite3");
  const [isLoading, setIsLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const initializedRef = useRef(false);

  const payload = useMemo(
    () => ({
      whisper_cpp_binary: whisperBinaryPath.trim() || null,
      whisper_model_path: whisperModelPath.trim() || null,
      default_tts_engine: ttsEngine,
      sqlite_database_path: sqliteDatabasePath.trim(),
    }),
    [sqliteDatabasePath, ttsEngine, whisperBinaryPath, whisperModelPath],
  );

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      try {
        const data = await getSettings();
        if (cancelled) {
          return;
        }

        applySettings(data);
        initializedRef.current = true;
        setSaveState("idle");
        setStatusMessage("");
      } catch (error) {
        if (cancelled) {
          return;
        }

        setSaveState("error");
        setStatusMessage(error instanceof Error ? error.message : "Could not load settings.");
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!initializedRef.current || isLoading) {
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        setSaveState("saving");
        setStatusMessage("Saving settings...");
        const saved = await updateSettings(payload);
        applySettings(saved);
        setSaveState("saved");
        setStatusMessage("Settings saved automatically.");
      } catch (error) {
        setSaveState("error");
        if (error instanceof ApiError) {
          setStatusMessage(error.message);
        } else {
          setStatusMessage(error instanceof Error ? error.message : "Could not save settings.");
        }
      }
    }, 500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [isLoading, payload]);

  const applySettings = (data: SettingsRecord) => {
    setWhisperBinaryPath(data.whisper_cpp_binary || "");
    setWhisperModelPath(data.whisper_model_path || "");
    setTtsEngine(data.default_tts_engine);
    setSqliteDatabasePath(data.sqlite_database_path);
  };

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
        description="These settings now auto-save to the local app database. Changes persist without a save button."
      />

      <section className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-5">
          {isLoading ? (
            <div className="alert">
              <span className="loading loading-spinner loading-sm" />
              <span className="text-sm">Loading saved settings...</span>
            </div>
          ) : null}

          {!isLoading ? (
            <div
              className={`alert ${
                saveState === "error"
                  ? "alert-error"
                  : saveState === "saved"
                    ? "alert-success"
                    : "alert"
              }`}
            >
              {saveState === "saving" ? <span className="loading loading-spinner loading-sm" /> : null}
              <span className="text-sm">
                {statusMessage || "Changes auto-save as you edit these fields."}
              </span>
            </div>
          ) : null}

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
                  disabled={isLoading}
                />
                <button type="button" className="btn btn-outline join-item" onClick={pickWhisperBinary} disabled={isLoading}>
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
                  disabled={isLoading}
                />
                <button type="button" className="btn btn-outline join-item" onClick={pickWhisperModel} disabled={isLoading}>
                  Browse
                </button>
              </div>
            </label>

            <label className="form-control gap-2">
              <span className="label-text font-medium">TTS Engine</span>
              <select
                className="select select-bordered"
                value={ttsEngine}
                onChange={(event) => setTtsEngine(event.target.value)}
                disabled={isLoading}
              >
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
                  disabled={isLoading}
                />
                <button type="button" className="btn btn-outline join-item" onClick={pickSqliteDatabase} disabled={isLoading}>
                  Browse
                </button>
              </div>
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
