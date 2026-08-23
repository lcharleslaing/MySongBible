export {};

declare global {
  interface Window {
    desktop: {
      getAppVersion: () => Promise<string>;
      getBackendBaseUrl: () => Promise<string>;
      checkBackendHealth: () => Promise<{
        ok: boolean;
        status: number | null;
        payload?: unknown;
        message?: string;
      }>;
      openLogsFolder: () => Promise<{
        ok: boolean;
        path: string;
        message: string | null;
      }>;
      openReleaseFolder: () => Promise<{
        ok: boolean;
        path: string;
        message: string | null;
      }>;
      getPackageStatus: () => Promise<PackageStatusResult>;
      runLinuxPackage: () => Promise<PackageActionResult>;
      reinstallLinuxPackage: () => Promise<PackageActionResult>;
      packageAndReinstallLinux: () => Promise<PackageActionResult>;
      getTemplateUpdateStatus: (options?: { fetch?: boolean }) => Promise<TemplateUpdateStatusResult>;
      mergeTemplateUpdates: () => Promise<TemplateUpdateStatusResult>;
      saveAndMergeTemplateUpdates: () => Promise<TemplateUpdateStatusResult>;
      getAppIcon: () => Promise<AppIconResult>;
      pickAppIcon: () => Promise<AppIconResult & { canceled: boolean }>;
      localAi: {
        getStatus: () => Promise<LocalAiStatusResult>;
        runAction: (payload: LocalAiRunActionPayload) => Promise<LocalAiActionResult>;
        getLogTail: () => Promise<{
          logPath: string;
          lastLines: string[];
        }>;
        openLogsFolder: () => Promise<{
          ok: boolean;
          path: string;
          message: string | null;
        }>;
      };
      pickWhisperBinary: () => Promise<{
        canceled: boolean;
        path: string | null;
      }>;
      pickWhisperModel: () => Promise<{
        canceled: boolean;
        path: string | null;
      }>;
      pickPiperBinary: () => Promise<{
        canceled: boolean;
        path: string | null;
      }>;
      pickPiperModel: () => Promise<{
        canceled: boolean;
        path: string | null;
      }>;
      pickAudioInputDirectory: () => Promise<{
        canceled: boolean;
        path: string | null;
      }>;
      pickAudioOutputDirectory: () => Promise<{
        canceled: boolean;
        path: string | null;
      }>;
      pickCloneDirectory: () => Promise<{
        canceled: boolean;
        path: string | null;
      }>;
    };
    quickGematria: {
      calculate: (input: string) => Promise<QuickGematriaResult>;
      transcribe: (payload: QuickGematriaTranscribePayload) => Promise<{
        text: string;
      }>;
      hide: () => Promise<{ ok: boolean }>;
      onOpened: (callback: () => void) => () => void;
      getAutostart: () => Promise<QuickGematriaAutostartSettings>;
      setAutostart: (enabled: boolean) => Promise<QuickGematriaAutostartSettings>;
    };
  }

  type PackageArtifact = {
    name: string;
    path: string;
    sizeBytes: number;
    modifiedAt: string;
  };

  type PackageStatusResult = {
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

  type PackageActionResult = PackageStatusResult & {
    ok: boolean;
    message: string;
  };

  type AppIconResult = {
    ok: boolean;
    path: string;
    dataUrl: string | null;
    message: string | null;
  };

  type TemplateUpdateStatusResult = {
    ok: boolean;
    configured: boolean;
    upstreamUrl: string | null;
    branch: string | null;
    incomingCount: number;
    commits: string[];
    worktreeClean: boolean;
    canMerge: boolean;
    merged?: boolean;
    localChangesSaved?: boolean;
    localSaveCommit?: string | null;
    message: string;
  };

  type LocalAiActionId =
    | "setup-whisper"
    | "setup-piper"
    | "setup-local-ai"
    | "check-stt"
    | "check-tts"
    | "check-local-ai";

  type LocalAiJobStatus =
    | "idle"
    | "running"
    | "succeeded"
    | "failed"
    | "timed_out";

  type LocalAiRunActionPayload = {
    action: LocalAiActionId;
    dryRun?: boolean;
    force?: boolean;
  };

  type LocalAiStatusResult = {
    running: boolean;
    action: LocalAiActionId | null;
    startedAt: string | null;
    finishedAt: string | null;
    exitCode: number | null;
    status: LocalAiJobStatus;
    message: string;
    logPath: string;
    lastLines: string[];
    passCount: number;
    warnCount: number;
    failCount: number;
  };

  type LocalAiActionResult = LocalAiStatusResult & {
    ok: boolean;
    message: string;
  };

  type QuickGematriaBreakdown = {
    character: string;
    simple: number;
    english: number;
    jewish: number;
  };

  type QuickGematriaResult = {
    input: string;
    normalized: string;
    simple: number;
    english: number;
    jewish: number;
    breakdown: QuickGematriaBreakdown[];
  };

  type QuickGematriaTranscribePayload = {
    audioBytes: number[];
    mimeType: string;
  };

  type QuickGematriaAutostartSettings = {
    openAtLogin: boolean;
    openAsHidden?: boolean;
    wasOpenedAtLogin?: boolean;
    wasOpenedAsHidden?: boolean;
    restoreState?: boolean;
    status?: string;
    executableWillLaunchAtLogin?: boolean;
    launchItems?: Array<{
      name: string;
      path: string;
      args: string[];
      scope?: string;
      enabled?: boolean;
    }>;
  };
}
