import { ChangeEvent, useEffect, useMemo, useState } from "react";

import { ApiError } from "../api/client";
import {
  analyzeAudioJournalTake,
  AudioJournalEntryRecord,
  AudioQualityBaselineRecord,
  AudioJournalTakeRecord,
  buildAudioQualityBaselineAudioUrl,
  buildAudioJournalTakeAudioUrl,
  createAudioQualityBaseline,
  createAudioJournalEntry,
  createAudioJournalTake,
  deleteAudioQualityBaseline,
  deleteAudioJournalEntry,
  deleteAudioJournalTake,
  getAudioJournalEntry,
  listAudioQualityBaselines,
  listAudioJournalEntries,
  setActiveAudioJournalTake,
  setDefaultAudioQualityBaseline,
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
  | "create-baseline"
  | "delete-baseline"
  | "save-entry"
  | "delete-entry"
  | "create-take"
  | "save-take"
  | "delete-take"
  | "transcribe"
  | "analyze"
  | "set-default-baseline"
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

function parseMetadata(value: string | null | undefined) {
  if (!value) {
    return {} as Record<string, unknown>;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function entrySourceLabel(entry: AudioJournalEntryRecord | null | undefined) {
  const metadata = parseMetadata(entry?.metadata_json);
  switch (metadata.created_from) {
    case "simple-recorder":
      return "Simple";
    case "full-audio-journal":
      return "Full";
    default:
      return entry?.title.startsWith("Voice note ") ? "Simple" : "Full";
  }
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
    isPaused,
    isRecording,
    mimeType: recordedMimeType,
    pauseRecording,
    recorderError,
    resetRecording,
    resumeRecording,
    startRecording,
    stopRecording,
  } = useAudioRecorder();
  const {
    audioBlob: teleprompterAudioBlob,
    audioUrl: teleprompterAudioUrl,
    fileName: teleprompterFileName,
    formatCompatibilityWarning: teleprompterFormatWarning,
    isRecording: isTeleprompterRecording,
    mimeType: teleprompterMimeType,
    recorderError: teleprompterRecorderError,
    resetRecording: resetTeleprompterRecording,
    startRecording: startTeleprompterRecording,
    stopRecording: stopTeleprompterRecording,
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
  const [baselines, setBaselines] = useState<AudioQualityBaselineRecord[]>([]);
  const [baselineAudioUrls, setBaselineAudioUrls] = useState<Record<number, string>>({});
  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [baselineName, setBaselineName] = useState("");
  const [baselineDeviceLabel, setBaselineDeviceLabel] = useState("");
  const [baselineEnvironmentLabel, setBaselineEnvironmentLabel] = useState("");
  const [baselineNotes, setBaselineNotes] = useState("");
  const [baselineIsDefault, setBaselineIsDefault] = useState(true);
  const [isTeleprompterOpen, setIsTeleprompterOpen] = useState(false);
  const [journalMode, setJournalMode] = useState<"simple" | "advanced">("simple");
  const [simpleTitle, setSimpleTitle] = useState("");
  const [simpleAutoSavePending, setSimpleAutoSavePending] = useState(false);
  const [simpleSavingEntryId, setSimpleSavingEntryId] = useState<number | null>(null);
  const [teleprompterScript, setTeleprompterScript] = useState("");
  const [teleprompterCountdown, setTeleprompterCountdown] = useState<number | null>(null);
  const [teleprompterElapsedSeconds, setTeleprompterElapsedSeconds] = useState(0);
  const [isSavingTeleprompterTake, setIsSavingTeleprompterTake] = useState(false);
  const [teleprompterError, setTeleprompterError] = useState("");
  const [savedTeleprompterTake, setSavedTeleprompterTake] = useState<AudioJournalTakeRecord | null>(null);

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
    if (!simpleAutoSavePending || !recordedAudioBlob || journalMode !== "simple") {
      return;
    }

    setSimpleAutoSavePending(false);
    void handleCreateSimpleEntry(recordedAudioBlob);
  }, [journalMode, recordedAudioBlob, simpleAutoSavePending]);

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
    if (teleprompterCountdown === null) {
      return;
    }

    if (teleprompterCountdown <= 0) {
      setTeleprompterCountdown(null);
      setTeleprompterElapsedSeconds(0);
      startTeleprompterRecording();
      return;
    }

    const timer = window.setTimeout(() => {
      setTeleprompterCountdown((current) => (current === null ? null : current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [startTeleprompterRecording, teleprompterCountdown]);

  useEffect(() => {
    if (!isTeleprompterRecording) {
      return;
    }

    const timer = window.setInterval(() => {
      setTeleprompterElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isTeleprompterRecording]);

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
      const [response, baselineResponse] = await Promise.all([
        listAudioJournalEntries(),
        listAudioQualityBaselines(),
      ]);
      setEntries(response.items);
      setBaselines(baselineResponse.items);
      loadBaselineAudioUrls(baselineResponse.items);

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

  async function loadBaselineAudioUrls(nextBaselines: AudioQualityBaselineRecord[]) {
    const entries = await Promise.all(
      nextBaselines.map(async (baseline) => [baseline.id, await buildAudioQualityBaselineAudioUrl(baseline.id)] as const),
    );
    setBaselineAudioUrls(Object.fromEntries(entries));
  }

  async function refreshBaselines() {
    const response = await listAudioQualityBaselines();
    setBaselines(response.items);
    await loadBaselineAudioUrls(response.items);
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
    formData.append("metadata_json", JSON.stringify({
      created_from: "full-audio-journal",
      created_from_label: "Full",
    }));

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

  function defaultSimpleTitle() {
    return `Voice note ${new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date())}`;
  }

  function stopSimpleRecording() {
    setSimpleAutoSavePending(true);
    stopRecording();
  }

  async function handleCreateSimpleEntry(audioBlob: Blob) {
    const title = simpleTitle.trim() || defaultSimpleTitle();
    const formData = new FormData();
    formData.append("audio_file", audioBlob, recordedFileName || `audio-journal-recording.${recordedMimeType.includes("ogg") ? "ogg" : "webm"}`);
    formData.append("title", title);
    formData.append("voice_style", "natural");
    formData.append("metadata_json", JSON.stringify({
      created_from: "simple-recorder",
      created_from_label: "Simple",
    }));

    setWorkingAction("create-entry");
    setSimpleSavingEntryId(null);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const created = await createAudioJournalEntry(formData);
      const sourceMetadata = JSON.stringify({
        created_from: "simple-recorder",
        created_from_label: "Simple",
      });
      const sourceMarkedEntry = await updateAudioJournalEntry(created.entry.id, {
        metadata_json: sourceMetadata,
      });
      setSimpleSavingEntryId(sourceMarkedEntry.id);
      setSelectedEntry(sourceMarkedEntry);
      setSelectedTakeId(created.take.id);
      setEntries((current) => [sourceMarkedEntry, ...current.filter((entry) => entry.id !== sourceMarkedEntry.id)]);
      resetRecording();

      setWorkingAction("transcribe");
      const transcribed = await transcribeAudioJournalTake(sourceMarkedEntry.id, created.take.id);
      setSelectedEntry(transcribed.entry);
      setSelectedTakeId(transcribed.take.id);
      setEntries((current) => current.map((entry) => (entry.id === transcribed.entry.id ? transcribed.entry : entry)));
      setSimpleTitle("");
      setSuccessMessage(`Saved and transcribed ${transcribed.entry.title}.`);
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Could not save and transcribe the recording."));
    } finally {
      setWorkingAction("");
      setSimpleSavingEntryId(null);
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

  async function handleCreateBaseline() {
    if (!baselineFile) {
      setErrorMessage("Choose a baseline audio file first.");
      return;
    }

    setWorkingAction("create-baseline");
    setErrorMessage("");
    setSuccessMessage("");

    const formData = new FormData();
    formData.append("audio_file", baselineFile, baselineFile.name);
    formData.append("name", baselineName.trim() || baselineFile.name.replace(/\.[^.]+$/, ""));
    if (baselineDeviceLabel.trim()) {
      formData.append("device_label", baselineDeviceLabel.trim());
    }
    if (baselineEnvironmentLabel.trim()) {
      formData.append("environment_label", baselineEnvironmentLabel.trim());
    }
    if (baselineNotes.trim()) {
      formData.append("notes", baselineNotes.trim());
    }
    formData.append("is_default", baselineIsDefault ? "true" : "false");

    try {
      const baseline = await createAudioQualityBaseline(formData);
      setBaselineFile(null);
      setBaselineName("");
      setBaselineDeviceLabel("");
      setBaselineEnvironmentLabel("");
      setBaselineNotes("");
      setBaselineIsDefault(true);
      await refreshBaselines();
      setSuccessMessage(`Saved baseline ${baseline.name}.`);
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Could not save baseline."));
    } finally {
      setWorkingAction("");
    }
  }

  async function handleSetDefaultBaseline(baseline: AudioQualityBaselineRecord) {
    setWorkingAction("set-default-baseline");
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await setDefaultAudioQualityBaseline(baseline.id);
      await refreshBaselines();
      setSuccessMessage(`Default baseline set to ${baseline.name}.`);
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Could not set default baseline."));
    } finally {
      setWorkingAction("");
    }
  }

  async function handleDeleteBaseline(baseline: AudioQualityBaselineRecord) {
    if (!window.confirm(`Delete baseline "${baseline.name}"?`)) {
      return;
    }

    setWorkingAction("delete-baseline");
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await deleteAudioQualityBaseline(baseline.id);
      await refreshBaselines();
      setSuccessMessage("Baseline deleted.");
    } catch (error) {
      setErrorMessage(apiErrorMessage(error, "Could not delete baseline."));
    } finally {
      setWorkingAction("");
    }
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

  function openTeleprompter(entry: AudioJournalEntryRecord) {
    const script = entry.script_text?.trim() || entryForm.scriptText.trim();
    if (!script) {
      setErrorMessage("Transcribe or enter script text first.");
      return;
    }

    setTeleprompterScript(script);
    setTeleprompterCountdown(null);
    setTeleprompterElapsedSeconds(0);
    setTeleprompterError("");
    setSavedTeleprompterTake(null);
    resetTeleprompterRecording();
    setIsTeleprompterOpen(true);
  }

  function closeTeleprompter() {
    if (isTeleprompterRecording) {
      stopTeleprompterRecording();
    }
    setTeleprompterCountdown(null);
    setIsTeleprompterOpen(false);
  }

  function startTeleprompterCountdown() {
    setTeleprompterError("");
    setSavedTeleprompterTake(null);
    resetTeleprompterRecording();
    setTeleprompterElapsedSeconds(0);
    setTeleprompterCountdown(5);
  }

  function tryTeleprompterAgain() {
    if (isTeleprompterRecording) {
      stopTeleprompterRecording();
    }
    setTeleprompterCountdown(null);
    setTeleprompterElapsedSeconds(0);
    setTeleprompterError("");
    setSavedTeleprompterTake(null);
    resetTeleprompterRecording();
  }

  async function saveTeleprompterTake() {
    if (!selectedEntry || !teleprompterAudioBlob) {
      setTeleprompterError("Record a new take before saving.");
      return;
    }

    setIsSavingTeleprompterTake(true);
    setTeleprompterError("");
    setErrorMessage("");
    setSuccessMessage("");

    const script = teleprompterScript.trim();

    try {
      if (script && script !== (selectedEntry.script_text || "").trim()) {
        const updatedEntry = await updateAudioJournalEntry(selectedEntry.id, {
          script_text: script,
        });
        setSelectedEntry(updatedEntry);
        setEntries((current) => current.map((item) => (item.id === updatedEntry.id ? updatedEntry : item)));
      }

      const formData = new FormData();
      const extension = teleprompterFileName || `audio-journal-rerecord.${teleprompterMimeType.includes("ogg") ? "ogg" : "webm"}`;
      formData.append("audio_file", teleprompterAudioBlob, extension);
      formData.append("take_type", "rerecord");
      formData.append("transcript_source", "script");
      if (script) {
        formData.append("transcript_text", script);
      }

      const take = await createAudioJournalTake(selectedEntry.id, formData);
      setSavedTeleprompterTake(take);
      await refreshSelectedEntry(selectedEntry.id, take.id);
      setSuccessMessage(`Saved Take ${take.take_number}.`);
    } catch (error) {
      setTeleprompterError(apiErrorMessage(error, "Could not save the re-recorded take."));
    } finally {
      setIsSavingTeleprompterTake(false);
    }
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

      <div className="tabs tabs-boxed w-fit">
        <button
          type="button"
          className={`tab ${journalMode === "simple" ? "tab-active" : ""}`}
          onClick={() => setJournalMode("simple")}
        >
          Simple Recorder
        </button>
        <button
          type="button"
          className={`tab ${journalMode === "advanced" ? "tab-active" : ""}`}
          onClick={() => setJournalMode("advanced")}
        >
          Full Journal
        </button>
      </div>

      {journalMode === "simple" ? (
        <section className="grid gap-6 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)]">
          <div className="space-y-6">
            <div className="card border border-base-300 bg-base-100 shadow-sm">
              <div className="card-body gap-5">
                <div>
                  <h2 className="card-title text-xl">Simple Recorder</h2>
                  <p className="mt-1 text-sm text-base-content/60">
                    Record a note, stop, and it saves into the full Audio Journal with a transcript.
                  </p>
                </div>

                <label className="form-control">
                  <span className="label-text">Title</span>
                  <input
                    className="input input-bordered"
                    value={simpleTitle}
                    disabled={isRecording || workingAction === "create-entry" || workingAction === "transcribe"}
                    onChange={(event) => setSimpleTitle(event.target.value)}
                    placeholder={defaultSimpleTitle()}
                  />
                </label>

                <div className="join">
                  <button
                    type="button"
                    className="btn join-item btn-primary"
                    disabled={isRecording || workingAction === "create-entry" || workingAction === "transcribe"}
                    onClick={() => {
                      setSimpleAutoSavePending(false);
                      resetRecording();
                      void startRecording();
                    }}
                  >
                    Record
                  </button>
                  <button
                    type="button"
                    className="btn join-item"
                    disabled={!isRecording || workingAction === "create-entry" || workingAction === "transcribe"}
                    onClick={isPaused ? resumeRecording : pauseRecording}
                  >
                    {isPaused ? "Resume" : "Pause"}
                  </button>
                  <button
                    type="button"
                    className="btn join-item btn-error"
                    disabled={!isRecording || workingAction === "create-entry" || workingAction === "transcribe"}
                    onClick={stopSimpleRecording}
                  >
                    Stop
                  </button>
                </div>

                {isRecording ? (
                  <div className={`alert py-2 text-sm ${isPaused ? "alert-warning" : "alert-error"}`}>
                    <span>{isPaused ? "Recording paused." : "Recording..."}</span>
                  </div>
                ) : null}
                {workingAction === "create-entry" || workingAction === "transcribe" ? (
                  <div className="alert alert-info py-2 text-sm">
                    <span className="loading loading-spinner loading-sm" />
                    <span>{workingAction === "create-entry" ? "Saving recording..." : "Transcribing recording..."}</span>
                  </div>
                ) : null}
                {recorderError ? <div className="alert alert-warning py-2 text-sm">{recorderError}</div> : null}
                {formatCompatibilityWarning ? <div className="alert alert-info py-2 text-sm">{formatCompatibilityWarning}</div> : null}
              </div>
            </div>

            <div className="card border border-base-300 bg-base-100 shadow-sm">
              <div className="card-body gap-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="card-title text-xl">Recordings</h2>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => loadEntries()}>
                    Refresh
                  </button>
                </div>
                {isLoading ? <span className="loading loading-spinner loading-md" /> : null}
                {!isLoading && entries.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-base-300 p-4 text-sm text-base-content/60">
                    No recordings yet.
                  </div>
                ) : null}
                <div className="space-y-2">
                  {entries.map((entry) => {
                    const active = entry.takes.find((take) => take.id === entry.active_take_id) || entry.takes[0] || null;
                    return (
                      <div
                        key={entry.id}
                        className={`w-full rounded-lg border p-3 text-left transition ${
                          selectedEntry?.id === entry.id ? "border-primary bg-primary/10" : "border-base-300 bg-base-100 hover:bg-base-200"
                        }`}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => {
                            setSelectedEntry(entry);
                            setSelectedTakeId(active?.id || null);
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-semibold">{entry.title}</p>
                              <p className="text-xs text-base-content/60">{formatDate(entry.created_at)}</p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <span className="badge badge-primary badge-outline">{entrySourceLabel(entry)}</span>
                              <span className="badge badge-outline">{active?.transcription_status || "no take"}</span>
                            </div>
                          </div>
                        </button>
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            className="btn btn-error btn-outline btn-xs"
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

          <div className="card border border-base-300 bg-base-100 shadow-sm">
            <div className="card-body gap-5">
              {selectedEntry && selectedTake ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="card-title text-2xl">{selectedEntry.title}</h2>
                      <p className="text-sm text-base-content/60">{formatDate(selectedEntry.created_at)}</p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <span className="badge badge-primary badge-outline">{entrySourceLabel(selectedEntry)}</span>
                      <button type="button" className="btn btn-sm" onClick={() => setJournalMode("advanced")}>
                        Open Full Journal
                      </button>
                      <button
                        type="button"
                        className="btn btn-error btn-outline btn-sm"
                        disabled={workingAction === "delete-entry"}
                        onClick={() => handleDeleteEntry(selectedEntry)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {takeAudioUrl ? <audio className="w-full" controls src={takeAudioUrl} /> : null}

                  <div className="rounded-lg border border-base-300 bg-base-200 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="font-semibold">Transcript</h3>
                      <span className="badge badge-outline">{selectedTake.transcription_status}</span>
                    </div>
                    {selectedTake.transcript_text?.trim() ? (
                      <p className="whitespace-pre-wrap text-sm leading-6 text-base-content/80">{selectedTake.transcript_text}</p>
                    ) : (
                      <p className="text-sm text-base-content/60">
                        {simpleSavingEntryId === selectedEntry.id || workingAction === "transcribe"
                          ? "Transcription is running..."
                          : "No transcript yet."}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-base-300 p-6 text-sm text-base-content/60">
                  Select a recording to view its transcript and play the audio.
                </div>
              )}
            </div>
          </div>
        </section>
      ) : (
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
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="card-title text-xl">Audio Quality Baselines</h2>
                  <p className="text-sm text-base-content/60">
                    Default baseline: {baselines.find((baseline) => baseline.is_default)?.name || "None"}
                  </p>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={refreshBaselines}>
                  Refresh
                </button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="form-control">
                  <span className="label-text">Baseline name</span>
                  <input
                    className="input input-bordered"
                    value={baselineName}
                    onChange={(event) => setBaselineName(event.target.value)}
                    placeholder="Best desk recording"
                  />
                </label>
                <label className="form-control">
                  <span className="label-text">Upload baseline audio</span>
                  <input
                    className="file-input file-input-bordered"
                    type="file"
                    accept="audio/*"
                    onChange={(event) => setBaselineFile(event.target.files?.[0] || null)}
                  />
                </label>
                <label className="form-control">
                  <span className="label-text">Device label</span>
                  <input
                    className="input input-bordered"
                    value={baselineDeviceLabel}
                    onChange={(event) => setBaselineDeviceLabel(event.target.value)}
                    placeholder="USB mic"
                  />
                </label>
                <label className="form-control">
                  <span className="label-text">Environment label</span>
                  <input
                    className="input input-bordered"
                    value={baselineEnvironmentLabel}
                    onChange={(event) => setBaselineEnvironmentLabel(event.target.value)}
                    placeholder="Quiet office"
                  />
                </label>
              </div>
              <label className="form-control">
                <span className="label-text">Notes</span>
                <textarea
                  className="textarea textarea-bordered min-h-20"
                  value={baselineNotes}
                  onChange={(event) => setBaselineNotes(event.target.value)}
                />
              </label>
              <label className="label cursor-pointer justify-start gap-3">
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary"
                  checked={baselineIsDefault}
                  onChange={(event) => setBaselineIsDefault(event.target.checked)}
                />
                <span className="label-text">Use as default baseline</span>
              </label>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!baselineFile || workingAction === "create-baseline"}
                onClick={handleCreateBaseline}
              >
                {workingAction === "create-baseline" ? "Saving..." : "Save Baseline"}
              </button>

              <div className="space-y-3">
                {baselines.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-base-300 p-4 text-sm text-base-content/60">
                    No baselines saved yet.
                  </div>
                ) : null}
                {baselines.map((baseline) => (
                  <div key={baseline.id} className="rounded-lg border border-base-300 bg-base-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{baseline.name}</h3>
                        <p className="text-xs text-base-content/60">
                          {baseline.device_label || "No device"} · {baseline.environment_label || "No environment"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {baseline.is_default ? <span className="badge badge-primary">default</span> : null}
                        <span className="badge badge-outline">{baseline.file_format || "audio"}</span>
                      </div>
                    </div>
                    {baselineAudioUrls[baseline.id] ? (
                      <audio className="mt-3 w-full" controls src={baselineAudioUrls[baseline.id]} />
                    ) : null}
                    <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                      <span>Score: {formatNumber(baseline.quality_score, "", 0)}</span>
                      <span>Silence: {formatNumber(baseline.silence_ratio, "", 3)}</span>
                      <span>RMS: {formatNumber(baseline.rms_db, " dB", 2)}</span>
                      <span>Noise: {formatNumber(baseline.noise_floor_db, " dB", 2)}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={baseline.is_default || workingAction === "set-default-baseline"}
                        onClick={() => handleSetDefaultBaseline(baseline)}
                      >
                        Set Default
                      </button>
                      <button
                        type="button"
                        className="btn btn-error btn-outline btn-sm"
                        disabled={workingAction === "delete-baseline"}
                        onClick={() => handleDeleteBaseline(baseline)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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
                          <span className="badge badge-primary badge-outline">{entrySourceLabel(entry)}</span>
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
                    <div className="flex flex-wrap justify-end gap-2">
                      <span className="badge badge-primary badge-outline">{entrySourceLabel(selectedEntry)}</span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={!selectedEntry.script_text?.trim() && !entryForm.scriptText.trim()}
                        onClick={() => openTeleprompter(selectedEntry)}
                      >
                        Re-record From Transcript
                      </button>
                      <span className="badge badge-outline">Active: {takeLabel(activeTake)}</span>
                      <span className="badge badge-outline">Selected: {takeLabel(selectedTrainingTake)}</span>
                    </div>
                  </div>

                  {!selectedEntry.script_text?.trim() && !entryForm.scriptText.trim() ? (
                    <div className="alert alert-warning py-2 text-sm">Transcribe or enter script text first.</div>
                  ) : null}

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
                                  className="btn btn-secondary btn-xs"
                                  disabled={!selectedEntry.script_text?.trim() && !entryForm.scriptText.trim()}
                                  onClick={() => openTeleprompter(selectedEntry)}
                                >
                                  Re-record From Transcript
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
                        {(() => {
                          const metadata = parseMetadata(selectedTake.metadata_json);
                          const comparison = metadata.baseline_comparison as Record<string, number | null> | undefined;
                          return metadata.baseline_name ? (
                            <div className="mt-3 rounded-lg border border-base-300 bg-base-100 p-3 text-sm">
                              <p className="font-semibold">Baseline used: {String(metadata.baseline_name)}</p>
                              <p className="text-base-content/60">Compared to baseline</p>
                              {comparison ? (
                                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                  <span>RMS delta: {formatNumber(comparison.rms_delta_db, " dB", 2)}</span>
                                  <span>Noise delta: {formatNumber(comparison.noise_floor_delta_db, " dB", 2)}</span>
                                  <span>SNR delta: {formatNumber(comparison.snr_delta_db, " dB", 2)}</span>
                                  <span>Silence delta: {formatNumber(comparison.silence_ratio_delta, "", 3)}</span>
                                </div>
                              ) : null}
                            </div>
                          ) : null;
                        })()}
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
      )}

      {isTeleprompterOpen && selectedEntry ? (
        <div className="modal modal-open">
          <div className="modal-box max-w-5xl space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">Re-record From Transcript</h2>
                <p className="text-sm text-base-content/60">{selectedEntry.title}</p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={teleprompterCountdown !== null || isSavingTeleprompterTake}
                onClick={closeTeleprompter}
              >
                Cancel
              </button>
            </div>

            <div className="alert alert-warning">
              <span>Speak as close to the script as possible. Clean audio and accurate text improve future voice training.</span>
            </div>

            {teleprompterError ? (
              <div className="alert alert-error">
                <span>{teleprompterError}</span>
              </div>
            ) : null}
            {teleprompterRecorderError ? (
              <div className="alert alert-error">
                <span>{teleprompterRecorderError}</span>
              </div>
            ) : null}
            {teleprompterFormatWarning ? (
              <div className="alert alert-info">
                <span>{teleprompterFormatWarning}</span>
              </div>
            ) : null}

            <label className="form-control">
              <span className="label-text">Teleprompter script</span>
              <textarea
                className="textarea textarea-bordered min-h-32"
                value={teleprompterScript}
                disabled={teleprompterCountdown !== null || isTeleprompterRecording || isSavingTeleprompterTake}
                onChange={(event) => setTeleprompterScript(event.target.value)}
              />
            </label>

            <div className="rounded-lg border border-base-300 bg-base-200 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase text-base-content/60">Prompt</p>
                  <p className="text-sm text-base-content/60">Read at a steady pace and keep room noise low.</p>
                </div>
                <div className="text-right">
                  {teleprompterCountdown !== null ? (
                    <div className="text-7xl font-bold text-primary">{teleprompterCountdown}</div>
                  ) : isTeleprompterRecording ? (
                    <div>
                      <div className="badge badge-error badge-lg">Recording...</div>
                      <p className="mt-2 text-3xl font-bold">{teleprompterElapsedSeconds}s</p>
                    </div>
                  ) : (
                    <div className="badge badge-outline badge-lg">Ready</div>
                  )}
                </div>
              </div>
              <div className="max-h-80 overflow-y-auto rounded-lg bg-base-100 p-5 text-2xl font-semibold leading-relaxed text-base-content md:text-3xl">
                {teleprompterScript || "No script available."}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  !teleprompterScript.trim() ||
                  teleprompterCountdown !== null ||
                  isTeleprompterRecording ||
                  isSavingTeleprompterTake
                }
                onClick={startTeleprompterCountdown}
              >
                Start Countdown
              </button>
              <button
                type="button"
                className="btn btn-error"
                disabled={!isTeleprompterRecording || isSavingTeleprompterTake}
                onClick={stopTeleprompterRecording}
              >
                Stop Recording
              </button>
              <button
                type="button"
                className="btn"
                disabled={teleprompterCountdown !== null || isTeleprompterRecording || isSavingTeleprompterTake}
                onClick={tryTeleprompterAgain}
              >
                Try Again
              </button>
            </div>

            {teleprompterAudioUrl ? (
              <div className="rounded-lg border border-base-300 bg-base-100 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">New recording preview</span>
                  <span className="badge badge-outline">{teleprompterFileName || "re-recording"}</span>
                </div>
                <audio className="w-full" controls src={teleprompterAudioUrl} />
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={
                  !teleprompterAudioBlob ||
                  teleprompterCountdown !== null ||
                  isTeleprompterRecording ||
                  isSavingTeleprompterTake
                }
                onClick={saveTeleprompterTake}
              >
                {isSavingTeleprompterTake ? "Saving..." : "Save as New Take"}
              </button>
            </div>

            {savedTeleprompterTake ? (
              <div className="rounded-lg border border-base-300 bg-base-100 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Take {savedTeleprompterTake.take_number} saved</h3>
                    <p className="text-sm text-base-content/70">
                      Quality score: {formatNumber(savedTeleprompterTake.quality_score, "", 0)}
                    </p>
                  </div>
                  <span className={`badge ${qualityBadgeClass(savedTeleprompterTake.quality_status)}`}>
                    {savedTeleprompterTake.quality_status}
                  </span>
                </div>
                <p className="mt-3 text-sm text-base-content/70">
                  {savedTeleprompterTake.quality_status === "usable"
                    ? "This take looks usable after transcript confirmation."
                    : savedTeleprompterTake.quality_summary || "Review this take before using it."}
                </p>
                {parseReasons(savedTeleprompterTake.quality_reasons_json).length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {parseReasons(savedTeleprompterTake.quality_reasons_json).map((reason) => (
                      <span key={reason} className="badge badge-outline">
                        {reason}
                      </span>
                    ))}
                  </div>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={workingAction === "transcribe"}
                    onClick={() => handleTranscribeTake(selectedEntry.id, savedTeleprompterTake.id)}
                  >
                    Transcribe New Take
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={workingAction === "set-active"}
                    onClick={() => handleSetActiveTake(selectedEntry.id, savedTeleprompterTake.id)}
                  >
                    Set Active
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={workingAction === "analyze"}
                    onClick={() => handleAnalyzeTake(selectedEntry.id, savedTeleprompterTake.id)}
                  >
                    Analyze Quality
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={tryTeleprompterAgain}>
                    Try Again
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="modal-backdrop">
            <button
              type="button"
              disabled={teleprompterCountdown !== null || isSavingTeleprompterTake}
              onClick={closeTeleprompter}
            >
              close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
