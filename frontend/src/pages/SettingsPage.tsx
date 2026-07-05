import { useEffect, useMemo, useState } from "react";

import { ApiError } from "../api/client";
import { getSettings, type SettingsRecord, type SettingsUpdatePayload, updateSettings } from "../api/settings";
import { getBackendHealth, getVoiceStatus, type VoiceStatusRecord } from "../api/system";
import { PageHeader } from "../components/ui/PageHeader";

type FormState = {
  whisperBinaryPath: string;
  whisperModelPath: string;
  whisperThreadCount: string;
  ttsEngine: string;
  piperBinaryPath: string;
  piperModelPath: string;
  sqliteDatabasePath: string;
  audioInputDirectory: string;
  audioOutputDirectory: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;

const initialFormState: FormState = {
  whisperBinaryPath: "",
  whisperModelPath: "",
  whisperThreadCount: "4",
  ttsEngine: "mock",
  piperBinaryPath: "",
  piperModelPath: "",
  sqliteDatabasePath: "./data/app_template_base.sqlite3",
  audioInputDirectory: "./data/audio/input",
  audioOutputDirectory: "./data/audio/tts",
};

function buildFormState(data: SettingsRecord): FormState {
  return {
    whisperBinaryPath: data.whisper_cpp_binary || "",
    whisperModelPath: data.whisper_model_path || "",
    whisperThreadCount: String(data.whisper_thread_count),
    ttsEngine: data.tts_engine,
    piperBinaryPath: data.piper_binary || "",
    piperModelPath: data.piper_model_path || "",
    sqliteDatabasePath: data.sqlite_database_path,
    audioInputDirectory: data.audio_input_dir,
    audioOutputDirectory: data.tts_output_dir || "./data/audio/tts",
  };
}

function validateForm(formState: FormState): FormErrors {
  const errors: FormErrors = {};
  const threadCount = Number(formState.whisperThreadCount);

  if (!Number.isInteger(threadCount) || threadCount < 1 || threadCount > 64) {
    errors.whisperThreadCount = "Thread count must be an integer between 1 and 64.";
  }

  if (!formState.ttsEngine.trim()) {
    errors.ttsEngine = "Choose a TTS engine.";
  }

  if (!formState.sqliteDatabasePath.trim()) {
    errors.sqliteDatabasePath = "SQLite database path is required.";
  }

  if (!formState.audioInputDirectory.trim()) {
    errors.audioInputDirectory = "Audio input directory is required.";
  }

  if (!formState.audioOutputDirectory.trim()) {
    errors.audioOutputDirectory = "Audio output directory is required.";
  }

  if (formState.ttsEngine === "piper") {
    if (!formState.piperBinaryPath.trim()) {
      errors.piperBinaryPath = "Piper binary path is required when Piper is selected.";
    }

    if (!formState.piperModelPath.trim()) {
      errors.piperModelPath = "Piper model path is required when Piper is selected.";
    }
  }

  return errors;
}

function buildPayload(formState: FormState): SettingsUpdatePayload {
  return {
    whisper_cpp_binary: formState.whisperBinaryPath.trim() || null,
    whisper_model_path: formState.whisperModelPath.trim() || null,
    whisper_thread_count: Number(formState.whisperThreadCount),
    tts_engine: formState.ttsEngine,
    piper_binary: formState.piperBinaryPath.trim() || null,
    piper_model_path: formState.piperModelPath.trim() || null,
    audio_input_dir: formState.audioInputDirectory.trim(),
    tts_output_dir: formState.audioOutputDirectory.trim(),
  };
}

export function SettingsPage() {
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [savedState, setSavedState] = useState<FormState>(initialFormState);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [backendHealth, setBackendHealth] = useState<string>("loading");
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatusRecord | null>(null);
  const [statusError, setStatusError] = useState("");
  const [databasePathNote, setDatabasePathNote] = useState("SQLite database path is startup-only. Change DATABASE_URL and restart the backend to use another database.");

  const formErrors = useMemo(() => validateForm(formState), [formState]);
  const hasValidationErrors = Object.keys(formErrors).length > 0;
  const isDirty = JSON.stringify(formState) !== JSON.stringify(savedState);

  useEffect(() => {
    let cancelled = false;

    const loadPageData = async () => {
      try {
        const [settings, health, voice] = await Promise.all([
          getSettings(),
          getBackendHealth(),
          getVoiceStatus(),
        ]);

        if (cancelled) {
          return;
        }

        const nextFormState = buildFormState(settings);
        setFormState(nextFormState);
        setSavedState(nextFormState);
        setDatabasePathNote(settings.database_path_note);
        setBackendHealth(health.status);
        setVoiceStatus(voice);
        setStatusMessage("Loaded local settings. Environment values remain the defaults until you override them here.");
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : "Could not load settings.";
        setSaveError(message);
        setStatusError(message);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    loadPageData();

    return () => {
      cancelled = true;
    };
  }, []);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
    setSaveError("");
  };

  const saveSettings = async () => {
    const errors = validateForm(formState);
    if (Object.keys(errors).length > 0) {
      setSaveError("Fix the validation errors before saving.");
      return;
    }

    try {
      setIsSaving(true);
      setSaveError("");
      setStatusMessage("Saving settings...");
      const saved = await updateSettings(buildPayload(formState));
      const nextFormState = buildFormState(saved);
      setFormState(nextFormState);
      setSavedState(nextFormState);
      setStatusMessage("Settings saved.");
      const voice = await getVoiceStatus();
      setVoiceStatus(voice);
    } catch (error) {
      if (error instanceof ApiError) {
        setSaveError(error.message);
      } else {
        setSaveError(error instanceof Error ? error.message : "Could not save settings.");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const pickWhisperBinary = async () => {
    const result = await window.desktop?.pickWhisperBinary();
    if (result && !result.canceled && result.path) {
      setField("whisperBinaryPath", result.path);
    }
  };

  const pickWhisperModel = async () => {
    const result = await window.desktop?.pickWhisperModel();
    if (result && !result.canceled && result.path) {
      setField("whisperModelPath", result.path);
    }
  };

  const pickPiperBinary = async () => {
    const result = await window.desktop?.pickPiperBinary();
    if (result && !result.canceled && result.path) {
      setField("piperBinaryPath", result.path);
    }
  };

  const pickPiperModel = async () => {
    const result = await window.desktop?.pickPiperModel();
    if (result && !result.canceled && result.path) {
      setField("piperModelPath", result.path);
    }
  };

  const pickAudioInputDirectory = async () => {
    const result = await window.desktop?.pickAudioInputDirectory();
    if (result && !result.canceled && result.path) {
      setField("audioInputDirectory", result.path);
    }
  };

  const pickAudioOutputDirectory = async () => {
    const result = await window.desktop?.pickAudioOutputDirectory();
    if (result && !result.canceled && result.path) {
      setField("audioOutputDirectory", result.path);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Local settings management"
        description="Environment variables provide defaults. Saving here stores local overrides in SQLite and those overrides win on future app launches."
      />

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="card border border-base-300 bg-base-100 shadow-sm xl:col-span-2">
          <div className="card-body gap-5">
            {isLoading ? (
              <div className="alert">
                <span className="loading loading-spinner loading-sm" />
                <span className="text-sm">Loading saved settings...</span>
              </div>
            ) : null}

            {statusMessage && !saveError ? (
              <div className="alert alert-info">
                <span className="text-sm">{statusMessage}</span>
              </div>
            ) : null}

            {saveError ? (
              <div className="alert alert-error">
                <span className="text-sm">{saveError}</span>
              </div>
            ) : null}

            <div className="grid gap-5 lg:grid-cols-2">
              <label className="form-control gap-2">
                <span className="label-text font-medium">Whisper Binary Path</span>
                <div className="join">
                  <input
                    type="text"
                    className={`input input-bordered join-item w-full ${formErrors.whisperBinaryPath ? "input-error" : ""}`}
                    value={formState.whisperBinaryPath}
                    onChange={(event) => setField("whisperBinaryPath", event.target.value)}
                    disabled={isLoading || isSaving}
                    placeholder="/path/to/whisper-cli"
                  />
                  <button type="button" className="btn btn-outline join-item" onClick={pickWhisperBinary} disabled={isLoading || isSaving}>
                    Browse
                  </button>
                </div>
                {formErrors.whisperBinaryPath ? <span className="label-text-alt text-error">{formErrors.whisperBinaryPath}</span> : null}
              </label>

              <label className="form-control gap-2">
                <span className="label-text font-medium">Whisper Model Path</span>
                <div className="join">
                  <input
                    type="text"
                    className={`input input-bordered join-item w-full ${formErrors.whisperModelPath ? "input-error" : ""}`}
                    value={formState.whisperModelPath}
                    onChange={(event) => setField("whisperModelPath", event.target.value)}
                    disabled={isLoading || isSaving}
                    placeholder="/path/to/ggml-model.bin"
                  />
                  <button type="button" className="btn btn-outline join-item" onClick={pickWhisperModel} disabled={isLoading || isSaving}>
                    Browse
                  </button>
                </div>
                {formErrors.whisperModelPath ? <span className="label-text-alt text-error">{formErrors.whisperModelPath}</span> : null}
              </label>

              <label className="form-control gap-2">
                <span className="label-text font-medium">Whisper Thread Count</span>
                <input
                  type="number"
                  min={1}
                  max={64}
                  className={`input input-bordered ${formErrors.whisperThreadCount ? "input-error" : ""}`}
                  value={formState.whisperThreadCount}
                  onChange={(event) => setField("whisperThreadCount", event.target.value)}
                  disabled={isLoading || isSaving}
                />
                {formErrors.whisperThreadCount ? <span className="label-text-alt text-error">{formErrors.whisperThreadCount}</span> : null}
              </label>

              <label className="form-control gap-2">
                <span className="label-text font-medium">TTS Engine</span>
                <select
                  className={`select select-bordered ${formErrors.ttsEngine ? "select-error" : ""}`}
                  value={formState.ttsEngine}
                  onChange={(event) => setField("ttsEngine", event.target.value)}
                  disabled={isLoading || isSaving}
                >
                  <option value="mock">Mock</option>
                  <option value="piper">Piper</option>
                </select>
                {formErrors.ttsEngine ? <span className="label-text-alt text-error">{formErrors.ttsEngine}</span> : null}
              </label>

              <label className="form-control gap-2">
                <span className="label-text font-medium">Piper Binary Path</span>
                <div className="join">
                  <input
                    type="text"
                    className={`input input-bordered join-item w-full ${formErrors.piperBinaryPath ? "input-error" : ""}`}
                    value={formState.piperBinaryPath}
                    onChange={(event) => setField("piperBinaryPath", event.target.value)}
                    disabled={isLoading || isSaving}
                    placeholder="/path/to/piper"
                  />
                  <button type="button" className="btn btn-outline join-item" onClick={pickPiperBinary} disabled={isLoading || isSaving}>
                    Browse
                  </button>
                </div>
                {formErrors.piperBinaryPath ? <span className="label-text-alt text-error">{formErrors.piperBinaryPath}</span> : null}
              </label>

              <label className="form-control gap-2">
                <span className="label-text font-medium">Piper Model Path</span>
                <div className="join">
                  <input
                    type="text"
                    className={`input input-bordered join-item w-full ${formErrors.piperModelPath ? "input-error" : ""}`}
                    value={formState.piperModelPath}
                    onChange={(event) => setField("piperModelPath", event.target.value)}
                    disabled={isLoading || isSaving}
                    placeholder="/path/to/piper-model.onnx"
                  />
                  <button type="button" className="btn btn-outline join-item" onClick={pickPiperModel} disabled={isLoading || isSaving}>
                    Browse
                  </button>
                </div>
                {formErrors.piperModelPath ? <span className="label-text-alt text-error">{formErrors.piperModelPath}</span> : null}
              </label>

              <label className="form-control gap-2">
                <span className="label-text font-medium">Audio Input Directory</span>
                <div className="join">
                  <input
                    type="text"
                    className={`input input-bordered join-item w-full ${formErrors.audioInputDirectory ? "input-error" : ""}`}
                    value={formState.audioInputDirectory}
                    onChange={(event) => setField("audioInputDirectory", event.target.value)}
                    disabled={isLoading || isSaving}
                  />
                  <button type="button" className="btn btn-outline join-item" onClick={pickAudioInputDirectory} disabled={isLoading || isSaving}>
                    Browse
                  </button>
                </div>
                {formErrors.audioInputDirectory ? <span className="label-text-alt text-error">{formErrors.audioInputDirectory}</span> : null}
              </label>

              <label className="form-control gap-2">
                <span className="label-text font-medium">Audio Output Directory</span>
                <div className="join">
                  <input
                    type="text"
                    className={`input input-bordered join-item w-full ${formErrors.audioOutputDirectory ? "input-error" : ""}`}
                    value={formState.audioOutputDirectory}
                    onChange={(event) => setField("audioOutputDirectory", event.target.value)}
                    disabled={isLoading || isSaving}
                  />
                  <button type="button" className="btn btn-outline join-item" onClick={pickAudioOutputDirectory} disabled={isLoading || isSaving}>
                    Browse
                  </button>
                </div>
                {formErrors.audioOutputDirectory ? <span className="label-text-alt text-error">{formErrors.audioOutputDirectory}</span> : null}
              </label>

              <label className="form-control gap-2 lg:col-span-2">
                <span className="label-text font-medium">SQLite Database Path (startup-only)</span>
                <div>
                  <input
                    type="text"
                    className={`input input-bordered w-full ${formErrors.sqliteDatabasePath ? "input-error" : ""}`}
                    value={formState.sqliteDatabasePath}
                    readOnly
                    disabled={isLoading}
                  />
                </div>
                {formErrors.sqliteDatabasePath ? <span className="label-text-alt text-error">{formErrors.sqliteDatabasePath}</span> : null}
                <span className="label-text-alt text-base-content/60">{databasePathNote}</span>
              </label>
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-base-300 pt-4">
              <p className="text-sm text-base-content/60">
                {isDirty ? "You have unsaved local setting changes." : "Local settings are in sync with the last saved values."}
              </p>
              <button
                type="button"
                className={`btn btn-primary ${isSaving ? "loading" : ""}`}
                disabled={isLoading || isSaving || hasValidationErrors || !isDirty}
                onClick={saveSettings}
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>

        <div className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body gap-4">
            <h2 className="card-title text-xl">Backend Status</h2>
            {statusError ? (
              <div className="alert alert-error">
                <span className="text-sm">{statusError}</span>
              </div>
            ) : null}

            <div className="rounded-box bg-base-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">Health</p>
              <div className="mt-3 flex items-center gap-3">
                <span className={`badge ${backendHealth === "ok" ? "badge-success" : "badge-warning"}`}>
                  {backendHealth}
                </span>
                <span className="text-sm text-base-content/70">`GET /api/health`</span>
              </div>
            </div>

            <div className="rounded-box bg-base-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">Voice Runtime</p>
              {voiceStatus ? (
                <div className="mt-3 space-y-2 text-sm text-base-content/75">
                  <p><span className="font-medium">STT:</span> {voiceStatus.stt_engine}</p>
                  <p><span className="font-medium">TTS:</span> {voiceStatus.tts_engine}</p>
                  <p className="text-xs text-base-content/60">{voiceStatus.message}</p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-base-content/50">Voice status is not available yet.</p>
              )}
            </div>

            <div className="rounded-box bg-base-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">Resolution Order</p>
              <p className="mt-3 text-sm text-base-content/70">
                Environment variables act as defaults. Saved local settings override those defaults on future launches.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
