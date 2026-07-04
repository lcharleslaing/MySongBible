import { buildApiUrl, parseJsonResponse } from "./client";

export type TranscriptRecord = {
  id: number;
  title: string;
  transcript_text: string;
  source_audio_path: string | null;
  source_audio_name: string | null;
  language: string | null;
  stt_engine: string;
  stt_model: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function transcribeAudioRecording(input: {
  audioBlob: Blob;
  fileName: string;
  title?: string;
  language?: string;
}) {
  const formData = new FormData();
  formData.append("audio_file", input.audioBlob, input.fileName);

  if (input.title) {
    formData.append("title", input.title);
  }

  if (input.language) {
    formData.append("language", input.language);
  }

  const response = await fetch(await buildApiUrl("/api/stt/transcribe"), {
    method: "POST",
    body: formData,
  });

  return parseJsonResponse<TranscriptRecord>(response);
}
