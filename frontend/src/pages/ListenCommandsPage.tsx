import { ChangeEvent, useEffect, useMemo, useState } from "react";

import { ApiError } from "../api/client";
import { transcribeAudioRecording } from "../api/stt";
import {
  addManualBlock,
  appendTranscriptSegment,
  buildVoiceTriggerAssetUrl,
  createListeningSession,
  createVoiceTrigger,
  deleteVoiceTrigger,
  duplicateVoiceTrigger,
  exportVoiceTriggers,
  importVoiceTriggers,
  listIncompleteListeningSessions,
  listListeningSessions,
  listVoiceTriggers,
  manuallyInsertVoiceTrigger,
  updateListeningSession,
  updateSessionBlock,
  updateVoiceTrigger,
  uploadVoiceTriggerImage,
  type ListeningSessionRecord,
  type SessionContentBlockRecord,
  type TriggerPayload,
  type VoiceTriggerRecord,
} from "../api/listenCommands";
import { PageHeader } from "../components/ui/PageHeader";
import { useAudioRecorder } from "../features/voice-lab/useAudioRecorder";

type TabId = "listen" | "library" | "sessions" | "settings" | "help";

type TriggerForm = {
  primary_phrase: string;
  aliases: string;
  title: string;
  description: string;
  category: string;
  tags: string;
  color: string;
  match_mode: string;
  case_sensitive: boolean;
  strict_mode: boolean;
  enabled: boolean;
  duplicate_cooldown_seconds: string;
};

const blankTriggerForm: TriggerForm = {
  primary_phrase: "",
  aliases: "",
  title: "",
  description: "",
  category: "",
  tags: "",
  color: "",
  match_mode: "whole_phrase",
  case_sensitive: false,
  strict_mode: false,
  enabled: true,
  duplicate_cooldown_seconds: "",
};

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    return error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not saved";
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formToPayload(form: TriggerForm): TriggerPayload {
  return {
    primary_phrase: form.primary_phrase,
    aliases: form.aliases.split("\n").map((item) => item.trim()).filter(Boolean),
    title: form.title || form.primary_phrase,
    description: form.description || null,
    category: form.category || null,
    tags: form.tags.split(",").map((item) => item.trim()).filter(Boolean),
    color: form.color || null,
    match_mode: form.match_mode,
    case_sensitive: form.case_sensitive,
    strict_mode: form.strict_mode,
    enabled: form.enabled,
    duplicate_cooldown_seconds: form.duplicate_cooldown_seconds ? Number(form.duplicate_cooldown_seconds) : null,
  };
}

function triggerToForm(trigger: VoiceTriggerRecord): TriggerForm {
  return {
    primary_phrase: trigger.primary_phrase,
    aliases: trigger.aliases.map((alias) => alias.phrase).join("\n"),
    title: trigger.title,
    description: trigger.description || "",
    category: trigger.category || "",
    tags: trigger.tags_json.join(", "),
    color: trigger.color || "",
    match_mode: trigger.match_mode,
    case_sensitive: trigger.case_sensitive,
    strict_mode: trigger.strict_mode,
    enabled: trigger.enabled,
    duplicate_cooldown_seconds: trigger.duplicate_cooldown_seconds?.toString() || "",
  };
}

function buildMarkdown(session: ListeningSessionRecord) {
  return [
    `# ${session.title}`,
    "",
    ...session.blocks.filter((block) => block.status !== "deleted").map((block) => {
      if (block.block_type === "trigger") {
        return [`## ${block.title || "Triggered content"}`, block.content || "", block.image_reference ? `Image: ${block.image_reference}` : ""].filter(Boolean).join("\n\n");
      }
      if (block.block_type === "heading") {
        return `## ${block.title || block.content || ""}`;
      }
      return block.content || "";
    }),
  ].join("\n\n");
}

export function ListenCommandsPage() {
  const recorder = useAudioRecorder();
  const [activeTab, setActiveTab] = useState<TabId>("listen");
  const [triggers, setTriggers] = useState<VoiceTriggerRecord[]>([]);
  const [sessions, setSessions] = useState<ListeningSessionRecord[]>([]);
  const [incompleteSessions, setIncompleteSessions] = useState<ListeningSessionRecord[]>([]);
  const [currentSession, setCurrentSession] = useState<ListeningSessionRecord | null>(null);
  const [editingTrigger, setEditingTrigger] = useState<VoiceTriggerRecord | null>(null);
  const [triggerForm, setTriggerForm] = useState<TriggerForm>(blankTriggerForm);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [manualText, setManualText] = useState("");
  const [noteText, setNoteText] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [assetUrls, setAssetUrls] = useState<Record<number, string>>({});
  const [settings, setSettings] = useState({
    duplicate_cooldown_seconds: 4,
    keep_trigger_words: true,
    trigger_detection_enabled: true,
    images_expanded: true,
    show_timestamps: true,
    automatic_save: true,
    strict_matching: false,
  });

  const listeningState = recorder.recorderError ? "Microphone unavailable" : recorder.isRecording ? (recorder.isPaused ? "Paused" : "Listening") : currentSession?.status === "stopped" ? "Stopped" : "Idle";
  const activeBlocks = useMemo(() => currentSession?.blocks.filter((block) => block.status !== "deleted") || [], [currentSession]);

  const loadData = async () => {
    const [triggerResponse, sessionResponse, incompleteResponse] = await Promise.all([
      listVoiceTriggers(query),
      listListeningSessions(),
      listIncompleteListeningSessions(),
    ]);
    setTriggers(triggerResponse.items);
    setSessions(sessionResponse.items);
    setIncompleteSessions(incompleteResponse.items);
    if (currentSession) {
      const refreshed = sessionResponse.items.find((item) => item.id === currentSession.id);
      if (refreshed) {
        setCurrentSession(refreshed);
      }
    }
  };

  useEffect(() => {
    loadData().catch((nextError) => setError(errorMessage(nextError, "Could not load voice-triggered content.")));
  }, [query]);

  useEffect(() => {
    const missingAssetIds = triggers
      .map((trigger) => trigger.image_asset_id)
      .filter((assetId): assetId is number => Boolean(assetId && !assetUrls[assetId]));
    if (!missingAssetIds.length) {
      return;
    }
    Promise.all(missingAssetIds.map(async (assetId) => [assetId, await buildVoiceTriggerAssetUrl(assetId)] as const))
      .then((pairs) => setAssetUrls((current) => Object.fromEntries([...Object.entries(current), ...pairs])))
      .catch(() => undefined);
  }, [triggers, assetUrls]);

  const run = async (action: () => Promise<void>, fallback: string) => {
    setIsWorking(true);
    setError("");
    try {
      await action();
    } catch (nextError) {
      setError(errorMessage(nextError, fallback));
    } finally {
      setIsWorking(false);
    }
  };

  const startSession = () => run(async () => {
    const session = await createListeningSession({
      status: "active",
      settings_json: {
        trigger_detection_enabled: settings.trigger_detection_enabled,
        duplicate_cooldown_seconds: settings.duplicate_cooldown_seconds,
        keep_trigger_words: settings.keep_trigger_words,
      },
    });
    setCurrentSession(session);
    await recorder.startRecording();
    setStatus("Listening started.");
  }, "Could not start listening.");

  const stopSession = () => run(async () => {
    recorder.stopRecording();
    if (currentSession) {
      setCurrentSession(await updateListeningSession(currentSession.id, { status: "stopped" }));
    }
    setStatus("Listening stopped. Transcribe the recorded segment when ready.");
  }, "Could not stop listening.");

  const transcribeAndAppend = () => run(async () => {
    if (!currentSession || !recorder.audioBlob) {
      return;
    }
    const transcript = await transcribeAudioRecording({
      audioBlob: recorder.audioBlob,
      fileName: recorder.fileName,
      title: `${currentSession.title} segment`,
    });
    const result = await appendTranscriptSegment(currentSession.id, {
      text: transcript.transcript_text,
      source: "whisper.cpp",
      source_transcript_id: transcript.id,
    });
    setCurrentSession(result.session);
    recorder.resetRecording();
    setStatus(`Saved transcript segment with ${result.activations.length} trigger activation${result.activations.length === 1 ? "" : "s"}.`);
  }, "Could not transcribe and save the segment.");

  const appendManualText = () => run(async () => {
    if (!currentSession || !manualText.trim()) {
      return;
    }
    const result = await appendTranscriptSegment(currentSession.id, { text: manualText.trim(), source: "manual" });
    setCurrentSession(result.session);
    setManualText("");
    setStatus(`Saved manual transcript with ${result.activations.length} activation${result.activations.length === 1 ? "" : "s"}.`);
  }, "Could not save transcript text.");

  const saveTrigger = () => run(async () => {
    const saved = editingTrigger
      ? await updateVoiceTrigger(editingTrigger.id, formToPayload(triggerForm))
      : await createVoiceTrigger(formToPayload(triggerForm));
    if (selectedImage) {
      await uploadVoiceTriggerImage(saved.id, selectedImage);
    }
    setTriggerForm(blankTriggerForm);
    setEditingTrigger(null);
    setSelectedImage(null);
    await loadData();
    setStatus("Trigger saved.");
  }, "Could not save trigger.");

  const exportSession = (format: "markdown" | "text" | "json") => {
    if (!currentSession) {
      return;
    }
    const content = format === "json" ? JSON.stringify(currentSession, null, 2) : buildMarkdown(currentSession);
    const type = format === "json" ? "application/json" : "text/plain";
    const extension = format === "json" ? "json" : format === "markdown" ? "md" : "txt";
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${currentSession.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importFile = (event: ChangeEvent<HTMLInputElement>) => run(async () => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const parsed = JSON.parse(await file.text());
    const result = await importVoiceTriggers(parsed);
    await loadData();
    setStatus(`Imported ${result.imported_count}; ${result.conflict_count} conflict${result.conflict_count === 1 ? "" : "s"}.`);
    event.target.value = "";
  }, "Could not import trigger library.");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AppTemplateBase"
        title="Listen Commands"
        description="Record locally, transcribe with the existing local STT backend, and persist trigger activations into SQLite."
      />

      {error ? <div className="alert alert-error text-sm">{error}</div> : null}
      {status ? <div className="alert alert-success text-sm">{status}</div> : null}

      <div className="tabs tabs-boxed w-fit">
        {(["listen", "library", "sessions", "settings", "help"] as TabId[]).map((tab) => (
          <button key={tab} type="button" className={`tab capitalize ${activeTab === tab ? "tab-active" : ""}`} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "listen" ? (
        <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 rounded-box border border-base-300 bg-base-100 p-4">
              <span className={`badge ${recorder.isRecording && !recorder.isPaused ? "badge-error" : "badge-ghost"} gap-2`}>
                {recorder.isRecording && !recorder.isPaused ? <span className="h-2 w-2 rounded-full bg-current" /> : null}
                {listeningState}
              </span>
              <button className="btn btn-primary btn-sm" disabled={isWorking || recorder.isRecording} onClick={startSession}>Start</button>
              <button className="btn btn-ghost btn-sm" disabled={!recorder.isRecording || recorder.isPaused} onClick={recorder.pauseRecording}>Pause</button>
              <button className="btn btn-ghost btn-sm" disabled={!recorder.isPaused} onClick={recorder.resumeRecording}>Resume</button>
              <button className="btn btn-outline btn-sm" disabled={!recorder.isRecording} onClick={stopSession}>Stop</button>
              <button className="btn btn-ghost btn-sm" disabled={!currentSession} onClick={() => currentSession && updateListeningSession(currentSession.id, { status: "finalized" }).then(setCurrentSession)}>Save</button>
              <button className="btn btn-error btn-outline btn-sm" disabled={!currentSession} onClick={() => currentSession && window.confirm("Discard this session?") && updateListeningSession(currentSession.id, { status: "deleted" }).then(() => setCurrentSession(null))}>Discard</button>
            </div>

            {recorder.recorderError ? <div className="alert alert-warning text-sm">{recorder.recorderError}</div> : null}
            {recorder.formatCompatibilityWarning ? <div className="alert text-sm">{recorder.formatCompatibilityWarning}</div> : null}
            {recorder.audioBlob ? (
              <div className="rounded-box border border-base-300 bg-base-100 p-4">
                <audio controls src={recorder.audioUrl} className="w-full" />
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-primary btn-sm" disabled={!currentSession || isWorking} onClick={transcribeAndAppend}>Transcribe and save</button>
                  <button className="btn btn-ghost btn-sm" onClick={recorder.resetRecording}>Clear recording</button>
                </div>
              </div>
            ) : null}

            <div className="rounded-box border border-base-300 bg-base-100 p-4">
              <textarea className="textarea textarea-bordered min-h-24 w-full" value={manualText} onChange={(event) => setManualText(event.target.value)} placeholder="Paste or type a transcript segment to simulate local STT output." />
              <button className="btn btn-secondary btn-sm mt-3" disabled={!currentSession || isWorking} onClick={appendManualText}>Append transcript</button>
            </div>

            <div className="rounded-box border border-base-300 bg-base-100 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-semibold">{currentSession?.title || "No active session"}</h2>
                  <p className="text-sm text-base-content/60">Last saved {formatDate(currentSession?.last_saved_at)}</p>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost btn-xs" disabled={!currentSession} onClick={() => exportSession("markdown")}>Markdown</button>
                  <button className="btn btn-ghost btn-xs" disabled={!currentSession} onClick={() => exportSession("json")}>JSON</button>
                </div>
              </div>
              <div className="space-y-3">
                {activeBlocks.map((block) => <SessionBlock key={block.id} block={block} imageUrl={block.image_asset_id ? assetUrls[block.image_asset_id] : ""} showTimestamps={settings.show_timestamps} onChange={(payload) => updateSessionBlock(block.id, payload).then((updated) => setCurrentSession((session) => session ? { ...session, blocks: session.blocks.map((item) => item.id === updated.id ? updated : item) } : session))} />)}
                {!activeBlocks.length ? <p className="text-sm text-base-content/60">Start listening or append text to build this session.</p> : null}
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            {incompleteSessions.length ? (
              <div className="rounded-box border border-warning/30 bg-warning/10 p-4">
                <h3 className="font-semibold">Incomplete sessions</h3>
                <div className="mt-3 space-y-2">
                  {incompleteSessions.slice(0, 4).map((session) => (
                    <button key={session.id} className="btn btn-ghost btn-sm w-full justify-start" onClick={() => setCurrentSession(session)}>
                      {session.title}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="rounded-box border border-base-300 bg-base-100 p-4">
              <h3 className="font-semibold">Manual insert</h3>
              <div className="mt-3 max-h-[28rem] space-y-2 overflow-auto">
                {triggers.filter((trigger) => trigger.enabled).map((trigger) => (
                  <button key={trigger.id} className="btn btn-outline btn-sm w-full justify-start" disabled={!currentSession} onClick={() => currentSession && manuallyInsertVoiceTrigger(currentSession.id, trigger.id).then(loadData)}>
                    {trigger.title}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-box border border-base-300 bg-base-100 p-4">
              <h3 className="font-semibold">Note</h3>
              <textarea className="textarea textarea-bordered mt-3 min-h-20 w-full" value={noteText} onChange={(event) => setNoteText(event.target.value)} />
              <button className="btn btn-sm mt-3" disabled={!currentSession || !noteText.trim()} onClick={() => currentSession && addManualBlock(currentSession.id, { block_type: "note", content: noteText }).then(() => { setNoteText(""); loadData(); })}>Add note</button>
            </div>
          </aside>
        </section>
      ) : null}

      {activeTab === "library" ? (
        <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-box border border-base-300 bg-base-100 p-4">
            <div className="mb-3 flex gap-2">
              <input className="input input-bordered input-sm w-full" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search triggers" />
              <button className="btn btn-sm" onClick={() => { setEditingTrigger(null); setTriggerForm(blankTriggerForm); }}>New</button>
            </div>
            <div className="space-y-2">
              {triggers.map((trigger) => (
                <button key={trigger.id} className="w-full rounded-box border border-base-300 p-3 text-left hover:border-primary" onClick={() => { setEditingTrigger(trigger); setTriggerForm(triggerToForm(trigger)); }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{trigger.title}</span>
                    <span className={`badge badge-sm ${trigger.enabled ? "badge-success" : "badge-ghost"}`}>{trigger.enabled ? "Enabled" : "Off"}</span>
                  </div>
                  <p className="mt-1 text-xs text-base-content/60">{trigger.primary_phrase}{trigger.aliases.length ? ` +${trigger.aliases.length} aliases` : ""}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-box border border-base-300 bg-base-100 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <input className="input input-bordered" value={triggerForm.primary_phrase} onChange={(event) => setTriggerForm({ ...triggerForm, primary_phrase: event.target.value })} placeholder="Primary phrase" />
              <input className="input input-bordered" value={triggerForm.title} onChange={(event) => setTriggerForm({ ...triggerForm, title: event.target.value })} placeholder="Display title" />
              <input className="input input-bordered" value={triggerForm.category} onChange={(event) => setTriggerForm({ ...triggerForm, category: event.target.value })} placeholder="Category" />
              <input className="input input-bordered" value={triggerForm.tags} onChange={(event) => setTriggerForm({ ...triggerForm, tags: event.target.value })} placeholder="Tags, comma separated" />
              <select className="select select-bordered" value={triggerForm.match_mode} onChange={(event) => setTriggerForm({ ...triggerForm, match_mode: event.target.value })}>
                <option value="exact_phrase">Exact phrase</option>
                <option value="whole_phrase">Whole phrase within sentence</option>
                <option value="flexible">Flexible speech match</option>
              </select>
              <input className="input input-bordered" type="number" min="0" value={triggerForm.duplicate_cooldown_seconds} onChange={(event) => setTriggerForm({ ...triggerForm, duplicate_cooldown_seconds: event.target.value })} placeholder="Cooldown seconds" />
              <textarea className="textarea textarea-bordered min-h-24 md:col-span-2" value={triggerForm.aliases} onChange={(event) => setTriggerForm({ ...triggerForm, aliases: event.target.value })} placeholder="Aliases, one per line" />
              <textarea className="textarea textarea-bordered min-h-32 md:col-span-2" value={triggerForm.description} onChange={(event) => setTriggerForm({ ...triggerForm, description: event.target.value })} placeholder="Description or structured content" />
              <input className="file-input file-input-bordered md:col-span-2" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => setSelectedImage(event.target.files?.[0] || null)} />
              <label className="label cursor-pointer justify-start gap-3"><input type="checkbox" className="toggle toggle-sm" checked={triggerForm.enabled} onChange={(event) => setTriggerForm({ ...triggerForm, enabled: event.target.checked })} />Enabled</label>
              <label className="label cursor-pointer justify-start gap-3"><input type="checkbox" className="toggle toggle-sm" checked={triggerForm.case_sensitive} onChange={(event) => setTriggerForm({ ...triggerForm, case_sensitive: event.target.checked })} />Case-sensitive</label>
              <label className="label cursor-pointer justify-start gap-3"><input type="checkbox" className="toggle toggle-sm" checked={triggerForm.strict_mode} onChange={(event) => setTriggerForm({ ...triggerForm, strict_mode: event.target.checked })} />Strict mode</label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn btn-primary btn-sm" disabled={isWorking || !triggerForm.primary_phrase.trim()} onClick={saveTrigger}>Save trigger</button>
              {editingTrigger ? <button className="btn btn-ghost btn-sm" onClick={() => run(async () => { await duplicateVoiceTrigger(editingTrigger.id); await loadData(); }, "Could not duplicate trigger.")}>Duplicate</button> : null}
              {editingTrigger ? <button className="btn btn-error btn-outline btn-sm" onClick={() => window.confirm("Delete this trigger? Historical sessions keep their snapshots.") && run(async () => { await deleteVoiceTrigger(editingTrigger.id); setEditingTrigger(null); setTriggerForm(blankTriggerForm); await loadData(); }, "Could not delete trigger.")}>Delete</button> : null}
              <button className="btn btn-ghost btn-sm" onClick={() => run(async () => { const payload = await exportVoiceTriggers(); const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = "voice-trigger-library.json"; link.click(); URL.revokeObjectURL(url); }, "Could not export triggers.")}>Export library</button>
              <label className="btn btn-ghost btn-sm">Import<input type="file" accept="application/json" className="hidden" onChange={importFile} /></label>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "sessions" ? (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {sessions.map((session) => (
            <button key={session.id} className="rounded-box border border-base-300 bg-base-100 p-4 text-left hover:border-primary" onClick={() => { setCurrentSession(session); setActiveTab("listen"); }}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">{session.title}</h3>
                <span className="badge badge-outline">{session.status}</span>
              </div>
              <p className="mt-2 text-sm text-base-content/60">{session.blocks.length} blocks, {session.activations.length} activations</p>
              <p className="mt-1 text-xs text-base-content/50">Updated {formatDate(session.updated_at)}</p>
            </button>
          ))}
        </section>
      ) : null}

      {activeTab === "settings" ? (
        <section className="rounded-box border border-base-300 bg-base-100 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="form-control"><span className="label-text">Duplicate cooldown seconds</span><input className="input input-bordered" type="number" min="0" value={settings.duplicate_cooldown_seconds} onChange={(event) => setSettings({ ...settings, duplicate_cooldown_seconds: Number(event.target.value) })} /></label>
            <label className="label cursor-pointer justify-start gap-3"><input type="checkbox" className="toggle" checked={settings.trigger_detection_enabled} onChange={(event) => setSettings({ ...settings, trigger_detection_enabled: event.target.checked })} />Trigger detection</label>
            <label className="label cursor-pointer justify-start gap-3"><input type="checkbox" className="toggle" checked={settings.keep_trigger_words} onChange={(event) => setSettings({ ...settings, keep_trigger_words: event.target.checked })} />Keep spoken trigger words</label>
            <label className="label cursor-pointer justify-start gap-3"><input type="checkbox" className="toggle" checked={settings.images_expanded} onChange={(event) => setSettings({ ...settings, images_expanded: event.target.checked })} />Expanded images</label>
            <label className="label cursor-pointer justify-start gap-3"><input type="checkbox" className="toggle" checked={settings.show_timestamps} onChange={(event) => setSettings({ ...settings, show_timestamps: event.target.checked })} />Show timestamps</label>
            <label className="label cursor-pointer justify-start gap-3"><input type="checkbox" className="toggle" checked={settings.automatic_save} onChange={(event) => setSettings({ ...settings, automatic_save: event.target.checked })} />Automatic save</label>
          </div>
        </section>
      ) : null}

      {activeTab === "help" ? (
        <section className="space-y-4">
          <div className="rounded-box border border-base-300 bg-base-100 p-5">
            <h2 className="text-xl font-semibold">Quick Start</h2>
            <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm leading-6 text-base-content/80">
              <li>Open the Library tab and create at least one command.</li>
              <li>Enter the phrase you expect to say in Primary phrase.</li>
              <li>Add alternate phrases in Aliases when speech-to-text often hears the command another way.</li>
              <li>Add the title, content, category, tags, and optional image that should be inserted when the command is detected.</li>
              <li>Save the command, then return to the Listen tab.</li>
              <li>Press Start to create a listening session and activate the microphone.</li>
              <li>Press Stop when you finish speaking, then use Transcribe and save to send the recorded audio through the existing local STT backend.</li>
              <li>Review the saved transcript and inserted command blocks in the session workspace.</li>
              <li>Edit or remove blocks as needed, add notes, then save or export the session.</li>
            </ol>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-box border border-base-300 bg-base-100 p-5">
              <h3 className="font-semibold">Library Tab</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-base-content/80">
                <li>Use New to create a command.</li>
                <li>Use whole phrase matching for normal spoken commands.</li>
                <li>Use exact phrase when the whole transcript segment should equal the command.</li>
                <li>Use flexible match for minor punctuation or spacing differences.</li>
                <li>Disable a command when you want to keep it saved but stop detecting it.</li>
                <li>Deleting a command does not rewrite older sessions that already used it.</li>
              </ul>
            </div>

            <div className="rounded-box border border-base-300 bg-base-100 p-5">
              <h3 className="font-semibold">Listen Tab</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-base-content/80">
                <li>Start creates a new active session and turns on the microphone.</li>
                <li>Pause and Resume control the active recording.</li>
                <li>Stop turns off the microphone and leaves the recording ready to transcribe.</li>
                <li>Transcribe and save stores the final transcript segment and any command activations in SQLite.</li>
                <li>The manual transcript box is useful for testing commands without using the microphone.</li>
                <li>Manual insert adds a saved command block even when speech recognition missed it.</li>
              </ul>
            </div>

            <div className="rounded-box border border-base-300 bg-base-100 p-5">
              <h3 className="font-semibold">Sessions Tab</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-base-content/80">
                <li>Open a previous session to continue reviewing or editing it.</li>
                <li>Draft and active sessions remain available after restart.</li>
                <li>Triggered blocks keep the title, content, image reference, spoken phrase, and match mode from the moment they were detected.</li>
                <li>Export the current session from the Listen tab as Markdown or JSON.</li>
              </ul>
            </div>

            <div className="rounded-box border border-base-300 bg-base-100 p-5">
              <h3 className="font-semibold">Settings Tab</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-base-content/80">
                <li>Duplicate cooldown prevents the same command from firing repeatedly from overlapping transcript results.</li>
                <li>Trigger detection can be turned off for sessions where you only want transcription.</li>
                <li>Timestamp visibility controls whether session blocks show saved times.</li>
                <li>Images are stored in the application runtime data directory, not in the source tree.</li>
              </ul>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SessionBlock({ block, imageUrl, showTimestamps, onChange }: { block: SessionContentBlockRecord; imageUrl: string; showTimestamps: boolean; onChange: (payload: Partial<{ title: string; content: string; status: string }>) => Promise<unknown> }) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(block.title || "");
  const [content, setContent] = useState(block.content || "");

  return (
    <article className={`rounded-box border p-4 ${block.block_type === "trigger" ? "border-secondary/40 bg-secondary/10" : "border-base-300 bg-base-200/40"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          {block.block_type === "trigger" ? <span className="badge badge-secondary badge-sm">Trigger</span> : null}
          {showTimestamps ? <span className="ml-2 text-xs text-base-content/50">{formatDate(block.created_at)}</span> : null}
        </div>
        <div className="flex gap-1">
          <button className="btn btn-ghost btn-xs" onClick={() => setIsEditing(!isEditing)}>{isEditing ? "Done" : "Edit"}</button>
          <button className="btn btn-ghost btn-xs" onClick={() => onChange({ status: "deleted" })}>Remove</button>
        </div>
      </div>
      {isEditing ? (
        <div className="mt-3 space-y-2">
          <input className="input input-bordered input-sm w-full" value={title} onChange={(event) => setTitle(event.target.value)} />
          <textarea className="textarea textarea-bordered min-h-24 w-full" value={content} onChange={(event) => setContent(event.target.value)} />
          <button className="btn btn-primary btn-xs" onClick={() => onChange({ title, content }).then(() => setIsEditing(false))}>Save block</button>
        </div>
      ) : (
        <div className="mt-3">
          {block.title ? <h3 className="font-semibold">{block.title}</h3> : null}
          {block.content ? <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{block.content}</p> : null}
          {imageUrl ? <img src={imageUrl} alt="" className="mt-3 max-h-64 rounded-box border border-base-300 object-contain" /> : null}
        </div>
      )}
    </article>
  );
}
