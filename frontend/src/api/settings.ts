import { buildApiUrl, parseJsonResponse } from "./client";

export type SettingsRecord = {
  app_name: string;
  app_env: string;
  app_definition: AppDefinitionRecord;
  home_page: HomePageSettingsRecord;
  current_device_name: string;
  selected_device_name: string;
  device_profiles: DeviceSettingsProfileRecord[];
  database_url: string;
  sqlite_database_path: string;
  app_data_dir: string;
  whisper_cpp_binary: string | null;
  whisper_model_path: string | null;
  whisper_thread_count: number;
  audio_input_dir: string;
  keep_uploaded_audio_files: boolean;
  default_stt_model: string | null;
  tts_engine: string;
  piper_binary: string | null;
  piper_model_path: string | null;
  tts_output_dir: string | null;
  tts_timeout_seconds: number;
  database_path_editable: boolean;
  database_path_note: string;
};

export type DeviceSettingsProfileRecord = {
  device_name: string;
  whisper_cpp_binary: string | null;
  whisper_model_path: string | null;
  whisper_thread_count: number;
  tts_engine: string;
  piper_binary: string | null;
  piper_model_path: string | null;
  audio_input_dir: string;
  tts_output_dir: string;
  tts_timeout_seconds: number;
};

export type AppDefinitionRecord = {
  package_name: string;
  app_version: string;
  app_display_name: string;
  sidebar_eyebrow: string;
  sidebar_title: string;
  sidebar_description: string;
  topbar_eyebrow: string;
  topbar_title: string;
  home_eyebrow: string;
  home_title: string;
  home_description: string;
};

export type HomeAppRecord = {
  id: string;
  label: string;
  description: string;
  path: string;
  badge: string;
};

export type HomePageSettingsRecord = {
  show_marketing_on_startup: boolean;
  marketing_eyebrow: string;
  marketing_title: string;
  marketing_description: string;
  apps: HomeAppRecord[];
};

export type SettingsUpdatePayload = {
  whisper_cpp_binary: string | null;
  whisper_model_path: string | null;
  whisper_thread_count: number;
  tts_engine: string;
  piper_binary: string | null;
  piper_model_path: string | null;
  audio_input_dir: string;
  tts_output_dir: string;
  tts_timeout_seconds: number;
};

export async function getSettings() {
  const response = await fetch(await buildApiUrl("/api/settings"));
  return parseJsonResponse<SettingsRecord>(response);
}

export async function updateSettings(payload: SettingsUpdatePayload) {
  const response = await fetch(await buildApiUrl("/api/settings"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<SettingsRecord>(response);
}

export async function updateAppDefinition(payload: AppDefinitionRecord) {
  const response = await fetch(await buildApiUrl("/api/settings/app-definition"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<SettingsRecord>(response);
}

export async function updateHomePage(payload: HomePageSettingsRecord) {
  const response = await fetch(await buildApiUrl("/api/settings/home-page"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse<SettingsRecord>(response);
}

export async function saveDeviceProfile(payload: DeviceSettingsProfileRecord) {
  const response = await fetch(await buildApiUrl("/api/settings/device-profile"), {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<SettingsRecord>(response);
}

export async function applyDeviceProfile(deviceName: string) {
  const response = await fetch(await buildApiUrl("/api/settings/device-profile/apply"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ device_name: deviceName }),
  });

  return parseJsonResponse<SettingsRecord>(response);
}
