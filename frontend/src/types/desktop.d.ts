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
}
