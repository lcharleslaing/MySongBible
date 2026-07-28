import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

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
import { AppLockSettings } from "../components/app-lock/AppLockSettings";
import { HomePageSettingsCard } from "../components/settings/HomePageSettingsCard";

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
  installStatus: {
    packageName: string;
    installed: boolean;
    version: string | null;
  };
};

type ReadinessState = "Ready" | "Not Ready" | "Checking" | "Error";
type IdentityStep = 0 | 1 | 2 | 3;
type LocalSettingsStep = 0 | 1 | 2 | 3;

const identityKeys = [
  "packageName", "appVersion", "appDisplayName", "sidebarEyebrow", "sidebarTitle",
  "sidebarDescription", "topbarEyebrow", "topbarTitle", "homeEyebrow", "homeTitle", "homeDescription",
] as const;

const identityStepKeys: Record<IdentityStep, readonly (keyof FormState)[]> = {
  0: ["packageName", "appVersion", "appDisplayName"],
  1: ["sidebarEyebrow", "sidebarTitle", "sidebarDescription", "topbarEyebrow", "topbarTitle"],
  2: ["homeEyebrow", "homeTitle", "homeDescription"],
  3: [],
};

function mergeIdentity(target: FormState, source: FormState): FormState {
  const merged = { ...target };
  identityKeys.forEach((key) => { merged[key] = source[key]; });
  return merged;
}

function readinessBadge(state: ReadinessState) {
  const badgeClass = {
    Ready: "badge-success",
    "Not Ready": "badge-warning",
    Checking: "badge-ghost",
    Error: "badge-error",
  }[state];

  return <span className={`badge ${badgeClass}`}>{state}</span>;
}

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

function shellQuote(value: string) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function findNewestDebArtifact(artifacts: PackageArtifact[]) {
  return artifacts
    .filter((artifact) => artifact.name.endsWith(".deb"))
    .sort((left, right) => new Date(right.modifiedAt).getTime() - new Date(left.modifiedAt).getTime())[0] || null;
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
  const [appIcon, setAppIcon] = useState<AppIconResult | null>(null);
  const [iconMessage, setIconMessage] = useState("");
  const [isPickingIcon, setIsPickingIcon] = useState(false);
  const [databasePathNote, setDatabasePathNote] = useState("SQLite database path is startup-only. Change DATABASE_URL and restart the backend to use another database.");
  const [identityStep, setIdentityStep] = useState<IdentityStep>(0);
  const [identityDraft, setIdentityDraft] = useState<FormState>(initialFormState);
  const [isIdentityOpen, setIsIdentityOpen] = useState(false);
  const [identityError, setIdentityError] = useState("");
  const [identityMessage, setIdentityMessage] = useState("");
  const [localSettingsStep, setLocalSettingsStep] = useState<LocalSettingsStep>(0);
  const [isLocalSettingsOpen, setIsLocalSettingsOpen] = useState(false);
  const [localSettingsError, setLocalSettingsError] = useState("");
  const [localSettingsMessage, setLocalSettingsMessage] = useState("");

  const formErrors = useMemo(() => validateForm(formState), [formState]);
  const formWarnings = useMemo(() => buildWarnings(formState), [formState]);
  const piperStatus = findVoiceEngineStatus(voiceStatus, "piper");
  const mockStatus = findVoiceEngineStatus(voiceStatus, "mock");
  const packageActionRunning = Boolean(packageStatus?.running);
  const newestDebArtifact = packageStatus ? findNewestDebArtifact(packageStatus.artifacts) : null;
  const installCommand = newestDebArtifact ? `sudo apt install -y ${shellQuote(newestDebArtifact.path)}` : "";
  const backendReadiness: ReadinessState = statusError
    ? "Error"
    : isLoading
      ? "Checking"
      : backendHealth === "ok"
        ? "Ready"
        : "Not Ready";
  const whisperReadiness: ReadinessState = statusError
    ? "Error"
    : isLoading || !voiceStatus
      ? "Checking"
      : voiceStatus.stt_ready
        ? "Ready"
        : "Not Ready";
  const piperReadiness: ReadinessState = statusError
    ? "Error"
    : isLoading || !voiceStatus
      ? "Checking"
      : piperStatus?.available
        ? "Ready"
        : "Not Ready";

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

  useEffect(() => {
    window.desktop?.getAppIcon()
      .then(setAppIcon)
      .catch(() => setIconMessage("App icon preview is only available in the desktop app."));
  }, []);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
    setSaveError("");
  };

  const openIdentityEditor = () => {
    setIdentityDraft(formState);
    setIdentityStep(0);
    setIdentityError("");
    setIdentityMessage("");
    setIsIdentityOpen(true);
  };

  const setIdentityField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setIdentityDraft((current) => ({ ...current, [key]: value }));
    setIdentityError("");
  };

  const saveIdentityStep = async () => {
    const errors = validateForm(identityDraft);
    const stepError = identityStepKeys[identityStep].find((key) => errors[key]);
    if (stepError) {
      setIdentityError(errors[stepError] || "Complete the required fields before continuing.");
      return;
    }

    try {
      setIsSaving(true);
      setIdentityError("");
      if (identityStep < 3) {
        setIdentityMessage(`${["Basics", "Navigation", "Home screen"][identityStep]} ready.`);
        setIdentityStep((identityStep + 1) as IdentityStep);
      } else {
        const saved = await updateAppDefinition(buildAppDefinitionPayload(identityDraft));
        const savedIdentity = buildFormState(saved);
        setAppDefinition(saved.app_definition);
        setFormState((current) => mergeIdentity(current, savedIdentity));
        setSavedState((current) => mergeIdentity(current, savedIdentity));
        setIdentityDraft((current) => mergeIdentity(current, savedIdentity));
        setIsIdentityOpen(false);
        setStatusMessage("App Identity is up to date.");
      }
    } catch (error) {
      setIdentityError(error instanceof Error ? error.message : "Could not save App Identity.");
    } finally {
      setIsSaving(false);
    }
  };

  const closeLocalSettings = () => {
    setFormState(savedState);
    setIsLocalSettingsOpen(false);
    setLocalSettingsError("");
    setLocalSettingsMessage("");
  };

  const saveLocalSettingsStep = async () => {
    const stepKeys: Record<LocalSettingsStep, readonly (keyof FormState)[]> = {
      0: ["deviceName"],
      1: ["whisperThreadCount"],
      2: ["ttsEngine", "ttsTimeoutSeconds"],
      3: ["audioInputDirectory", "audioOutputDirectory", "sqliteDatabasePath"],
    };
    const errors = validateForm(formState);
    const stepError = stepKeys[localSettingsStep].find((key) => errors[key]);
    if (stepError) {
      setLocalSettingsError(errors[stepError] || "Complete the required fields before continuing.");
      return;
    }

    try {
      setIsSaving(true);
      setLocalSettingsError("");
      const saved = localSettingsStep === 0
        ? await saveDeviceProfile(buildDeviceProfilePayload(formState))
        : await updateSettings(buildPayload(formState));
      const nextState = mergeIdentity(buildFormState(saved), formState);
      setFormState(nextState);
      setSavedState(nextState);
      setDeviceProfiles(saved.device_profiles);
      if (localSettingsStep < 3) {
        setLocalSettingsMessage(`${["Device profile", "Speech-to-text", "Text-to-speech"][localSettingsStep]} saved.`);
        setLocalSettingsStep((localSettingsStep + 1) as LocalSettingsStep);
      } else {
        setIsLocalSettingsOpen(false);
        setStatusMessage("Local machine settings are up to date.");
      }
      setVoiceStatus(await getVoiceStatus());
    } catch (error) {
      setLocalSettingsError(error instanceof Error ? error.message : "Could not save local machine settings.");
    } finally {
      setIsSaving(false);
    }
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

  const copyInstallCommand = async () => {
    if (!installCommand) {
      setPackageError("No .deb artifact found yet. Build Linux packages first.");
      return;
    }

    try {
      await navigator.clipboard.writeText(installCommand);
      setPackageMessage("Install command copied. Paste it into a new terminal to install or replace the app.");
      setPackageError("");
    } catch {
      setPackageError("Could not copy automatically. Select the command text and copy it manually.");
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

  const pickAppIcon = async () => {
    try {
      setIsPickingIcon(true);
      setIconMessage("");
      const result = await window.desktop?.pickAppIcon();
      if (!result || result.canceled) {
        return;
      }
      setAppIcon(result);
      setIconMessage(result.message || (result.ok ? "App icon updated." : "Could not update the app icon."));
    } catch (error) {
      setIconMessage(error instanceof Error ? error.message : "Could not update the app icon.");
    } finally {
      setIsPickingIcon(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Application settings"
        description="Manage everyday preferences, voice and audio tools, local AI, and developer-only template features."
      />

      <AppLockSettings />

      <section aria-labelledby="settings-destinations" className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">Configuration</p>
          <h2 id="settings-destinations" className="mt-1 text-2xl font-semibold">Settings and tools</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <article className="card border border-base-300 bg-base-100 shadow-sm">
            <div className="card-body">
              <h3 className="card-title">Voice and Audio</h3>
              <p className="text-sm text-base-content/70">
                Record or upload audio, transcribe speech, and synthesize speech with configured engines. Piper is a local text-to-speech engine, not voice cloning.
              </p>
              <div className="mt-1 flex flex-wrap gap-2" aria-label="Voice and audio readiness">
                {readinessBadge(whisperReadiness)}
                <span className="text-sm text-base-content/70">Whisper STT</span>
                {readinessBadge(piperReadiness)}
                <span className="text-sm text-base-content/70">Piper TTS</span>
              </div>
              <div className="card-actions mt-auto justify-end">
                <Link to="/voice-lab" className="btn btn-primary btn-sm">Open Voice Lab</Link>
              </div>
            </div>
          </article>

          <article className="card border border-base-300 bg-base-100 shadow-sm">
            <div className="card-body">
              <h3 className="card-title">Local AI</h3>
              <p className="text-sm text-base-content/70">
                Configure local model paths, providers, runtime services, and test actions in the full setup interface.
              </p>
              <dl className="mt-1 grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 text-sm">
                <dt>Whisper STT</dt><dd>{readinessBadge(whisperReadiness)}</dd>
                <dt>Piper TTS</dt><dd>{readinessBadge(piperReadiness)}</dd>
                <dt>Local AI Chat</dt><dd>{readinessBadge("Not Ready")}</dd>
                <dt>Backend service</dt><dd>{readinessBadge(backendReadiness)}</dd>
              </dl>
              <div className="card-actions mt-auto justify-end">
                <Link to="/local-ai-setup" className="btn btn-primary btn-sm">Open Local AI Setup</Link>
              </div>
            </div>
          </article>

          <article className="card border border-warning/50 bg-warning/5 shadow-sm md:col-span-2 xl:col-span-1">
            <div className="card-body">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="card-title">Template Tools</h3>
                <span className="badge badge-warning">Developer tool</span>
              </div>
              <p className="text-sm text-base-content/70">
                Clone App creates a new application from AppTemplateBase. It is intended for template maintainers and developers, not normal day-to-day use.
              </p>
              <div className="card-actions mt-auto justify-end">
                <Link to="/clone-app" className="btn btn-warning btn-sm">Open Clone App</Link>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <div className="card border border-base-300 bg-base-100 shadow-sm xl:col-span-2">
          <div className="card-body gap-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">General</p>
              <h2 className="mt-1 text-xl font-semibold">Application and storage preferences</h2>
              <p className="mt-1 text-sm text-base-content/70">Manage the existing application identity, device, runtime path, and storage settings below.</p>
            </div>
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

            <div className="rounded-box border border-base-300 bg-base-200/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="avatar">
                    <div className="h-14 w-14 rounded-xl bg-base-300 shadow-sm">
                      {appIcon?.dataUrl ? <img src={appIcon.dataUrl} alt="Current application icon" /> : null}
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">App Identity</p>
                    <h2 className="mt-1 truncate text-xl font-semibold text-base-content">{formState.appDisplayName}</h2>
                    <p className="truncate text-sm text-base-content/60">{formState.packageName} · v{formState.appVersion}</p>
                  </div>
                </div>
                <button type="button" className="btn btn-primary btn-sm" onClick={openIdentityEditor} disabled={isLoading || isSaving}>
                  Edit
                </button>
              </div>
            </div>

            {isIdentityOpen ? (
              <dialog className="modal modal-open" aria-labelledby="app-identity-title">
                <div className="modal-box max-w-3xl">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">App Identity</p>
                      <h2 id="app-identity-title" className="mt-1 text-2xl font-semibold">Edit app identity</h2>
                      <p className="mt-1 text-sm text-base-content/60">Review each step, then save all identity changes when you finish.</p>
                    </div>
                    <button type="button" className="btn btn-circle btn-ghost btn-sm" aria-label="Close App Identity editor" onClick={() => setIsIdentityOpen(false)} disabled={isSaving}>✕</button>
                  </div>

                  <ul className="steps steps-horizontal my-6 w-full text-xs">
                    {["Basics", "Navigation", "Home", "Icon"].map((label, index) => (
                      <li key={label} className={`step ${index <= identityStep ? "step-primary" : ""}`}>{label}</li>
                    ))}
                  </ul>

                  {identityMessage ? <div className="alert alert-success mb-4 py-3 text-sm">{identityMessage}</div> : null}
                  {identityError ? <div className="alert alert-error mb-4 py-3 text-sm">{identityError}</div> : null}

                  {identityStep === 0 ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="form-control gap-2"><span className="label-text font-medium">Package Name</span><input autoFocus type="text" className={`input input-bordered ${validateForm(identityDraft).packageName ? "input-error" : ""}`} value={identityDraft.packageName} onChange={(event) => setIdentityField("packageName", event.target.value)} /><span className="label-text-alt">Lowercase npm-safe name.</span></label>
                      <label className="form-control gap-2"><span className="label-text font-medium">Version</span><input type="text" className={`input input-bordered ${validateForm(identityDraft).appVersion ? "input-error" : ""}`} value={identityDraft.appVersion} onChange={(event) => setIdentityField("appVersion", event.target.value)} placeholder="0.1.0" /></label>
                      <label className="form-control gap-2 md:col-span-2"><span className="label-text font-medium">App Display Name</span><input type="text" className={`input input-bordered ${validateForm(identityDraft).appDisplayName ? "input-error" : ""}`} value={identityDraft.appDisplayName} onChange={(event) => setIdentityField("appDisplayName", event.target.value)} /></label>
                    </div>
                  ) : null}

                  {identityStep === 1 ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="form-control gap-2"><span className="label-text font-medium">Sidebar Eyebrow</span><input autoFocus className="input input-bordered" value={identityDraft.sidebarEyebrow} onChange={(event) => setIdentityField("sidebarEyebrow", event.target.value)} /></label>
                      <label className="form-control gap-2"><span className="label-text font-medium">Sidebar Title</span><input className="input input-bordered" value={identityDraft.sidebarTitle} onChange={(event) => setIdentityField("sidebarTitle", event.target.value)} /></label>
                      <label className="form-control gap-2 md:col-span-2"><span className="label-text font-medium">Sidebar Description</span><input className="input input-bordered" value={identityDraft.sidebarDescription} onChange={(event) => setIdentityField("sidebarDescription", event.target.value)} /></label>
                      <label className="form-control gap-2"><span className="label-text font-medium">Topbar Eyebrow</span><input className="input input-bordered" value={identityDraft.topbarEyebrow} onChange={(event) => setIdentityField("topbarEyebrow", event.target.value)} /></label>
                      <label className="form-control gap-2"><span className="label-text font-medium">Topbar Title</span><input className="input input-bordered" value={identityDraft.topbarTitle} onChange={(event) => setIdentityField("topbarTitle", event.target.value)} /></label>
                    </div>
                  ) : null}

                  {identityStep === 2 ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="form-control gap-2"><span className="label-text font-medium">Home Eyebrow</span><input autoFocus className="input input-bordered" value={identityDraft.homeEyebrow} onChange={(event) => setIdentityField("homeEyebrow", event.target.value)} /></label>
                      <label className="form-control gap-2"><span className="label-text font-medium">Home Title</span><input className="input input-bordered" value={identityDraft.homeTitle} onChange={(event) => setIdentityField("homeTitle", event.target.value)} /></label>
                      <label className="form-control gap-2 md:col-span-2"><span className="label-text font-medium">Home Description</span><textarea className="textarea textarea-bordered min-h-28" value={identityDraft.homeDescription} onChange={(event) => setIdentityField("homeDescription", event.target.value)} /></label>
                    </div>
                  ) : null}

                  {identityStep === 3 ? (
                    <div className="flex flex-col items-center gap-5 rounded-box border border-base-300 bg-base-200/40 p-6 text-center sm:flex-row sm:text-left">
                      <div className="avatar"><div className="h-28 w-28 rounded-2xl bg-base-300 shadow-sm">{appIcon?.dataUrl ? <img src={appIcon.dataUrl} alt="Current application icon" /> : null}</div></div>
                      <div className="flex-1"><h3 className="font-semibold">Application icon</h3><p className="mt-1 text-sm text-base-content/70">Choose a PNG, JPEG, or WebP image at least 512 × 512 pixels. Icon changes are applied when selected.</p>{iconMessage ? <p className={`mt-2 text-sm ${appIcon?.ok === false ? "text-error" : "text-success"}`}>{iconMessage}</p> : null}</div>
                      <button type="button" className="btn btn-outline" onClick={pickAppIcon} disabled={isPickingIcon || !window.desktop}>{isPickingIcon ? "Choosing…" : "Choose Icon"}</button>
                    </div>
                  ) : null}

                  <div className="modal-action mt-6 justify-between">
                    <button type="button" className="btn btn-ghost" onClick={() => { setIdentityError(""); setIdentityMessage(""); setIdentityStep((identityStep - 1) as IdentityStep); }} disabled={identityStep === 0 || isSaving}>Back</button>
                    <button type="button" className="btn btn-primary" onClick={saveIdentityStep} disabled={isSaving}>{isSaving ? "Saving…" : identityStep === 3 ? "Save & Finish" : "Continue"}</button>
                  </div>
                </div>
                <button type="button" className="modal-backdrop" aria-label="Close App Identity editor" onClick={() => setIsIdentityOpen(false)}>close</button>
              </dialog>
            ) : null}
            <HomePageSettingsCard disabled={isLoading || isSaving} />
            <div className="rounded-box border border-base-300 bg-base-200/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">Local Machine</p><h2 className="mt-1 text-xl font-semibold">Device, voice and storage</h2><p className="mt-1 text-sm text-base-content/60">{formState.deviceName || "This device"} · Whisper {formState.whisperThreadCount} threads · {formState.ttsEngine === "piper" ? "Piper TTS" : "Mock TTS"}</p></div>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => { setLocalSettingsStep(0); setLocalSettingsError(""); setLocalSettingsMessage(""); setIsLocalSettingsOpen(true); }} disabled={isLoading || isSaving}>Edit</button>
              </div>
            </div>

            {isLocalSettingsOpen ? <dialog className="modal modal-open" aria-labelledby="local-settings-title"><div className="modal-box max-w-4xl">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">Local Machine</p><h2 id="local-settings-title" className="mt-1 text-2xl font-semibold">Edit local settings</h2><p className="mt-1 text-sm text-base-content/60">Each step is saved before you continue.</p></div><button type="button" className="btn btn-circle btn-ghost btn-sm" onClick={closeLocalSettings} disabled={isSaving}>✕</button></div>
              <ul className="steps steps-horizontal my-6 w-full text-xs">{["Device", "Speech-to-Text", "Text-to-Speech", "Storage"].map((label, index) => <li key={label} className={`step ${index <= localSettingsStep ? "step-primary" : ""}`}>{label}</li>)}</ul>
              {localSettingsMessage ? <div className="alert alert-success mb-4 py-3 text-sm">{localSettingsMessage}</div> : null}
              {localSettingsError ? <div className="alert alert-error mb-4 py-3 text-sm">{localSettingsError}</div> : null}

            {localSettingsStep === 0 ? <div className="space-y-5 rounded-box border border-base-300 bg-base-200/40 p-4">
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
                  className="btn btn-secondary"
                  disabled={isLoading || isSaving || !formState.selectedDeviceName || deviceProfiles.length === 0}
                  onClick={applySelectedDeviceProfile}
                >
                  Apply Selected Profile
                </button>
                <p className="text-sm text-base-content/60">
                  Save &amp; Continue stores this device profile. Applying a saved profile replaces the remaining local settings in this editor.
                </p>
              </div>
            </div> : null}

            <div className={localSettingsStep === 1 ? "grid gap-5 lg:grid-cols-2" : "hidden"}>
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

            </div>

            <div className={localSettingsStep === 2 ? "grid gap-5 lg:grid-cols-2" : "hidden"}>
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

            </div>

            <div className={localSettingsStep === 3 ? "grid gap-5 lg:grid-cols-2" : "hidden"}>
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

            <div className="modal-action justify-between">
              <button type="button" className="btn btn-ghost" onClick={() => { setLocalSettingsError(""); setLocalSettingsMessage(""); setLocalSettingsStep((localSettingsStep - 1) as LocalSettingsStep); }} disabled={localSettingsStep === 0 || isSaving}>Back</button>
              <button type="button" className="btn btn-primary" onClick={saveLocalSettingsStep} disabled={isSaving}>{isSaving ? "Saving…" : localSettingsStep === 3 ? "Save & Finish" : "Save & Continue"}</button>
            </div>
          </div><button type="button" className="modal-backdrop" onClick={closeLocalSettings}>close</button></dialog> : null}
          </div>
        </div>

        <div className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body gap-4">
            <h2 className="card-title text-xl">Build & Package</h2>

            <div className="rounded-box bg-base-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">Linux Outputs</p>
                  {packageStatus ? (
                    <p className="mt-1 text-xs text-base-content/60">
                      Debian package: <span className="font-mono">{packageStatus.installStatus.packageName}</span>
                    </p>
                  ) : null}
                </div>
                {packageStatus ? (
                  <span className={`badge ${packageStatus.installStatus.installed ? "badge-success" : "badge-warning"}`}>
                    {packageStatus.installStatus.installed
                      ? `Installed${packageStatus.installStatus.version ? ` ${packageStatus.installStatus.version}` : ""}`
                      : "Not installed"}
                  </span>
                ) : (
                  <span className="badge badge-ghost">Checking install</span>
                )}
              </div>
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

              <div className="mt-4 rounded border border-base-300 bg-base-100 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-base-content/60">Terminal Install Command</p>
                {installCommand ? (
                  <>
                    <pre className="mt-2 max-w-full overflow-x-auto rounded bg-base-300 p-2 text-xs"><code>{installCommand}</code></pre>
                    <p className="mt-2 text-xs text-base-content/60">
                      Open a fresh terminal, paste this command, and enter your password when Linux asks.
                    </p>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-base-content/60">
                    Build Linux packages first, then this will show the exact install command for the newest <span className="font-mono">.deb</span>.
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn-outline btn-xs mt-3"
                  disabled={!installCommand}
                  onClick={copyInstallCommand}
                >
                  Copy Install Command
                </button>
              </div>

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
