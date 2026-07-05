import { ChangeEvent, useEffect, useMemo, useState } from "react";

import { ApiError, buildApiUrl } from "../api/client";
import { TranscriptRecord, transcribeAudioRecording } from "../api/stt";
import { VoiceEngineStatusRecord, getVoiceStatus } from "../api/system";
import { TtsSynthesisRecord, synthesizeSpeech } from "../api/tts";
import { PageHeader } from "../components/ui/PageHeader";
import { useAudioRecorder } from "../features/voice-lab/useAudioRecorder";

type AudioSource = {
  blob: Blob;
  fileName: string;
  mimeType: string;
  sourceLabel: string;
  previewUrl: string;
};

function safeFileName(value: string, fallback: string) {
  const cleaned = value
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");

  return cleaned || fallback;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatEngineOptionLabel(engine: VoiceEngineStatusRecord) {
  if (engine.id === "piper") {
    return `${engine.label} - ${engine.available ? "ready" : "not configured"}`;
  }

  return `${engine.label} - ${engine.available ? "ready" : "unavailable"}`;
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}

export function VoiceLabPage() {
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
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
  const [selectedAudioUrl, setSelectedAudioUrl] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptRecord, setTranscriptRecord] = useState<TranscriptRecord | null>(null);
  const [transcriptionError, setTranscriptionError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [audioExportMessage, setAudioExportMessage] = useState("");
  const [transcriptExportMessage, setTranscriptExportMessage] = useState("");
  const [ttsText, setTtsText] = useState("This is a starter interface for future local text-to-speech testing.");
  const [ttsEngine, setTtsEngine] = useState("mock");
  const [ttsEngines, setTtsEngines] = useState<VoiceEngineStatusRecord[]>([]);
  const [isLoadingVoiceStatus, setIsLoadingVoiceStatus] = useState(true);
  const [voiceProfile, setVoiceProfile] = useState("");
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [ttsResult, setTtsResult] = useState<TtsSynthesisRecord | null>(null);
  const [ttsError, setTtsError] = useState("");
  const [ttsSuccessMessage, setTtsSuccessMessage] = useState("");

  useEffect(() => {
    return () => {
      if (selectedAudioUrl) {
        URL.revokeObjectURL(selectedAudioUrl);
      }
    };
  }, [selectedAudioUrl]);

  useEffect(() => {
    let cancelled = false;

    const loadVoiceStatus = async () => {
      setIsLoadingVoiceStatus(true);

      try {
        const status = await getVoiceStatus();
        if (cancelled) {
          return;
        }

        setTtsEngines(status.engines);
        setTtsEngine(status.default_engine || "mock");
      } catch (error) {
        if (!cancelled) {
          setTtsError(error instanceof Error ? error.message : "Voice status is not available.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingVoiceStatus(false);
        }
      }
    };

    loadVoiceStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeAudioSource = useMemo<AudioSource | null>(() => {
    if (selectedAudioFile && selectedAudioUrl) {
      return {
        blob: selectedAudioFile,
        fileName: selectedAudioFile.name,
        mimeType: selectedAudioFile.type || "audio/mpeg",
        sourceLabel: "Local audio file",
        previewUrl: selectedAudioUrl,
      };
    }

    if (recordedAudioBlob && recordedAudioUrl) {
      return {
        blob: recordedAudioBlob,
        fileName: recordedFileName,
        mimeType: recordedMimeType,
        sourceLabel: "Recorded clip",
        previewUrl: recordedAudioUrl,
      };
    }

    return null;
  }, [recordedAudioBlob, recordedAudioUrl, recordedFileName, recordedMimeType, selectedAudioFile, selectedAudioUrl]);

  const handleAudioFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      return;
    }

    if (selectedAudioUrl) {
      URL.revokeObjectURL(selectedAudioUrl);
    }

    const nextUrl = URL.createObjectURL(file);
    setSelectedAudioFile(file);
    setSelectedAudioUrl(nextUrl);
    setTranscriptionError("");
    setSuccessMessage("");
    setAudioExportMessage("");
  };

  const clearSelectedAudioFile = () => {
    if (selectedAudioUrl) {
      URL.revokeObjectURL(selectedAudioUrl);
    }

    setSelectedAudioFile(null);
    setSelectedAudioUrl("");
    setAudioExportMessage("");
  };

  const saveActiveAudio = () => {
    if (!activeAudioSource) {
      setAudioExportMessage("Record audio or choose an audio file before saving.");
      return;
    }

    downloadBlob(activeAudioSource.blob, safeFileName(activeAudioSource.fileName, "voice-lab-audio.webm"));
    setAudioExportMessage("Audio save started.");
  };

  const sendForTranscription = async () => {
    if (!activeAudioSource) {
      setTranscriptionError("Record audio or choose an audio file before sending it to the transcription service.");
      setSuccessMessage("");
      return;
    }

    setIsTranscribing(true);
    setTranscriptionError("");
    setSuccessMessage("");
    setTranscriptExportMessage("");

    try {
      const result = await transcribeAudioRecording({
        audioBlob: activeAudioSource.blob,
        fileName: activeAudioSource.fileName,
        title: `Voice Lab ${new Date().toLocaleString()}`,
      });
      setTranscriptRecord(result);
      setSuccessMessage("Transcription completed successfully.");
    } catch (error) {
      if (error instanceof ApiError) {
        const details = error.details as
          | { detail?: string | { message?: string } }
          | null
          | undefined;
        const message =
          typeof details?.detail === "object"
            ? details.detail?.message || error.message
            : typeof details?.detail === "string"
              ? details.detail
              : error.message;
        setTranscriptionError(message || "Transcription request failed.");
      } else {
        setTranscriptionError(error instanceof Error ? error.message : "Transcription request failed.");
      }
    } finally {
      setIsTranscribing(false);
    }
  };

  const transcriptExportFileName = useMemo(() => {
    if (!transcriptRecord) {
      return "voice-lab-transcript.txt";
    }

    const sourceName = transcriptRecord.source_audio_name || transcriptRecord.title || `transcript-${transcriptRecord.id}`;
    const withoutExtension = sourceName.replace(/\.[^.]+$/, "");
    return `${safeFileName(withoutExtension, `transcript-${transcriptRecord.id}`)}.txt`;
  }, [transcriptRecord]);

  const saveTranscript = () => {
    if (!transcriptRecord?.transcript_text.trim()) {
      setTranscriptExportMessage("No transcript is available to save yet.");
      return;
    }

    const transcriptBlob = new Blob([transcriptRecord.transcript_text.trimEnd(), "\n"], {
      type: "text/plain;charset=utf-8",
    });

    downloadBlob(transcriptBlob, transcriptExportFileName);
    setTranscriptExportMessage("Transcript save started.");
  };

  const copyTranscript = async () => {
    if (!transcriptRecord?.transcript_text.trim()) {
      setTranscriptExportMessage("No transcript is available to copy yet.");
      return;
    }

    try {
      await copyTextToClipboard(transcriptRecord.transcript_text);
      setTranscriptExportMessage("Transcript copied to clipboard.");
    } catch (error) {
      setTranscriptExportMessage(error instanceof Error ? error.message : "Could not copy transcript.");
    }
  };

  const [ttsAudioPreviewSrc, setTtsAudioPreviewSrc] = useState("");

  useEffect(() => {
    let cancelled = false;

    if (!ttsResult) {
      setTtsAudioPreviewSrc("");
      return;
    }

    const resolvePreviewUrl = async () => {
      const candidate = ttsResult.audio_file_url || "";
      if (!candidate) {
        setTtsAudioPreviewSrc("");
        return;
      }

      const nextUrl = candidate.startsWith("http://") || candidate.startsWith("https://")
        ? candidate
        : await buildApiUrl(candidate);

      if (!cancelled) {
        setTtsAudioPreviewSrc(nextUrl);
      }
    };

    resolvePreviewUrl().catch(() => {
      if (!cancelled) {
        setTtsAudioPreviewSrc("");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [ttsResult]);

  const ttsOutputPath = useMemo(() => {
    if (!ttsResult?.audio_file_path) {
      return "";
    }

    return ttsResult.audio_file_path;
  }, [ttsResult]);

  const selectedTtsEngine = useMemo(() => {
    return ttsEngines.find((engine) => engine.id === ttsEngine) || null;
  }, [ttsEngine, ttsEngines]);

  const selectedEngineSupportsProfiles = Boolean(selectedTtsEngine?.supports_voice_profiles);
  const canRunSelectedTtsEngine = !selectedTtsEngine || selectedTtsEngine.available;

  const handleTtsEngineChange = (engineId: string) => {
    const nextEngine = ttsEngines.find((engine) => engine.id === engineId) || null;
    setTtsEngine(engineId);
    if (!nextEngine?.supports_voice_profiles) {
      setVoiceProfile("");
    }
  };

  const sendForSynthesis = async () => {
    if (!ttsText.trim()) {
      setTtsError("Enter text before sending it to the TTS service.");
      setTtsSuccessMessage("");
      return;
    }

    if (selectedTtsEngine && !selectedTtsEngine.available) {
      setTtsError(selectedTtsEngine.message);
      setTtsSuccessMessage("");
      return;
    }

    setIsSynthesizing(true);
    setTtsError("");
    setTtsSuccessMessage("");
    setTtsResult(null);

    try {
      const result = await synthesizeSpeech({
        text: ttsText.trim(),
        engine: ttsEngine || undefined,
        voice_profile: selectedEngineSupportsProfiles ? voiceProfile.trim() || undefined : undefined,
      });
      setTtsResult(result);
      setTtsSuccessMessage("Speech synthesis completed successfully.");
    } catch (error) {
      let message = "Speech synthesis failed.";
      let failedJobId = 0;

      if (error instanceof ApiError) {
        const details = error.details as
          | { detail?: string | { message?: string; job_id?: number; status?: string } }
          | null
          | undefined;
        message =
          typeof details?.detail === "object"
            ? details.detail?.message || error.message
            : typeof details?.detail === "string"
              ? details.detail
              : error.message;

        if (typeof details?.detail === "object" && typeof details.detail?.job_id === "number") {
          failedJobId = details.detail.job_id;
        }
      } else {
        message = error instanceof Error ? error.message : "Speech synthesis failed.";
      }

      setTtsError(message || "Speech synthesis failed.");
      setTtsResult({
        job_id: failedJobId,
        audio_file_path: null,
        audio_file_url: null,
        engine_used: selectedTtsEngine?.id || ttsEngine || "unknown",
        status: "failed",
        error: message || "Speech synthesis failed.",
      });
    } finally {
      setIsSynthesizing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Voice Lab"
        title="Speech workflow playground"
        description="Record a short clip with the local microphone or choose an existing audio file, then send it to the backend Whisper.cpp transcription endpoint."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="card-title">Speech to Text</h2>
              <span className={`badge ${isRecording ? "badge-error" : transcriptRecord ? "badge-success" : "badge-outline"}`}>
                {isRecording ? "Recording" : transcriptRecord ? "Transcribed" : "Ready"}
              </span>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                className="btn btn-primary"
                disabled={isRecording || isTranscribing}
                onClick={startRecording}
              >
                Start Recording
              </button>
              <button
                type="button"
                className="btn btn-outline"
                disabled={!isRecording || isTranscribing}
                onClick={stopRecording}
              >
                Stop Recording
              </button>
              <button
                type="button"
                className={`btn btn-secondary ${isTranscribing ? "loading" : ""}`}
                disabled={!activeAudioSource || isRecording || isTranscribing}
                onClick={sendForTranscription}
              >
                Transcribe
              </button>
              <button type="button" className="btn btn-ghost" disabled={isRecording || isTranscribing} onClick={resetRecording}>
                Reset Recording
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={!selectedAudioFile || isRecording || isTranscribing}
                onClick={clearSelectedAudioFile}
              >
                Clear File
              </button>
            </div>

            <label className="form-control gap-2">
              <span className="label-text font-medium">Or choose a local audio file</span>
              <input
                type="file"
                accept=".mp3,.ogg,.wav,.flac,.m4a,.webm,audio/mpeg,audio/ogg,audio/wav,audio/flac,audio/mp4,audio/m4a,audio/webm"
                className="file-input file-input-bordered w-full"
                onChange={handleAudioFileSelection}
                disabled={isRecording || isTranscribing}
              />
              <span className="label-text-alt text-base-content/60">
                Use this when you want to send an existing MP3, WAV, OGG, or FLAC file instead of a fresh recording.
              </span>
            </label>

            {activeAudioSource ? (
              <div className="flex flex-wrap gap-2 text-xs text-base-content/60">
                <span className="badge badge-outline">{activeAudioSource.sourceLabel}</span>
                <span className="badge badge-outline">{activeAudioSource.fileName}</span>
                {activeAudioSource.mimeType ? (
                  <span className="badge badge-outline">{activeAudioSource.mimeType}</span>
                ) : null}
              </div>
            ) : null}

            {formatCompatibilityWarning && !selectedAudioFile ? (
              <div className="alert alert-warning">
                <span className="text-sm">{formatCompatibilityWarning}</span>
              </div>
            ) : null}

            {recorderError ? (
              <div className="alert alert-error">
                <span className="text-sm">{recorderError}</span>
              </div>
            ) : null}

            {transcriptionError ? (
              <div className="alert alert-error">
                <span className="text-sm">{transcriptionError}</span>
              </div>
            ) : null}

            {successMessage ? (
              <div className="alert alert-success">
                <span className="text-sm">{successMessage}</span>
              </div>
            ) : null}

            <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="rounded-box border border-base-300 bg-base-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-base-content/70">Audio Preview</p>
                  <button
                    type="button"
                    className="btn btn-outline btn-xs"
                    disabled={!activeAudioSource}
                    onClick={saveActiveAudio}
                  >
                    Save Audio
                  </button>
                </div>
                {activeAudioSource ? (
                  <div className="mt-4 space-y-3">
                    <audio className="w-full" controls src={activeAudioSource.previewUrl}>
                      <track kind="captions" />
                    </audio>
                    <p className="text-xs text-base-content/60">
                      The selected audio source will be uploaded as a single file-based transcription request.
                    </p>
                    {audioExportMessage ? (
                      <p className="text-xs text-success">{audioExportMessage}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-base-content/50">
                    No audio selected yet. Record a clip or choose a local file to preview it here.
                  </p>
                )}
              </div>

              <div className="rounded-box min-h-56 border border-base-300 bg-base-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-base-content/70">Transcript Output</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn btn-outline btn-xs"
                      disabled={!transcriptRecord?.transcript_text.trim()}
                      onClick={saveTranscript}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-xs"
                      disabled={!transcriptRecord?.transcript_text.trim()}
                      onClick={copyTranscript}
                    >
                      Copy
                    </button>
                  </div>
                </div>
                {isTranscribing ? (
                  <div className="mt-4 flex items-center gap-3 text-sm text-base-content/60">
                    <span className="loading loading-spinner loading-sm" />
                    <span>Sending audio to the backend transcription service...</span>
                  </div>
                ) : transcriptRecord ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="badge badge-outline">#{transcriptRecord.id}</span>
                      <span className="badge badge-outline">{transcriptRecord.stt_engine}</span>
                      {transcriptRecord.stt_model ? (
                        <span className="badge badge-outline">{transcriptRecord.stt_model}</span>
                      ) : null}
                    </div>
                    <div className="whitespace-pre-wrap text-sm text-base-content/80">
                      {transcriptRecord.transcript_text}
                    </div>
                    {transcriptExportMessage ? (
                      <p className="text-xs text-success">{transcriptExportMessage}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-base-content/50">
                    Transcript text will appear here after the audio file is sent to `/api/stt/transcribe`.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="card-title">Text to Speech</h2>
              <span className={`badge ${isSynthesizing ? "badge-warning" : ttsResult?.status === "failed" ? "badge-error" : ttsResult ? "badge-success" : "badge-outline"}`}>
                {isSynthesizing ? "Synthesizing" : ttsResult?.status === "failed" ? "Failed" : ttsResult ? "Ready" : "Idle"}
              </span>
            </div>

            {ttsEngines.length > 0 ? (
              <div className="rounded-box border border-base-300 bg-base-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-base-content/60">Engine Readiness</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {ttsEngines.map((engine) => (
                    <div key={engine.id} className="flex items-start justify-between gap-3 rounded-box bg-base-100 p-3">
                      <div>
                        <p className="text-sm font-medium">{engine.label}</p>
                        <p className="mt-1 text-xs text-base-content/60">{engine.message}</p>
                      </div>
                      <span className={`badge shrink-0 ${engine.available ? "badge-success" : "badge-warning"}`}>
                        {engine.available ? "ready" : "not configured"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : isLoadingVoiceStatus ? (
              <div className="alert">
                <span className="loading loading-spinner loading-sm" />
                <span className="text-sm">Loading TTS engine status...</span>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <label className="form-control gap-2">
                <span className="label-text font-medium">Engine</span>
                <select
                  className="select select-bordered"
                  value={ttsEngine}
                  onChange={(event) => handleTtsEngineChange(event.target.value)}
                  disabled={isSynthesizing || isLoadingVoiceStatus}
                >
                  {ttsEngines.length > 0 ? (
                    ttsEngines.map((engine) => (
                      <option key={engine.id} value={engine.id} disabled={!engine.available}>
                        {formatEngineOptionLabel(engine)}
                      </option>
                    ))
                  ) : (
                    <option value="mock">Mock</option>
                  )}
                </select>
                {selectedTtsEngine ? (
                  <span className={`label-text-alt ${selectedTtsEngine.available ? "text-base-content/60" : "text-warning"}`}>
                    {selectedTtsEngine.message}
                  </span>
                ) : null}
                {selectedTtsEngine && !selectedTtsEngine.available ? (
                  <span className="label-text-alt text-warning">This engine cannot synthesize until it is configured in Settings.</span>
                ) : null}
              </label>

              <label className="form-control gap-2">
                <span className="label-text font-medium">Voice Profile (future voice-cloning)</span>
                <input
                  type="text"
                  className="input input-bordered"
                  placeholder="Future voice-cloning profile"
                  value={voiceProfile}
                  onChange={(event) => setVoiceProfile(event.target.value)}
                  disabled={isSynthesizing || !selectedEngineSupportsProfiles}
                />
                {!selectedEngineSupportsProfiles ? (
                  <span className="label-text-alt text-base-content/60">
                    Mock and Piper do not support voice profiles yet, so this value is not sent during synthesis.
                  </span>
                ) : null}
              </label>
            </div>

            <label className="form-control gap-2">
              <span className="label-text font-medium">Text Input</span>
              <textarea
                className="textarea textarea-bordered min-h-40"
                placeholder="Enter text for local TTS playback..."
                value={ttsText}
                onChange={(event) => setTtsText(event.target.value)}
                disabled={isSynthesizing}
              />
            </label>

            {ttsError ? (
              <div className="alert alert-error">
                <span className="text-sm">{ttsError}</span>
              </div>
            ) : null}

            {ttsSuccessMessage ? (
              <div className="alert alert-success">
                <span className="text-sm">{ttsSuccessMessage}</span>
              </div>
            ) : null}

            <div className="flex justify-end">
              <button
                type="button"
                className={`btn btn-secondary ${isSynthesizing ? "loading" : ""}`}
                disabled={!ttsText.trim() || isSynthesizing || isLoadingVoiceStatus || !canRunSelectedTtsEngine}
                onClick={sendForSynthesis}
              >
                Speak
              </button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="rounded-box border border-base-300 bg-base-200 p-4">
                <p className="text-sm font-medium text-base-content/70">Synthesis Result</p>
                {isSynthesizing ? (
                  <div className="mt-4 flex items-center gap-3 text-sm text-base-content/60">
                    <span className="loading loading-spinner loading-sm" />
                    <span>Sending text to the backend TTS service...</span>
                  </div>
                ) : ttsResult ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                      {ttsResult.job_id ? <span className="badge badge-outline">Job #{ttsResult.job_id}</span> : null}
                      <span className="badge badge-outline">Engine: {ttsResult.engine_used}</span>
                      <span className={`badge ${ttsResult.status === "failed" ? "badge-error" : "badge-outline"}`}>Status: {ttsResult.status}</span>
                    </div>
                    {ttsOutputPath ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-base-content/60">Local Output Path</p>
                        <p className="mt-1 break-all text-sm text-base-content/70">{ttsOutputPath}</p>
                      </div>
                    ) : null}
                    {ttsResult.audio_file_url ? (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-base-content/60">Playable URL</p>
                        <p className="mt-1 break-all text-sm text-base-content/70">{ttsResult.audio_file_url}</p>
                      </div>
                    ) : null}
                    {ttsResult.error ? (
                      <div className="alert alert-error">
                        <span className="text-sm">{ttsResult.error}</span>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-base-content/50">
                    Job status, engine used, and output path will appear here after synthesis.
                  </p>
                )}
              </div>

              <div className="rounded-box border border-base-300 bg-base-200 p-4">
                <p className="text-sm font-medium text-base-content/70">Audio Output</p>
                {ttsAudioPreviewSrc ? (
                  <div className="mt-4 space-y-3">
                    <audio className="w-full" controls src={ttsAudioPreviewSrc}>
                      <track kind="captions" />
                    </audio>
                    <p className="text-xs text-base-content/60">
                      Playback is served through the backend audio route instead of direct file access.
                    </p>
                  </div>
                ) : ttsResult ? (
                  <p className="mt-4 text-sm text-base-content/50">
                    {ttsResult.status === "failed"
                      ? "Synthesis failed, so there is no playable audio URL."
                      : "A TTS result was returned, but no backend playback URL is available."}
                  </p>
                ) : (
                  <p className="mt-4 text-sm text-base-content/50">
                    Synthesized audio will appear here when the backend returns an HTTP playback URL.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
