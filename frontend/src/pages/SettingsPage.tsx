import { useEffect, useMemo, useState } from "react";

import { ApiError } from "../api/client";
import {
  applyDeviceProfile,
  getSettings,
  type AppDefinitionRecord,
  type DeviceSettingsProfileRecord,
  type SettingsRecord,
  type SettingsUpdatePayload,
  saveDeviceProfile,
  updateAppDefinition,
  updateSettings,
} from "../api/settings";
import { getBackendHealth, getVoiceStatus, type VoiceStatusRecord } from "../api/system";
import { PageHeader } from "../components/ui/PageHeader";
import { useAppDefinition } from "../context/AppDefinitionContext";

type FormState = {
  packageName: string;
  appVersion: string;
  appDisplayName: string;
  sidebarEyebrow: string;
  sidebarTitle: string;
  sidebarDescription: string;
  topbarEyebrow: string;
  topbarTitle: string;
  homeEyebrow: string;
  homeTitle: string;
  homeDescription: string;
  deviceName: string;
  selectedDeviceName: string;
  whisperBinaryPath: string;
  whisperModelPath: string;
  whisperThreadCount: string;
  ttsEngine: string;
  piperBinaryPath: string;
  piperModelPath: string;
  ttsTimeoutSeconds: string;
  sqliteDatabasePath: string;
  audioInputDirectory: string;
  audioOutputDirectory: string;
};

type FormErrors = Partial<Record<keyof FormState, string>>;
type FormWarnings = Partial<Record<keyof FormState, string>>;

type PackageArtifact = {
  name: string;
  path: string;
  sizeBytes: number;
  modifiedAt: string;
};

type PackageStatus = {
  running: boolean;
  action: string | null;
  startedAt: string | null;
  logsPath: string;
  releaseDir: string;
  artifacts: PackageArtifact[];
};

const initialFormState: FormState = {
  packageName: "apptemplatebase",
  appVersion: "0.1.0",
  appDisplayName: "AppTemplateBase",
  sidebarEyebrow: "AppTemplateBase",
  sidebarTitle: "Desktop Starter",
  sidebarDescription: "Local-first shell for voice-enabled desktop apps.",
  topbarEyebrow: "Local-First Workspace",
  topbarTitle: "Frontend Starter",
  homeEyebrow: "Overview",
  homeTitle: "Reusable local-first desktop starter",
  homeDescription: "This frontend is a clean launch surface for future desktop apps built on Electron, React, FastAPI, SQLite, and local voice tooling.",
  deviceName: "",
  selectedDeviceName: "",
  whisperBinaryPath: "",
  whisperModelPath: "",
  whisperThreadCount: "4",
  ttsEngine: "mock",
  piperBinaryPath: "",
  piperModelPath: "",
  ttsTimeoutSeconds: "120",
  sqliteDatabasePath: "./data/app_template_base.sqlite3",
  audioInputDirectory: "./data/audio/input",
  audioOutputDirectory: "./data/audio/tts",
};

function buildFormState(data: SettingsRecord): FormState {
  const appDefinition = data.app_definition;
  return {
    packageName: appDefinition.package_name,
    appVersion: appDefinition.app_version,
    appDisplayName: appDefinition.app_display_name,
    sidebarEyebrow: appDefinition.sidebar_eyebrow,
    sidebarTitle: appDefinition.sidebar_title,
    sidebarDescription: appDefinition.sidebar_description,
    topbarEyebrow: appDefinition.topbar_eyebrow,
    topbarTitle: appDefinition.topbar_title,
    homeEyebrow: appDefinition.home_eyebrow,
    homeTitle: appDefinition.home_title,
    homeDescription: appDefinition.home_description,
    deviceName: data.selected_device_name || data.current_device_name,
    selectedDeviceName: data.selected_device_name || data.current_device_name,
    whisperBinaryPath: data.whisper_cpp_binary || "",
    whisperModelPath: data.whisper_model_path || "",
    whisperThreadCount: String(data.whisper_thread_count),
    ttsEngine: data.tts_engine,
    piperBinaryPath: data.piper_binary || "",
    piperModelPath: data.piper_model_path || "",
    ttsTimeoutSeconds: String(data.tts_timeout_seconds),
    sqliteDatabasePath: data.sqlite_database_path,
    audioInputDirectory: data.audio_input_dir,
    audioOutputDirectory: data.tts_output_dir || "./data/audio/tts",
  };
}

function validateForm(formState: FormState): FormErrors {
  const errors: FormErrors = {};
  const threadCount = Number(formState.whisperThreadCount);
  const timeoutSeconds = Number(formState.ttsTimeoutSeconds);

  if (!/^[a-z0-9][a-z0-9._-]{0,213}$/.test(formState.packageName.trim()) || formState.packageName.includes("..")) {
    errors.packageName = "Package name must be lowercase npm-safe text, such as my-new-app.";
  }

  if (!/^\d+\.\d+\.\d+$/.test(formState.appVersion.trim())) {
    errors.appVersion = "Version must use major.minor.patch format, such as 0.1.0.";
  }

  for (const key of [
    "appDisplayName",
    "sidebarEyebrow",
    "sidebarTitle",
    "sidebarDescription",
    "topbarEyebrow",
    "topbarTitle",
    "homeEyebrow",
    "homeTitle",
    "homeDescription",
  ] as const) {
    if (!formState[key].trim()) {
      errors[key] = "This field is required.";
    }
  }

  if (!formState.deviceName.trim()) {
    errors.deviceName = "Device name is required.";
  }

  if (!Number.isInteger(threadCount) || threadCount < 1 || threadCount > 64) {
    errors.whisperThreadCount = "Thread count must be an integer between 1 and 64.";
  }

  if (!["mock", "piper"].includes(formState.ttsEngine)) {
    errors.ttsEngine = "TTS engine must be mock or piper.";
  }

  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    errors.ttsTimeoutSeconds = "TTS timeout must be a positive number.";
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

  return errors;
}

function buildWarnings(formState: FormState): FormWarnings {
  const warnings: FormWarnings = {};

  if (formState.ttsEngine === "piper") {
    if (!formState.piperBinaryPath.trim()) {
      warnings.piperBinaryPath = "Piper is selected, but the binary path is blank. Voice Lab will keep Piper selected and report a configuration error until this is set.";
    }

    if (!formState.piperModelPath.trim()) {
      warnings.piperModelPath = "Piper is selected, but the model path is blank. Voice Lab will keep Piper selected and report a configuration error until this is set.";
    }
  }

  return warnings;
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
    tts_timeout_seconds: Number(formState.ttsTimeoutSeconds),
  };
}

function buildAppDefinitionPayload(formState: FormState): AppDefinitionRecord {
  return {
    package_name: formState.packageName.trim().toLowerCase(),
    app_version: formState.appVersion.trim(),
    app_display_name: formState.appDisplayName.trim(),
    sidebar_eyebrow: formState.sidebarEyebrow.trim(),
    sidebar_title: formState.sidebarTitle.trim(),
    sidebar_description: formState.sidebarDescription.trim(),
    topbar_eyebrow: formState.topbarEyebrow.trim(),
    topbar_title: formState.topbarTitle.trim(),
    home_eyebrow: formState.homeEyebrow.trim(),
    home_title: formState.homeTitle.trim(),
    home_description: formState.homeDescription.trim(),
  };
}

function buildDeviceProfilePayload(formState: FormState): DeviceSettingsProfileRecord {
  return {
    device_name: formState.deviceName.trim(),
    whisper_cpp_binary: formState.whisperBinaryPath.trim() || null,
    whisper_model_path: formState.whisperModelPath.trim() || null,
    whisper_thread_count: Number(formState.whisperThreadCount),
    tts_engine: formState.ttsEngine,
    piper_binary: formState.piperBinaryPath.trim() || null,
    piper_model_path: formState.piperModelPath.trim() || null,
    audio_input_dir: formState.audioInputDirectory.trim(),
    tts_output_dir: formState.audioOutputDirectory.trim(),
    tts_timeout_seconds: Number(formState.ttsTimeoutSeconds),
  };
}

function findVoiceEngineStatus(voiceStatus: VoiceStatusRecord | null, engineId: string) {
  return voiceStatus?.engines.find((engine) => engine.id === engineId) || null;
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes > 1024 * 1024) {
    return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  }
  if (sizeBytes > 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${sizeBytes} bytes`;
}

export function SettingsPage() {
  const { setAppDefinition } = useAppDefinition();
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [savedState, setSavedState] = useState<FormState>(initialFormState);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [backendHealth, setBackendHealth] = useState<string>("loading");
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatusRecord | null>(null);
  const [deviceProfiles, setDeviceProfiles] = useState<DeviceSettingsProfileRecord[]>([]);
  const [packageStatus, setPackageStatus] = useState<PackageStatus | null>(null);
  const [packageMessage, setPackageMessage] = useState("");
  const [packageError, setPackageError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [databasePathNote, setDatabasePathNote] = useState("SQLite database path is startup-only. Change DATABASE_URL and restart the backend to use another database.");

  const formErrors = useMemo(() => validateForm(formState), [formState]);
  const formWarnings = useMemo(() => buildWarnings(formState), [formState]);
  const hasValidationErrors = Object.keys(formErrors).length > 0;
  const isDirty = JSON.stringify(formState) !== JSON.stringify(savedState);
  const piperStatus = findVoiceEngineStatus(voiceStatus, "piper");
  const mockStatus = findVoiceEngineStatus(voiceStatus, "mock");
  const packageActionRunning = Boolean(packageStatus?.running);

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
        setDeviceProfiles(settings.device_profiles);
        setBackendHealth(health.status);
        setVoiceStatus(voice);
        const packageInfo = await window.desktop?.getPackageStatus();
        if (packageInfo) {
          setPackageStatus(packageInfo);
        }
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

  const runPackageAction = async (action: "build" | "reinstall" | "buildAndReinstall") => {
    try {
      setPackageError("");
      setPackageMessage(
        action === "build"
          ? "Building .deb and AppImage..."
          : action === "reinstall"
            ? "Starting Linux reinstall..."
            : "Building packages, then reinstalling the newest .deb...",
      );

      const result = action === "build"
        ? await window.desktop?.runLinuxPackage()
        : action === "reinstall"
          ? await window.desktop?.reinstallLinuxPackage()
          : await window.desktop?.packageAndReinstallLinux();

      if (!result) {
        setPackageError("Desktop packaging actions are unavailable in this environment.");
        return;
      }

      setPackageStatus(result);
      if (result.ok) {
        setPackageMessage(result.message);
      } else {
        setPackageError(result.message);
        setPackageMessage("");
      }
    } catch (error) {
      setPackageError(error instanceof Error ? error.message : "Packaging action failed.");
      setPackageMessage("");
    }
  };

  const refreshPackageStatus = async () => {
    const result = await window.desktop?.getPackageStatus();
    if (result) {
      setPackageStatus(result);
      setPackageMessage("Package status refreshed.");
      setPackageError("");
    }
  };

  const openReleaseFolder = async () => {
    const result = await window.desktop?.openReleaseFolder();
    if (result) {
      setPackageMessage(result.ok ? `Opened ${result.path}` : result.message || "Could not open release folder.");
    }
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
      const savedWithDefinition = await updateAppDefinition(buildAppDefinitionPayload(formState));
      setAppDefinition(savedWithDefinition.app_definition);
      const nextFormState = buildFormState(savedWithDefinition || saved);
      setFormState(nextFormState);
      setSavedState(nextFormState);
      setDeviceProfiles(savedWithDefinition.device_profiles);
      setStatusMessage("Settings saved. App definition files were updated for this clone.");
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

  const saveCurrentDeviceProfile = async () => {
    const errors = validateForm(formState);
    if (Object.keys(errors).length > 0) {
      setSaveError("Fix validation errors before saving a device profile.");
      return;
    }

    try {
      setIsSaving(true);
      setSaveError("");
      setStatusMessage("Saving device profile...");
      const saved = await saveDeviceProfile(buildDeviceProfilePayload(formState));
      const nextFormState = buildFormState(saved);
      setFormState(nextFormState);
      setSavedState(nextFormState);
      setDeviceProfiles(saved.device_profiles);
      setStatusMessage(`Device profile saved for ${saved.selected_device_name}.`);
      const voice = await getVoiceStatus();
      setVoiceStatus(voice);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save device profile.");
    } finally {
      setIsSaving(false);
    }
  };

  const applySelectedDeviceProfile = async () => {
    const deviceName = formState.selectedDeviceName.trim();
    if (!deviceName) {
      setSaveError("Choose a saved device profile first.");
      return;
    }

    try {
      setIsSaving(true);
      setSaveError("");
      setStatusMessage("Applying device profile...");
      const saved = await applyDeviceProfile(deviceName);
      const nextFormState = buildFormState(saved);
      setFormState(nextFormState);
      setSavedState(nextFormState);
      setDeviceProfiles(saved.device_profiles);
      setStatusMessage(`Device profile applied for ${saved.selected_device_name}.`);
      const voice = await getVoiceStatus();
      setVoiceStatus(voice);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not apply device profile.");
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
        description="Define the cloned app identity, then tune local runtime paths. App Definition also updates project metadata files."
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

            <div className="space-y-5 rounded-box border border-base-300 bg-base-200/40 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">App Definition</p>
                <h2 className="mt-2 text-xl font-semibold text-base-content">Clone identity</h2>
                <p className="mt-1 text-sm text-base-content/70">
                  These fields make a cloned project feel like its own app. Saving updates the live UI plus package metadata and starter project files.
                </p>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <label className="form-control gap-2">
                  <span className="label-text font-medium">Package Name</span>
                  <input
                    type="text"
                    className={`input input-bordered ${formErrors.packageName ? "input-error" : ""}`}
                    value={formState.packageName}
                    onChange={(event) => setField("packageName", event.target.value)}
                    disabled={isLoading || isSaving}
                    placeholder="my-new-app"
                  />
                  {formErrors.packageName ? <span className="label-text-alt text-error">{formErrors.packageName}</span> : null}
                  <span className="label-text-alt text-base-content/60">Updates root and frontend package metadata.</span>
                </label>

                <label className="form-control gap-2">
                  <span className="label-text font-medium">Version</span>
                  <input
                    type="text"
                    className={`input input-bordered ${formErrors.appVersion ? "input-error" : ""}`}
                    value={formState.appVersion}
                    onChange={(event) => setField("appVersion", event.target.value)}
                    disabled={isLoading || isSaving}
                    placeholder="0.1.0"
                  />
                  {formErrors.appVersion ? <span className="label-text-alt text-error">{formErrors.appVersion}</span> : null}
                </label>

                <label className="form-control gap-2 lg:col-span-2">
                  <span className="label-text font-medium">App Display Name</span>
                  <input
                    type="text"
                    className={`input input-bordered ${formErrors.appDisplayName ? "input-error" : ""}`}
                    value={formState.appDisplayName}
                    onChange={(event) => setField("appDisplayName", event.target.value)}
                    disabled={isLoading || isSaving}
                    placeholder="My New App"
                  />
                  {formErrors.appDisplayName ? <span className="label-text-alt text-error">{formErrors.appDisplayName}</span> : null}
                  <span className="label-text-alt text-base-content/60">Updates the browser title, README title, and environment examples.</span>
                </label>

                <label className="form-control gap-2">
                  <span className="label-text font-medium">Sidebar Eyebrow</span>
                  <input
                    type="text"
                    className={`input input-bordered ${formErrors.sidebarEyebrow ? "input-error" : ""}`}
                    value={formState.sidebarEyebrow}
                    onChange={(event) => setField("sidebarEyebrow", event.target.value)}
                    disabled={isLoading || isSaving}
                  />
                  {formErrors.sidebarEyebrow ? <span className="label-text-alt text-error">{formErrors.sidebarEyebrow}</span> : null}
                </label>

                <label className="form-control gap-2">
                  <span className="label-text font-medium">Sidebar Title</span>
                  <input
                    type="text"
                    className={`input input-bordered ${formErrors.sidebarTitle ? "input-error" : ""}`}
                    value={formState.sidebarTitle}
                    onChange={(event) => setField("sidebarTitle", event.target.value)}
                    disabled={isLoading || isSaving}
                  />
                  {formErrors.sidebarTitle ? <span className="label-text-alt text-error">{formErrors.sidebarTitle}</span> : null}
                </label>

                <label className="form-control gap-2 lg:col-span-2">
                  <span className="label-text font-medium">Sidebar Description</span>
                  <input
                    type="text"
                    className={`input input-bordered ${formErrors.sidebarDescription ? "input-error" : ""}`}
                    value={formState.sidebarDescription}
                    onChange={(event) => setField("sidebarDescription", event.target.value)}
                    disabled={isLoading || isSaving}
                  />
                  {formErrors.sidebarDescription ? <span className="label-text-alt text-error">{formErrors.sidebarDescription}</span> : null}
                </label>

                <label className="form-control gap-2">
                  <span className="label-text font-medium">Topbar Eyebrow</span>
                  <input
                    type="text"
                    className={`input input-bordered ${formErrors.topbarEyebrow ? "input-error" : ""}`}
                    value={formState.topbarEyebrow}
                    onChange={(event) => setField("topbarEyebrow", event.target.value)}
                    disabled={isLoading || isSaving}
                  />
                  {formErrors.topbarEyebrow ? <span className="label-text-alt text-error">{formErrors.topbarEyebrow}</span> : null}
                </label>

                <label className="form-control gap-2">
                  <span className="label-text font-medium">Topbar Title</span>
                  <input
                    type="text"
                    className={`input input-bordered ${formErrors.topbarTitle ? "input-error" : ""}`}
                    value={formState.topbarTitle}
                    onChange={(event) => setField("topbarTitle", event.target.value)}
                    disabled={isLoading || isSaving}
                  />
                  {formErrors.topbarTitle ? <span className="label-text-alt text-error">{formErrors.topbarTitle}</span> : null}
                </label>

                <label className="form-control gap-2">
                  <span className="label-text font-medium">Home Eyebrow</span>
                  <input
                    type="text"
                    className={`input input-bordered ${formErrors.homeEyebrow ? "input-error" : ""}`}
                    value={formState.homeEyebrow}
                    onChange={(event) => setField("homeEyebrow", event.target.value)}
                    disabled={isLoading || isSaving}
                  />
                  {formErrors.homeEyebrow ? <span className="label-text-alt text-error">{formErrors.homeEyebrow}</span> : null}
                </label>

                <label className="form-control gap-2">
                  <span className="label-text font-medium">Home Title</span>
                  <input
                    type="text"
                    className={`input input-bordered ${formErrors.homeTitle ? "input-error" : ""}`}
                    value={formState.homeTitle}
                    onChange={(event) => setField("homeTitle", event.target.value)}
                    disabled={isLoading || isSaving}
                  />
                  {formErrors.homeTitle ? <span className="label-text-alt text-error">{formErrors.homeTitle}</span> : null}
                </label>

                <label className="form-control gap-2 lg:col-span-2">
                  <span className="label-text font-medium">Home Description</span>
                  <textarea
                    className={`textarea textarea-bordered min-h-24 ${formErrors.homeDescription ? "textarea-error" : ""}`}
                    value={formState.homeDescription}
                    onChange={(event) => setField("homeDescription", event.target.value)}
                    disabled={isLoading || isSaving}
                  />
                  {formErrors.homeDescription ? <span className="label-text-alt text-error">{formErrors.homeDescription}</span> : null}
                </label>
              </div>
            </div>

            <div className="space-y-5 rounded-box border border-base-300 bg-base-200/40 p-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">Device Profiles</p>
                <h2 className="mt-2 text-xl font-semibold text-base-content">Local machine settings</h2>
                <p className="mt-1 text-sm text-base-content/70">
                  Save Whisper, Piper, TTS, and audio paths per computer. Pick a saved device after cloning on another machine to restore that machine&apos;s local paths.
                </p>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <label className="form-control gap-2">
                  <span className="label-text font-medium">Device Name</span>
                  <input
                    type="text"
                    className={`input input-bordered ${formErrors.deviceName ? "input-error" : ""}`}
                    value={formState.deviceName}
                    onChange={(event) => setField("deviceName", event.target.value)}
                    disabled={isLoading || isSaving}
                    placeholder="this-computer"
                  />
                  {formErrors.deviceName ? <span className="label-text-alt text-error">{formErrors.deviceName}</span> : null}
                  <span className="label-text-alt text-base-content/60">Auto-filled from this computer&apos;s hostname; rename it if you want a friendlier label.</span>
                </label>

                <label className="form-control gap-2">
                  <span className="label-text font-medium">Saved Device Profiles</span>
                  <select
                    className="select select-bordered"
                    value={formState.selectedDeviceName}
                    onChange={(event) => setField("selectedDeviceName", event.target.value)}
                    disabled={isLoading || isSaving || deviceProfiles.length === 0}
                  >
                    {deviceProfiles.length === 0 ? <option value="">No saved devices yet</option> : null}
                    {deviceProfiles.map((profile) => (
                      <option key={profile.device_name} value={profile.device_name}>
                        {profile.device_name}
                      </option>
                    ))}
                  </select>
                  <span className="label-text-alt text-base-content/60">Applying a profile replaces the local path fields below.</span>
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={isLoading || isSaving || hasValidationErrors}
                  onClick={saveCurrentDeviceProfile}
                >
                  Save Current Device Profile
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isLoading || isSaving || !formState.selectedDeviceName || deviceProfiles.length === 0}
                  onClick={applySelectedDeviceProfile}
                >
                  Apply Selected Profile
                </button>
                <p className="text-sm text-base-content/60">
                  Profiles are stored in SQLite for this clone, so you can keep entries for all machines you use.
                </p>
              </div>
            </div>

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
                <span className="label-text-alt text-base-content/60">Saved exactly as selected. Piper is never silently changed back to Mock.</span>
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
                {formWarnings.piperBinaryPath ? <span className="label-text-alt text-warning">{formWarnings.piperBinaryPath}</span> : null}
                <span className="label-text-alt text-base-content/60">
                  Choose the Piper executable itself, usually named <span className="font-mono">piper</span>. If you do not have one installed yet, keep TTS Engine set to Mock.
                </span>
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
                {formWarnings.piperModelPath ? <span className="label-text-alt text-warning">{formWarnings.piperModelPath}</span> : null}
                <span className="label-text-alt text-base-content/60">
                  Choose the Piper voice <span className="font-mono">.onnx</span> file. Do not choose the matching <span className="font-mono">.onnx.json</span> metadata file.
                </span>
              </label>

              <label className="form-control gap-2">
                <span className="label-text font-medium">TTS Timeout Seconds</span>
                <input
                  type="number"
                  min={1}
                  className={`input input-bordered ${formErrors.ttsTimeoutSeconds ? "input-error" : ""}`}
                  value={formState.ttsTimeoutSeconds}
                  onChange={(event) => setField("ttsTimeoutSeconds", event.target.value)}
                  disabled={isLoading || isSaving}
                />
                {formErrors.ttsTimeoutSeconds ? <span className="label-text-alt text-error">{formErrors.ttsTimeoutSeconds}</span> : null}
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
                <span className="label-text font-medium">TTS Output Directory</span>
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
                <span className="label-text-alt text-base-content/60">Used for generated TTS audio files from Voice Lab.</span>
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
            <h2 className="card-title text-xl">Build & Package</h2>

            <div className="rounded-box bg-base-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">Linux Outputs</p>
              <p className="mt-3 text-sm text-base-content/70">
                Build both a Debian installer and an AppImage for this Linux machine. Reinstall uses the newest generated <span className="font-mono">.deb</span>.
              </p>

              <div className="mt-4 grid gap-2">
                <button
                  type="button"
                  className={`btn btn-primary btn-sm ${packageActionRunning && packageStatus?.action === "Build Linux packages" ? "loading" : ""}`}
                  disabled={packageActionRunning}
                  onClick={() => runPackageAction("build")}
                >
                  Build .deb + AppImage
                </button>
                <button
                  type="button"
                  className={`btn btn-secondary btn-sm ${packageActionRunning && packageStatus?.action === "Install latest .deb" ? "loading" : ""}`}
                  disabled={packageActionRunning}
                  onClick={() => runPackageAction("reinstall")}
                >
                  Reinstall Latest .deb
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={packageActionRunning}
                  onClick={() => runPackageAction("buildAndReinstall")}
                >
                  Build Then Reinstall
                </button>
              </div>

              {packageMessage ? (
                <div className="alert alert-success mt-4 py-2">
                  <span className="text-xs">{packageMessage}</span>
                </div>
              ) : null}

              {packageError ? (
                <div className="alert alert-error mt-4 py-2">
                  <span className="text-xs">{packageError}</span>
                </div>
              ) : null}

              {packageStatus?.running ? (
                <div className="alert mt-4 py-2">
                  <span className="loading loading-spinner loading-xs" />
                  <span className="text-xs">{packageStatus.action} started at {packageStatus.startedAt}</span>
                </div>
              ) : null}
            </div>

            <div className="rounded-box bg-base-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">Artifacts</p>
              {packageStatus?.artifacts.length ? (
                <div className="mt-3 space-y-2">
                  {packageStatus.artifacts.map((artifact) => (
                    <div key={artifact.path} className="rounded border border-base-300 bg-base-100 p-2">
                      <p className="truncate text-sm font-medium">{artifact.name}</p>
                      <p className="text-xs text-base-content/60">{formatFileSize(artifact.sizeBytes)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-base-content/60">No release artifacts found yet.</p>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn btn-outline btn-xs" onClick={refreshPackageStatus} disabled={packageActionRunning}>
                  Refresh
                </button>
                <button type="button" className="btn btn-outline btn-xs" onClick={openReleaseFolder}>
                  Open Release
                </button>
                <button type="button" className="btn btn-outline btn-xs" onClick={async () => {
                  const result = await window.desktop?.openLogsFolder();
                  if (result) {
                    setPackageMessage(result.ok ? `Opened ${result.path}` : result.message || "Could not open logs folder.");
                  }
                }}>
                  Open Logs
                </button>
              </div>

              {packageStatus ? (
                <div className="mt-4 space-y-1 text-xs text-base-content/60">
                  <p className="break-all"><span className="font-medium">Release:</span> {packageStatus.releaseDir}</p>
                  <p className="break-all"><span className="font-medium">Log:</span> {packageStatus.logsPath}</p>
                </div>
              ) : null}
            </div>

            <div className="divider my-1" />

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
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">TTS Readiness</p>
              {voiceStatus ? (
                <div className="mt-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Mock</p>
                      <p className="mt-1 text-xs text-base-content/60">{mockStatus?.message || "Mock TTS is available for testing."}</p>
                    </div>
                    <span className="badge badge-success">ready</span>
                  </div>

                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Piper</p>
                      <p className="mt-1 text-xs text-base-content/60">{piperStatus?.message || "Piper status is not available."}</p>
                    </div>
                    <span className={`badge ${piperStatus?.available ? "badge-success" : "badge-warning"}`}>
                      {piperStatus?.available ? "ready" : "not configured"}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-base-content/50">TTS readiness is not available yet.</p>
              )}
            </div>

            <div className="alert alert-info">
              <span className="text-sm">
                Run <span className="font-mono">npm run tts:check</span> in a terminal to verify Piper. The desktop app does not run npm scripts for you.
              </span>
            </div>

            <div className="rounded-box bg-base-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">Resolution Order</p>
              <p className="mt-3 text-sm text-base-content/70">
                Environment variables act as defaults. Saved local settings override those defaults for later STT/TTS requests. Only the SQLite database path requires editing the backend environment and restarting.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
