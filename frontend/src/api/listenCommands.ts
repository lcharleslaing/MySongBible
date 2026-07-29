import { buildApiUrl, parseJsonResponse } from "./client";

export type VoiceTriggerAliasRecord = {
  id: number;
  trigger_id: number;
  phrase: string;
  normalized_phrase: string;
  created_at: string;
  updated_at: string;
};

export type VoiceTriggerAssetRecord = {
  id: number;
  managed_relative_path: string;
  original_filename: string;
  stored_filename: string;
  mime_type: string;
  file_size: number;
  width: number | null;
  height: number | null;
  trigger_id: number | null;
  created_at: string;
  updated_at: string;
};

export type VoiceTriggerRecord = {
  id: number;
  primary_phrase: string;
  normalized_phrase: string;
  title: string;
  description: string | null;
  content_json: Record<string, unknown> | null;
  category: string | null;
  tags_json: string[];
  color: string | null;
  match_mode: string;
  case_sensitive: boolean;
  strict_mode: boolean;
  enabled: boolean;
  duplicate_cooldown_seconds: number | null;
  image_asset_id: number | null;
  settings_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  aliases: VoiceTriggerAliasRecord[];
  image_asset: VoiceTriggerAssetRecord | null;
};

export type SessionContentBlockRecord = {
  id: number;
  session_id: number;
  order_index: number;
  block_type: string;
  status: string;
  transcript_segment_id: number | null;
  trigger_id: number | null;
  activation_event_id: number | null;
  title: string | null;
  content: string | null;
  image_asset_id: number | null;
  image_reference: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TriggerActivationRecord = {
  id: number;
  session_id: number;
  trigger_id: number | null;
  alias_id: number | null;
  transcript_segment_id: number | null;
  order_index: number;
  spoken_phrase: string;
  matched_alias: string | null;
  match_mode: string;
  detected_at: string;
  transcript_position_start: number | null;
  transcript_position_end: number | null;
  snapshot_title: string;
  snapshot_content: string | null;
  snapshot_image_asset_id: number | null;
  snapshot_image_reference: string | null;
  removed: boolean;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type TranscriptSegmentRecord = {
  id: number;
  session_id: number;
  order_index: number;
  text: string;
  start_timestamp_ms: number | null;
  end_timestamp_ms: number | null;
  is_final: boolean;
  source: string;
  source_transcript_id: number | null;
  created_at: string;
  updated_at: string;
};

export type ListeningSessionRecord = {
  id: number;
  title: string;
  status: string;
  started_at: string | null;
  stopped_at: string | null;
  created_at: string;
  updated_at: string;
  last_saved_at: string | null;
  duration_seconds: number | null;
  current_order: number;
  transcript_text: string | null;
  notes: string | null;
  tags_json: string[];
  settings_json: Record<string, unknown>;
  autosave_state_json: Record<string, unknown>;
  segments: TranscriptSegmentRecord[];
  blocks: SessionContentBlockRecord[];
  activations: TriggerActivationRecord[];
};

export type TriggerPayload = {
  primary_phrase: string;
  aliases: string[];
  title: string;
  description?: string | null;
  category?: string | null;
  tags?: string[];
  color?: string | null;
  match_mode: string;
  case_sensitive: boolean;
  strict_mode: boolean;
  enabled: boolean;
  duplicate_cooldown_seconds?: number | null;
};

export async function listVoiceTriggers(query = "") {
  const suffix = query ? `?query=${encodeURIComponent(query)}` : "";
  const response = await fetch(await buildApiUrl(`/api/listen-commands/triggers${suffix}`));
  return parseJsonResponse<{ items: VoiceTriggerRecord[] }>(response);
}

export async function createVoiceTrigger(payload: TriggerPayload) {
  const response = await fetch(await buildApiUrl("/api/listen-commands/triggers"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse<VoiceTriggerRecord>(response);
}

export async function updateVoiceTrigger(triggerId: number, payload: Partial<TriggerPayload>) {
  const response = await fetch(await buildApiUrl(`/api/listen-commands/triggers/${triggerId}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse<VoiceTriggerRecord>(response);
}

export async function duplicateVoiceTrigger(triggerId: number) {
  const response = await fetch(await buildApiUrl(`/api/listen-commands/triggers/${triggerId}/duplicate`), {
    method: "POST",
  });
  return parseJsonResponse<VoiceTriggerRecord>(response);
}

export async function deleteVoiceTrigger(triggerId: number) {
  const response = await fetch(await buildApiUrl(`/api/listen-commands/triggers/${triggerId}`), { method: "DELETE" });
  if (!response.ok) {
    await parseJsonResponse(response);
  }
}

export async function uploadVoiceTriggerImage(triggerId: number, imageFile: File) {
  const formData = new FormData();
  formData.append("image_file", imageFile, imageFile.name);
  const response = await fetch(await buildApiUrl(`/api/listen-commands/triggers/${triggerId}/image`), {
    method: "POST",
    body: formData,
  });
  return parseJsonResponse<VoiceTriggerAssetRecord>(response);
}

export async function buildVoiceTriggerAssetUrl(assetId: number) {
  return buildApiUrl(`/api/listen-commands/assets/${assetId}`);
}

export async function listListeningSessions() {
  const response = await fetch(await buildApiUrl("/api/listen-commands/sessions"));
  return parseJsonResponse<{ items: ListeningSessionRecord[] }>(response);
}

export async function listIncompleteListeningSessions() {
  const response = await fetch(await buildApiUrl("/api/listen-commands/sessions/incomplete"));
  return parseJsonResponse<{ items: ListeningSessionRecord[] }>(response);
}

export async function createListeningSession(input: { title?: string; status?: string; settings_json?: Record<string, unknown> }) {
  const response = await fetch(await buildApiUrl("/api/listen-commands/sessions"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJsonResponse<ListeningSessionRecord>(response);
}

export async function updateListeningSession(sessionId: number, payload: Partial<{ title: string; status: string; notes: string; settings_json: Record<string, unknown> }>) {
  const response = await fetch(await buildApiUrl(`/api/listen-commands/sessions/${sessionId}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse<ListeningSessionRecord>(response);
}

export async function deleteListeningSession(sessionId: number) {
  const response = await fetch(await buildApiUrl(`/api/listen-commands/sessions/${sessionId}`), {
    method: "DELETE",
  });
  if (!response.ok) {
    await parseJsonResponse(response);
  }
}

export async function appendTranscriptSegment(sessionId: number, payload: { text: string; is_final?: boolean; source?: string; source_transcript_id?: number | null; insertion_block_id?: number | null; insertion_offset?: number | null }) {
  const response = await fetch(await buildApiUrl(`/api/listen-commands/sessions/${sessionId}/segments`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      is_final: true,
      source: "manual",
      ...payload,
    }),
  });
  return parseJsonResponse<{ session: ListeningSessionRecord; segment: TranscriptSegmentRecord; activations: TriggerActivationRecord[]; blocks: SessionContentBlockRecord[] }>(response);
}

export async function addManualBlock(sessionId: number, payload: { block_type: string; title?: string | null; content?: string | null }) {
  const response = await fetch(await buildApiUrl(`/api/listen-commands/sessions/${sessionId}/blocks`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse<SessionContentBlockRecord>(response);
}

export async function updateSessionBlock(blockId: number, payload: Partial<{ title: string; content: string; status: string; order_index: number }>) {
  const response = await fetch(await buildApiUrl(`/api/listen-commands/blocks/${blockId}`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse<SessionContentBlockRecord>(response);
}

export async function manuallyInsertVoiceTrigger(sessionId: number, triggerId: number, payload: { insertion_block_id?: number | null; insertion_offset?: number | null } = {}) {
  const response = await fetch(await buildApiUrl(`/api/listen-commands/sessions/${sessionId}/triggers/${triggerId}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse<TriggerActivationRecord>(response);
}

export async function exportVoiceTriggers() {
  const response = await fetch(await buildApiUrl("/api/listen-commands/triggers-export"));
  return parseJsonResponse<{ version: number; triggers: VoiceTriggerRecord[] }>(response);
}

export async function importVoiceTriggers(payload: { version: number; triggers: TriggerPayload[] }) {
  const response = await fetch(await buildApiUrl("/api/listen-commands/triggers-import"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJsonResponse<{ imported_count: number; skipped_count: number; conflict_count: number; conflicts: string[] }>(response);
}
