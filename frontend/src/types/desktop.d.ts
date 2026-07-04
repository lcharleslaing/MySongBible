export {};

declare global {
  interface Window {
    desktop: {
      getAppVersion: () => Promise<string>;
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
      pickSqliteDatabase: () => Promise<{
        canceled: boolean;
        path: string | null;
      }>;
    };
  }
}
