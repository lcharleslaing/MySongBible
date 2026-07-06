import { ChangeEvent, useEffect, useMemo, useState } from "react";

import { ApiError } from "../api/client";
import {
  analyzeAudioJournalTake,
  AudioJournalEntryRecord,
  AudioJournalTakeRecord,
  buildAudioJournalTakeAudioUrl,
  createAudioJournalEntry,
  createAudioJournalTake,
  deleteAudioJournalEntry,
  deleteAudioJournalTake,
  getAudioJournalEntry,
  listAudioJournalEntries,
  setActiveAudioJournalTake,
  setAudioJournalTrainingCandidate,
  transcribeAudioJournalTake,
  updateAudioJournalEntry,
  updateAudioJournalTake,
} from "../api/audioJournal";
import { PageHeader } from "../components/ui/PageHeader";
import { useAudioRecorder } from "../features/voice-lab/useAudioRecorder";

type AudioSource = {
  blob: Blob;
  fileName: string;
  previewUrl: string;
};

type EntryFormState = {
  title: string;
  voiceStyle: string;
  notes: string;
  scriptText: string;
};

type WorkingAction =
  | "create-entry"
  | "save-entry"
  | "delete-entry"
  | "create-take"
  | "save-take"
  | "delete-take"
  | "transcribe"
  | "analyze"
  | "set-active"
  | "training-candidate";

const voiceStyles = ["natural", "calm", "storytelling", "energetic", "other"];

function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    const detail = error.details as { detail?: string | { message?: string } } | null | undefined;
    if (typeof detail?.detail === "string") {
      return detail.detail;
    }
    if (typeof detail?.detail === "object" && detail.detail?.message) {
      return detail.detail.message;
    }
    return error.message || fallback;
  }

  return error instanceof Error ? error.message : fallback;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNumber(value: number | null | undefined, suffix = "", digits = 2) {
  if (value === null || value === undefined) {
    return "n/a";
  }

  return `${value.toFixed(digits)}${suffix}`;
}

function qualityBadgeClass(status: string | null | undefined) {
  switch (status) {
    case "usable":
      return "badge-success";
    case "review":
      return "badge-warning";
    case "rejected":
      return "badge-error";
    default:
      return "badge-neutral";
  }
}

function parseReasons(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item));
    }
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed).map(([key, item]) => `${key}: ${String(item)}`);
    }
  } catch {
    return [value];
  }

  return [value];
}

function takeLabel(take: AudioJournalTakeRecord | null | undefined) {
  if (!take) {
    return "None";
  }

  return `Take ${take.take_number} (${take.take_type})`;
}

function trainingExplanation(entry: AudioJournalEntryRecord | null, take: AudioJournalTakeRecord | null) {
  if (!take) {
    return "Select a take to review training readiness.";
  }

  if (take.is_training_candidate) {
    return "Usable for voice training.";
  }

  const reasons = [];
  if (!take.transcript_text?.trim() && !entry?.script_text?.trim()) {
    reasons.push("needs transcript/script");
  }
  if (take.quality_status !== "usable") {
    reasons.push("quality not usable");
  }
  if (take.clipping_detected) {
    reasons.push("clipping detected");
  }
  if (take.quality_score !== null && take.quality_score < 85) {
    reasons.push("score below threshold");
  }
  if (take.script_match_score !== null && take.script_match_score < 85) {
    reasons.push("script mismatch");
  }

  return reasons.length ? reasons.join(", ") : "Review before marking as a training candidate.";
}

export function AudioJournalPage() {
  const {
    audioBlob: recordedAudioBlob,
    audioUrl: recordedAudioUrl,
    fileName: recordedFileName,
    formatCompatibilityWarning,
    isRecording,
    mimeType: recordedMimeType,
    recorderError,
    resetRecording,
    startRecording,
    stopRecording,
  } = useAudioRecorder();

  const [entries, setEntries] = useState<AudioJournalEntryRecord[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<AudioJournalEntryRecord | null>(null);
  const [selectedTakeId, setSelectedTakeId] = useState<number | null>(null);
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
  const [selectedAudioUrl, setSelectedAudioUrl] = useState("");
  const [newEntryTitle, setNewEntryTitle] = useState("");
  const [newEntryVoiceStyle, setNewEntryVoiceStyle] = useState("natural");
  const [newEntryNotes, setNewEntryNotes] = useState("");
  const [entryForm, setEntryForm] = useState<EntryFormState>({
    title: "",
    voiceStyle: "natural",
    notes: "",
    scriptText: "",
  });
  const [takeTranscriptText, setTakeTranscriptText] = useState("");
  const [takeUploadFile, setTakeUploadFile] = useState<File | null>(null);
  const [takeUploadType, setTakeUploadType] = useState("import");
  const [isLoading, setIsLoading] = useState(true);
  const [workingAction, setWorkingAction] = useState<WorkingAction | "">("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [takeAudioUrl, setTakeAudioUrl] = useState("");

  const selectedTake = useMemo(() => {
    if (!selectedEntry) {
      return null;
    }

    return selectedEntry.takes.find((take) => take.id === selectedTakeId) || selectedEntry.takes[0] || null;
  }, [selectedEntry, selectedTakeId]);

  const activeTake = useMemo(
    () => selectedEntry?.takes.find((take) => take.id === selectedEntry.active_take_id) || null,
    [selectedEntry],
  );

  const selectedTrainingTake = useMemo(
    () => selectedEntry?.takes.find((take) => take.id === selectedEntry.selected_training_take_id) || null,
    [selectedEntry],
  );

  const activeAudioSource = useMemo<AudioSource | null>(() => {
    if (selectedAudioFile && selectedAudioUrl) {
      return {
        blob: selectedAudioFile,
        fileName: selectedAudioFile.name,
        previewUrl: selectedAudioUrl,
      };
    }

    if (recordedAudioBlob && recordedAudioUrl) {
      return {
        blob: recordedAudioBlob,
        fileName: recordedFileName || `audio-journal-recording.${recordedMimeType.includes("ogg") ? "ogg" : "webm"}`,
        previewUrl: recordedAudioUrl,
      };
    }

    return null;
  }, [recordedAudioBlob, recordedAudioUrl, recordedFileName, recordedMimeType, selectedAudioFile, selectedAudioUrl]);

  useEffect(() => {
    loadEntries();
  }, []);

  useEffect(() => {
    return () => {
      if (selectedAudioUrl) {
        URL.revokeObjectURL(selectedAudioUrl);
      }
    };
  }, [selectedAudioUrl]);

  useEffect(() => {
    if (!selectedEntry) {
      setEntryForm({
        title: "",
        voiceStyle: "natural",
        notes: "",
        scriptText: "",
      });
      return;
    }

    setEntryForm({
      title: selectedEntry.title,
      voiceStyle: selectedEntry.voice_style || "natural",
      notes: selectedEntry.notes || "",
      scriptText: selectedEntry.script_text || "",
    });
  }, [selectedEntry]);

  useEffect(() => {
    setTakeTranscriptText(selectedTake?.transcript_text || "");
  }, [selectedTake]);

  useEffect(() => {
    let cancelled = false;

    async function loadAudioUrl() {
      if (!selectedEntry || !selectedTake) {
        setTakeAudioUrl("");
        return;
      }

      const url = await buildAudioJournalTakeAudioUrl(selectedEntry.id, selectedTake.id);
      if (!cancelled) {
        setTakeAudioUrl(url);
      }
    }

    loadAudioUrl();

    return () => {
      cancelled = true;
    };
  }, [selectedEntry, selectedTake]);

  async function loadEntries(nextSelectedEntryId?: number, nextSelectedTakeId?: number) {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const response = await listAudioJournalEntries();
      setEntries(response.items);

      const nextEntry =
        response.items.find((entry) => entry.id === nextSelectedEntryId) ||
        (selectedEntry ? response.items.find((entry) => entry.id === selectedEntry.id) : null) ||
        response.items[0] ||
        null;

      setSelectedEntry(nextEntry);
      setSelectedTakeId(nextSelectedTakeId || nextEntry?.active_take_id || nextEntry?.takes[0]?.id || null);
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Could not load audio journal entries."));
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshSelectedEntry(entryId = selectedEntry?.id, takeId = selectedTakeId) {
    if (!entryId) {
      await loadEntries();
      return;
    }

    try {
      const entry = await getAudioJournalEntry(entryId);
      setSelectedEntry(entry);
      setEntries((current) => current.map((item) => (item.id === entry.id ? entry : item)));
      setSelectedTakeId(takeId || entry.active_take_id || entry.takes[0]?.id || null);
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Could not refresh the journal entry."));
    }
  }

  function handleAudioFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    if (!file) {
      return;
    }

    if (selectedAudioUrl) {
      URL.revokeObjectURL(selectedAudioUrl);
    }

    setSelectedAudioFile(file);
    setSelectedAudioUrl(URL.createObjectURL(file));
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function handleCreateEntry() {
    if (!activeAudioSource) {
      setErrorMessage("Record audio or choose a local audio file before saving.");
      return;
    }

    setWorkingAction("create-entry");
    setErrorMessage("");
    setSuccessMessage("");

    const formData = new FormData();
    formData.append("audio_file", activeAudioSource.blob, activeAudioSource.fileName);
    if (newEntryTitle.trim()) {
      formData.append("title", newEntryTitle.trim());
    }
    formData.append("voice_style", newEntryVoiceStyle);
    if (newEntryNotes.trim()) {
      formData.append("notes", newEntryNotes.trim());
    }

    try {
      const response = await createAudioJournalEntry(formData);
      setSuccessMessage(`Saved ${response.entry.title}.`);
      setNewEntryTitle("");
      setNewEntryNotes("");
      setSelectedAudioFile(null);
      setSelectedAudioUrl("");
      resetRecording();
      await loadEntries(response.entry.id, response.take.id);
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Could not save the journal entry."));
    } finally {
      setWorkingAction("");
    }
  }

  async function handleSaveEntry() {
    if (!selectedEntry) {
      return;
    }

    setWorkingAction("save-entry");
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const entry = await updateAudioJournalEntry(selectedEntry.id, {
        title: entryForm.title.trim() || selectedEntry.title,
        voice_style: entryForm.voiceStyle,
        notes: entryForm.notes.trim() || null,
        script_text: entryForm.scriptText.trim() || null,
      });
      setSelectedEntry(entry);
      setEntries((current) => current.map((item) => (item.id === entry.id ? entry : item)));
      setSuccessMessage("Entry changes saved.");
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Could not save entry changes."));
    } finally {
      setWorkingAction("");
    }
  }

  async function handleDeleteEntry(entry: AudioJournalEntryRecord) {
    if (!window.confirm(`Delete "${entry.title}"?`)) {
      return;
    }

    setWorkingAction("delete-entry");
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await deleteAudioJournalEntry(entry.id);
      setSuccessMessage("Entry deleted.");
      if (selectedEntry?.id === entry.id) {
        setSelectedEntry(null);
        setSelectedTakeId(null);
      }
      await loadEntries();
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Could not delete the entry."));
    } finally {
      setWorkingAction("");
    }
  }

  async function runTakeAction(action: WorkingAction, callback: () => Promise<void>) {
    setWorkingAction(action);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await callback();
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Action failed."));
    } finally {
      setWorkingAction("");
    }
  }

  async function handleTranscribeTake(entryId: number, takeId: number) {
    await runTakeAction("transcribe", async () => {
      const response = await transcribeAudioJournalTake(entryId, takeId);
      setSelectedEntry(response.entry);
      setSelectedTakeId(response.take.id);
      setEntries((current) => current.map((item) => (item.id === response.entry.id ? response.entry : item)));
      setSuccessMessage("Transcription completed.");
    });
  }

  async function handleAnalyzeTake(entryId: number, takeId: number) {
    await runTakeAction("analyze", async () => {
      const take = await analyzeAudioJournalTake(entryId, takeId);
      await refreshSelectedEntry(entryId, take.id);
      setSuccessMessage("Quality analysis updated.");
    });
  }

  async function handleSetActiveTake(entryId: number, takeId: number) {
    await runTakeAction("set-active", async () => {
      const take = await setActiveAudioJournalTake(entryId, takeId);
      await refreshSelectedEntry(entryId, take.id);
      setSuccessMessage("Active take updated.");
    });
  }

  async function handleSaveTake() {
    if (!selectedEntry || !selectedTake) {
      return;
    }

    await runTakeAction("save-take", async () => {
      const take = await updateAudioJournalTake(selectedEntry.id, selectedTake.id, {
        transcript_text: takeTranscriptText.trim() || null,
        transcript_source: takeTranscriptText.trim() ? selectedTake.transcript_source || "manual" : selectedTake.transcript_source,
      });
      await refreshSelectedEntry(selectedEntry.id, take.id);
      setSuccessMessage("Take transcript saved.");
    });
  }

  async function handleMarkTrainingCandidate(entry: AudioJournalEntryRecord, take: AudioJournalTakeRecord) {
    const eligible =
      take.quality_status === "usable" &&
      Boolean(take.transcript_text?.trim() || entry.script_text?.trim()) &&
      (take.script_match_score === null || take.script_match_score >= 85);

    if (!eligible && !window.confirm("This take is not currently eligible. Mark it as a training candidate anyway?")) {
      return;
    }

    await runTakeAction("training-candidate", async () => {
      const updatedTake = await setAudioJournalTrainingCandidate(entry.id, take.id, {
        is_training_candidate: true,
        manual_override: !eligible,
        reason: eligible ? null : "Marked manually from Audio Journal.",
      });
      await refreshSelectedEntry(entry.id, updatedTake.id);
      setSuccessMessage("Training candidate updated.");
    });
  }

  async function handleDeleteTake(entryId: number, take: AudioJournalTakeRecord) {
    if (!window.confirm(`Delete Take ${take.take_number}?`)) {
      return;
    }

    await runTakeAction("delete-take", async () => {
      await deleteAudioJournalTake(entryId, take.id);
      await refreshSelectedEntry(entryId, null);
      setSuccessMessage("Take deleted.");
    });
  }

  async function handleCreateTake() {
    if (!selectedEntry || !takeUploadFile) {
      return;
    }

    await runTakeAction("create-take", async () => {
      const formData = new FormData();
      formData.append("audio_file", takeUploadFile, takeUploadFile.name);
      formData.append("take_type", takeUploadType);
      const take = await createAudioJournalTake(selectedEntry.id, formData);
      setTakeUploadFile(null);
      await refreshSelectedEntry(selectedEntry.id, take.id);
      setSuccessMessage(`Saved Take ${take.take_number}.`);
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Local Voice"
        title="Audio Journal"
        description="Record local voice entries, transcribe them with Whisper, and build a clean dataset for future local voice training."
      />

      {errorMessage ? (
        <div className="alert alert-error">
          <span>{errorMessage}</span>
        </div>
      ) : null}
      {successMessage ? (
        <div className="alert alert-success">
          <span>{successMessage}</span>
        </div>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="space-y-6">
          <div className="card border border-base-300 bg-base-100 shadow-sm">
            <div className="card-body space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="card-title text-xl">New entry</h2>
                <div className="join">
                  <button
                    type="button"
                    className="btn join-item btn-primary btn-sm"
                    disabled={isRecording}
                    onClick={startRecording}
                  >
                    Record
                  </button>
                  <button
                    type="button"
                    className="btn join-item btn-sm"
                    disabled={!isRecording}
                    onClick={stopRecording}
                  >
                    Stop
                  </button>
                </div>
              </div>

              {recorderError ? <div className="alert alert-warning py-2 text-sm">{recorderError}</div> : null}
              {formatCompatibilityWarning ? (
                <div className="alert alert-info py-2 text-sm">{formatCompatibilityWarning}</div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                <label className="form-control">
                  <span className="label-text">Title</span>
                  <input
                    className="input input-bordered"
                    value={newEntryTitle}
                    onChange={(event) => setNewEntryTitle(event.target.value)}
                    placeholder="Morning journal"
                  />
                </label>
                <label className="form-control">
                  <span className="label-text">Voice style</span>
                  <select
                    className="select select-bordered"
                    value={newEntryVoiceStyle}
                    onChange={(event) => setNewEntryVoiceStyle(event.target.value)}
                  >
                    {voiceStyles.map((style) => (
                      <option key={style} value={style}>
                        {style}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="form-control">
                <span className="label-text">Notes</span>
                <textarea
                  className="textarea textarea-bordered min-h-24"
                  value={newEntryNotes}
                  onChange={(event) => setNewEntryNotes(event.target.value)}
                />
              </label>

              <label className="form-control">
                <span className="label-text">Choose existing audio file</span>
                <input
                  className="file-input file-input-bordered"
                  type="file"
                  accept="audio/*"
                  onChange={handleAudioFileSelection}
                />
              </label>

              {activeAudioSource ? (
                <div className="rounded-lg border border-base-300 bg-base-200 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="text-sm font-medium">{activeAudioSource.fileName}</span>
                    <span className="badge badge-outline">{selectedAudioFile ? "upload" : "recording"}</span>
                  </div>
                  <audio className="w-full" controls src={activeAudioSource.previewUrl} />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-base-300 p-4 text-sm text-base-content/60">
                  No audio selected.
                </div>
              )}

              <button
                type="button"
                className="btn btn-primary"
                disabled={!activeAudioSource || workingAction === "create-entry"}
                onClick={handleCreateEntry}
              >
                {workingAction === "create-entry" ? "Saving..." : "Save Journal Entry"}
              </button>
            </div>
          </div>

          <div className="card border border-base-300 bg-base-100 shadow-sm">
            <div className="card-body space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="card-title text-xl">Entries</h2>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => loadEntries()}>
                  Refresh
                </button>
              </div>

              {isLoading ? <div className="loading loading-spinner loading-md" /> : null}
              {!isLoading && entries.length === 0 ? (
                <div className="rounded-lg border border-dashed border-base-300 p-4 text-sm text-base-content/60">
                  No journal entries yet.
                </div>
              ) : null}

              <div className="space-y-3">
                {entries.map((entry) => {
                  const entryActiveTake = entry.takes.find((take) => take.id === entry.active_take_id) || null;
                  return (
                    <div
                      key={entry.id}
                      className={`rounded-lg border p-4 ${
                        selectedEntry?.id === entry.id ? "border-primary bg-primary/5" : "border-base-300 bg-base-100"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold">{entry.title}</h3>
                          <p className="text-xs text-base-content/60">{formatDate(entry.journal_date || entry.created_at)}</p>
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <span className={`badge ${qualityBadgeClass(entry.overall_quality_status)}`}>
                            {entry.overall_quality_status}
                          </span>
                          {entry.selected_training_take_id ? <span className="badge badge-info">training candidate</span> : null}
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-base-content/70 sm:grid-cols-2">
                        <span>Style: {entry.voice_style || "n/a"}</span>
                        <span>Active: {takeLabel(entryActiveTake)}</span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            setSelectedEntry(entry);
                            setSelectedTakeId(entry.active_take_id || entry.takes[0]?.id || null);
                          }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={!entryActiveTake || workingAction === "transcribe"}
                          onClick={() => entryActiveTake && handleTranscribeTake(entry.id, entryActiveTake.id)}
                        >
                          Transcribe Active Take
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm"
                          disabled={!entryActiveTake || workingAction === "analyze"}
                          onClick={() => entryActiveTake && handleAnalyzeTake(entry.id, entryActiveTake.id)}
                        >
                          Analyze Active Take
                        </button>
                        <button
                          type="button"
                          className="btn btn-error btn-outline btn-sm"
                          disabled={workingAction === "delete-entry"}
                          onClick={() => handleDeleteEntry(entry)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {selectedEntry ? (
            <>
              <div className="card border border-base-300 bg-base-100 shadow-sm">
                <div className="card-body space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="card-title text-xl">Entry detail</h2>
                      <p className="text-sm text-base-content/60">Created {formatDate(selectedEntry.created_at)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="badge badge-outline">Active: {takeLabel(activeTake)}</span>
                      <span className="badge badge-outline">Selected: {takeLabel(selectedTrainingTake)}</span>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="form-control">
                      <span className="label-text">Title</span>
                      <input
                        className="input input-bordered"
                        value={entryForm.title}
                        onChange={(event) => setEntryForm((current) => ({ ...current, title: event.target.value }))}
                      />
                    </label>
                    <label className="form-control">
                      <span className="label-text">Journal date</span>
                      <input className="input input-bordered" value={formatDate(selectedEntry.journal_date)} readOnly />
                    </label>
                    <label className="form-control">
                      <span className="label-text">Voice style</span>
                      <select
                        className="select select-bordered"
                        value={entryForm.voiceStyle}
                        onChange={(event) => setEntryForm((current) => ({ ...current, voiceStyle: event.target.value }))}
                      >
                        {voiceStyles.map((style) => (
                          <option key={style} value={style}>
                            {style}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="form-control">
                    <span className="label-text">Script</span>
                    <textarea
                      className="textarea textarea-bordered min-h-32"
                      value={entryForm.scriptText}
                      onChange={(event) => setEntryForm((current) => ({ ...current, scriptText: event.target.value }))}
                    />
                  </label>

                  {selectedEntry.original_transcript_text ? (
                    <div className="rounded-lg border border-base-300 bg-base-200 p-3">
                      <p className="mb-2 text-sm font-semibold">Original transcript</p>
                      <p className="whitespace-pre-wrap text-sm text-base-content/80">
                        {selectedEntry.original_transcript_text}
                      </p>
                    </div>
                  ) : null}

                  <label className="form-control">
                    <span className="label-text">Notes</span>
                    <textarea
                      className="textarea textarea-bordered min-h-24"
                      value={entryForm.notes}
                      onChange={(event) => setEntryForm((current) => ({ ...current, notes: event.target.value }))}
                    />
                  </label>

                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={workingAction === "save-entry"}
                    onClick={handleSaveEntry}
                  >
                    {workingAction === "save-entry" ? "Saving..." : "Save entry changes"}
                  </button>
                </div>
              </div>

              <div className="card border border-base-300 bg-base-100 shadow-sm">
                <div className="card-body space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="card-title text-xl">Takes</h2>
                    <div className="flex flex-wrap gap-2">
                      <select
                        className="select select-bordered select-sm"
                        value={takeUploadType}
                        onChange={(event) => setTakeUploadType(event.target.value)}
                      >
                        <option value="import">import</option>
                        <option value="rerecord">rerecord</option>
                        <option value="original">original</option>
                      </select>
                      <input
                        className="file-input file-input-bordered file-input-sm max-w-64"
                        type="file"
                        accept="audio/*"
                        onChange={(event) => setTakeUploadFile(event.target.files?.[0] || null)}
                      />
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={!takeUploadFile || workingAction === "create-take"}
                        onClick={handleCreateTake}
                      >
                        Add take
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="table table-sm">
                      <thead>
                        <tr>
                          <th>Take</th>
                          <th>Quality</th>
                          <th>Transcript</th>
                          <th>Flags</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedEntry.takes.map((take) => (
                          <tr key={take.id} className={selectedTakeId === take.id ? "bg-primary/10" : ""}>
                            <td>
                              <button
                                type="button"
                                className="link font-semibold"
                                onClick={() => setSelectedTakeId(take.id)}
                              >
                                Take {take.take_number}
                              </button>
                              <div className="text-xs text-base-content/60">
                                {take.take_type} · {formatDate(take.created_at)}
                              </div>
                            </td>
                            <td>
                              <span className={`badge ${qualityBadgeClass(take.quality_status)}`}>{take.quality_status}</span>
                              <div className="text-xs text-base-content/60">{formatNumber(take.quality_score, "", 0)}</div>
                            </td>
                            <td>
                              <span className="badge badge-outline">{take.transcription_status}</span>
                              {take.script_match_score !== null ? (
                                <div className="text-xs text-base-content/60">
                                  Match {formatNumber(take.script_match_score, "%", 0)}
                                </div>
                              ) : null}
                            </td>
                            <td>
                              <div className="flex flex-wrap gap-1">
                                {take.is_active ? <span className="badge badge-primary">active</span> : null}
                                {take.is_training_candidate ? <span className="badge badge-info">candidate</span> : null}
                              </div>
                            </td>
                            <td>
                              <div className="flex flex-wrap gap-1">
                                <button type="button" className="btn btn-xs" onClick={() => setSelectedTakeId(take.id)}>
                                  Select
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-xs"
                                  disabled={take.is_active || workingAction === "set-active"}
                                  onClick={() => handleSetActiveTake(selectedEntry.id, take.id)}
                                >
                                  Set Active
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-xs"
                                  disabled={workingAction === "transcribe"}
                                  onClick={() => handleTranscribeTake(selectedEntry.id, take.id)}
                                >
                                  Transcribe
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-xs"
                                  disabled={workingAction === "analyze"}
                                  onClick={() => handleAnalyzeTake(selectedEntry.id, take.id)}
                                >
                                  Analyze
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-xs"
                                  disabled={workingAction === "training-candidate"}
                                  onClick={() => handleMarkTrainingCandidate(selectedEntry, take)}
                                >
                                  Mark Training Candidate
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-error btn-outline btn-xs"
                                  disabled={workingAction === "delete-take"}
                                  onClick={() => handleDeleteTake(selectedEntry.id, take)}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="card border border-base-300 bg-base-100 shadow-sm">
                <div className="card-body space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="card-title text-xl">Take detail</h2>
                    {selectedTake ? (
                      <span className={`badge ${qualityBadgeClass(selectedTake.quality_status)}`}>
                        {selectedTake.quality_status}
                      </span>
                    ) : null}
                  </div>

                  {selectedTake ? (
                    <>
                      {takeAudioUrl ? <audio className="w-full" controls src={takeAudioUrl} /> : null}

                      <label className="form-control">
                        <span className="label-text">Transcript</span>
                        <textarea
                          className="textarea textarea-bordered min-h-36"
                          value={takeTranscriptText}
                          onChange={(event) => setTakeTranscriptText(event.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={workingAction === "save-take"}
                        onClick={handleSaveTake}
                      >
                        {workingAction === "save-take" ? "Saving..." : "Save take changes"}
                      </button>

                      <div className="rounded-lg border border-base-300 bg-base-200 p-4">
                        <h3 className="font-semibold">Quality</h3>
                        <p className="mt-2 text-sm text-base-content/70">
                          {selectedTake.quality_summary || "No quality summary available."}
                        </p>
                        {parseReasons(selectedTake.quality_reasons_json).length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {parseReasons(selectedTake.quality_reasons_json).map((reason) => (
                              <span key={reason} className="badge badge-outline">
                                {reason}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                          <span>Duration: {formatNumber(selectedTake.duration_seconds, "s", 2)}</span>
                          <span>Sample rate: {selectedTake.sample_rate || "n/a"}</span>
                          <span>Channels: {selectedTake.channels || "n/a"}</span>
                          <span>Peak dB: {formatNumber(selectedTake.peak_db, " dB", 2)}</span>
                          <span>RMS dB: {formatNumber(selectedTake.rms_db, " dB", 2)}</span>
                          <span>Clipping: {selectedTake.clipping_detected ? "yes" : "no"}</span>
                          <span>Silence: {formatNumber(selectedTake.silence_ratio, "", 3)}</span>
                          <span>SNR: {formatNumber(selectedTake.snr_estimate_db, " dB", 2)}</span>
                          <span>Script match: {formatNumber(selectedTake.script_match_score, "%", 0)}</span>
                        </div>
                      </div>

                      <div className="alert">
                        <span>{trainingExplanation(selectedEntry, selectedTake)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed border-base-300 p-4 text-sm text-base-content/60">
                      No take selected.
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="card border border-base-300 bg-base-100 shadow-sm">
              <div className="card-body">
                <h2 className="card-title text-xl">Entry detail</h2>
                <div className="rounded-lg border border-dashed border-base-300 p-4 text-sm text-base-content/60">
                  Select or create a journal entry.
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
