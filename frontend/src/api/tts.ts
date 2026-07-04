import { buildApiUrl, parseJsonResponse } from "./client";

export type TtsSynthesisRecord = {
  job_id: number;
  audio_file_path: string;
  audio_file_url: string | null;
  engine_used: string;
  status: string;
};

export async function synthesizeSpeech(input: {
  text: string;
  voice_profile?: string;
  engine?: string;
}) {
  const response = await fetch(buildApiUrl("/api/tts/synthesize"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJsonResponse<TtsSynthesisRecord>(response);
}
