import { buildApiUrl, parseJsonResponse } from "./client";

export type BackendHealthRecord = {
  status: string;
};

export type VoiceStatusRecord = {
  status: string;
  stt_engine: string;
  tts_engine: string;
  whisper_cpp_binary: string | null;
  whisper_model_path: string | null;
  piper_binary: string | null;
  piper_model_path: string | null;
  message: string;
};

export async function getBackendHealth() {
  const response = await fetch(buildApiUrl("/api/health"));
  return parseJsonResponse<BackendHealthRecord>(response);
}

export async function getVoiceStatus() {
  const response = await fetch(buildApiUrl("/api/voice/status"));
  return parseJsonResponse<VoiceStatusRecord>(response);
}
