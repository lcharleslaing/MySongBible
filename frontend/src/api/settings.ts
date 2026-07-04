import { buildApiUrl, parseJsonResponse } from "./client";

export type SettingsRecord = {
  app_name: string;
  app_env: string;
  database_url: string;
  sqlite_database_path: string;
  app_data_dir: string;
  whisper_cpp_binary: string | null;
  whisper_model_path: string | null;
  whisper_thread_count: number;
  keep_uploaded_audio_files: boolean;
  default_stt_model: string | null;
  default_tts_engine: string;
};

export type SettingsUpdatePayload = {
  whisper_cpp_binary: string | null;
  whisper_model_path: string | null;
  default_tts_engine: string;
  sqlite_database_path: string;
};

export async function getSettings() {
  const response = await fetch(buildApiUrl("/api/settings"));
  return parseJsonResponse<SettingsRecord>(response);
}

export async function updateSettings(payload: SettingsUpdatePayload) {
  const response = await fetch(buildApiUrl("/api/settings"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<SettingsRecord>(response);
}
