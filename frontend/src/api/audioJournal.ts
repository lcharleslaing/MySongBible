import { buildApiUrl, parseJsonResponse } from "./client";

export type AudioJournalTakeRecord = {
  id: number;
  entry_id: number;
  take_number: number;
  take_type: string;
  created_at: string;
  audio_path: string;
  audio_filename: string;
  transcript_text: string | null;
  transcript_source: string;
  transcription_status: string;
  transcription_engine: string | null;
  transcription_model: string | null;
  duration_seconds: number | null;
  sample_rate: number | null;
  channels: number | null;
  file_format: string | null;
  quality_status: string;
  quality_score: number | null;
  quality_summary: string | null;
  quality_reasons_json: string | null;
  noise_floor_db: number | null;
  rms_db: number | null;
  peak_db: number | null;
  clipping_detected: boolean;
  silence_ratio: number | null;
  snr_estimate_db: number | null;
  is_active: boolean;
  is_training_candidate: boolean;
  training_quality: string | null;
  script_match_score: number | null;
  metadata_json: string | null;
};

export type AudioJournalEntryRecord = {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  journal_date: string;
  script_text: string | null;
  original_transcript_text: string | null;
  notes: string | null;
  tags_json: string | null;
  voice_style: string | null;
  active_take_id: number | null;
  selected_training_take_id: number | null;
  overall_quality_status: string;
  metadata_json: string | null;
  takes: AudioJournalTakeRecord[];
};

export type AudioQualityBaselineRecord = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
  source_audio_path: string;
  source_audio_filename: string;
  notes: string | null;
  device_label: string | null;
  environment_label: string | null;
  sample_rate: number | null;
  channels: number | null;
  duration_seconds: number | null;
  file_format: string | null;
  peak_db: number | null;
  rms_db: number | null;
  noise_floor_db: number | null;
  snr_estimate_db: number | null;
  silence_ratio: number | null;
  clipping_detected: boolean;
  quality_score: number | null;
  is_default: boolean;
  metadata_json: string | null;
};

export type AudioQualityBaselineListResponse = {
  items: AudioQualityBaselineRecord[];
};

export type AudioQualityBaselineUpdatePayload = Partial<{
  name: string;
  notes: string | null;
  device_label: string | null;
  environment_label: string | null;
  is_default: boolean;
  metadata_json: string | null;
}>;

export type AudioJournalEntryUpdatePayload = Partial<{
  title: string;
  journal_date: string;
  script_text: string | null;
  original_transcript_text: string | null;
  notes: string | null;
  tags_json: string | null;
  voice_style: string | null;
  active_take_id: number | null;
  selected_training_take_id: number | null;
  overall_quality_status: string;
  metadata_json: string | null;
}>;

export type AudioJournalTakeUpdatePayload = Partial<{
  transcript_text: string | null;
  transcript_source: string | null;
  transcription_status: string | null;
  transcription_engine: string | null;
  transcription_model: string | null;
  quality_status: string | null;
  quality_score: number | null;
  quality_summary: string | null;
  quality_reasons_json: string | null;
  is_training_candidate: boolean | null;
  training_quality: string | null;
  script_match_score: number | null;
  metadata_json: string | null;
}>;

export type AudioJournalTrainingCandidatePayload = {
  is_training_candidate: boolean;
  manual_override?: boolean;
  reason?: string | null;
};

export type AudioJournalListResponse = {
  items: AudioJournalEntryRecord[];
};

export type AudioJournalUploadResponse = {
  entry: AudioJournalEntryRecord;
  take: AudioJournalTakeRecord;
};

export async function listAudioJournalEntries() {
  const response = await fetch(await buildApiUrl("/api/audio-journal"));
  return parseJsonResponse<AudioJournalListResponse>(response);
}

export async function getAudioJournalEntry(entryId: number) {
  const response = await fetch(await buildApiUrl(`/api/audio-journal/${entryId}`));
  return parseJsonResponse<AudioJournalEntryRecord>(response);
}

export async function listAudioQualityBaselines() {
  const response = await fetch(await buildApiUrl("/api/audio-journal/baselines"));
  return parseJsonResponse<AudioQualityBaselineListResponse>(response);
}

export async function createAudioQualityBaseline(formData: FormData) {
  const response = await fetch(await buildApiUrl("/api/audio-journal/baselines"), {
    method: "POST",
    body: formData,
  });

  return parseJsonResponse<AudioQualityBaselineRecord>(response);
}

export async function updateAudioQualityBaseline(baselineId: number, payload: AudioQualityBaselineUpdatePayload) {
  const response = await fetch(await buildApiUrl(`/api/audio-journal/baselines/${baselineId}`), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<AudioQualityBaselineRecord>(response);
}

export async function deleteAudioQualityBaseline(baselineId: number) {
  const response = await fetch(await buildApiUrl(`/api/audio-journal/baselines/${baselineId}?delete_audio=true`), {
    method: "DELETE",
  });

  if (!response.ok) {
    await parseJsonResponse(response);
  }
}

export async function setDefaultAudioQualityBaseline(baselineId: number) {
  const response = await fetch(await buildApiUrl(`/api/audio-journal/baselines/${baselineId}/set-default`), {
    method: "POST",
  });

  return parseJsonResponse<AudioQualityBaselineRecord>(response);
}

export async function buildAudioQualityBaselineAudioUrl(baselineId: number) {
  return buildApiUrl(`/api/audio-journal/baselines/${baselineId}/audio`);
}

export async function createAudioJournalEntry(formData: FormData) {
  const response = await fetch(await buildApiUrl("/api/audio-journal"), {
    method: "POST",
    body: formData,
  });

  return parseJsonResponse<AudioJournalUploadResponse>(response);
}

export async function updateAudioJournalEntry(entryId: number, payload: AudioJournalEntryUpdatePayload) {
  const response = await fetch(await buildApiUrl(`/api/audio-journal/${entryId}`), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<AudioJournalEntryRecord>(response);
}

export async function deleteAudioJournalEntry(entryId: number) {
  const response = await fetch(await buildApiUrl(`/api/audio-journal/${entryId}`), {
    method: "DELETE",
  });

  if (!response.ok) {
    await parseJsonResponse(response);
  }
}

export async function listAudioJournalTakes(entryId: number) {
  const response = await fetch(await buildApiUrl(`/api/audio-journal/${entryId}/takes`));
  return parseJsonResponse<AudioJournalTakeRecord[]>(response);
}

export async function createAudioJournalTake(entryId: number, formData: FormData) {
  const response = await fetch(await buildApiUrl(`/api/audio-journal/${entryId}/takes`), {
    method: "POST",
    body: formData,
  });

  return parseJsonResponse<AudioJournalTakeRecord>(response);
}

export async function updateAudioJournalTake(
  entryId: number,
  takeId: number,
  payload: AudioJournalTakeUpdatePayload,
) {
  const response = await fetch(await buildApiUrl(`/api/audio-journal/${entryId}/takes/${takeId}`), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<AudioJournalTakeRecord>(response);
}

export async function deleteAudioJournalTake(entryId: number, takeId: number) {
  const response = await fetch(await buildApiUrl(`/api/audio-journal/${entryId}/takes/${takeId}`), {
    method: "DELETE",
  });

  if (!response.ok) {
    await parseJsonResponse(response);
  }
}

export async function transcribeAudioJournalTake(entryId: number, takeId: number) {
  const response = await fetch(await buildApiUrl(`/api/audio-journal/${entryId}/takes/${takeId}/transcribe`), {
    method: "POST",
  });

  return parseJsonResponse<AudioJournalUploadResponse>(response);
}

export async function analyzeAudioJournalTake(entryId: number, takeId: number) {
  const response = await fetch(await buildApiUrl(`/api/audio-journal/${entryId}/takes/${takeId}/analyze-quality`), {
    method: "POST",
  });

  return parseJsonResponse<AudioJournalTakeRecord>(response);
}

export async function setActiveAudioJournalTake(entryId: number, takeId: number) {
  const response = await fetch(await buildApiUrl(`/api/audio-journal/${entryId}/takes/${takeId}/set-active`), {
    method: "POST",
  });

  return parseJsonResponse<AudioJournalTakeRecord>(response);
}

export async function setAudioJournalTrainingCandidate(
  entryId: number,
  takeId: number,
  payload: AudioJournalTrainingCandidatePayload,
) {
  const response = await fetch(await buildApiUrl(`/api/audio-journal/${entryId}/takes/${takeId}/training-candidate`), {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<AudioJournalTakeRecord>(response);
}

export async function buildAudioJournalTakeAudioUrl(entryId: number, takeId: number) {
  return buildApiUrl(`/api/audio-journal/${entryId}/takes/${takeId}/audio`);
}
