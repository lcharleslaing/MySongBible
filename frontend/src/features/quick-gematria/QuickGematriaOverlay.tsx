import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GematriaResult,
  QuickGematriaDesktopApi,
} from "./types";

const SPEECH_THRESHOLD = 0.025;
const SILENCE_AFTER_SPEECH_MS = 1200;
const MAX_RECORDING_MS = 15000;
const MIN_AUDIO_BYTES = 512;
const RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
];

function desktopApi(): QuickGematriaDesktopApi | undefined {
  return (window as typeof window & {
    quickGematria?: QuickGematriaDesktopApi;
  }).quickGematria;
}

function supportedRecorderMimeType() {
  return RECORDER_MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

function cleanSpeechText(value: string) {
  return value
    .replace(/\[(?:blank[_\s-]*audio|silence|music)\]|\((?:blank[_\s-]*audio|silence|music)\)/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s,.;:!?-]+/, "")
    .replace(/[\s,;:-]+$/, "")
    .trim();
}

type QuickGematriaOverlayProps = {
  autoStart?: boolean;
  hideOnEscape?: boolean;
  variant?: "popup" | "embedded";
};

export default function QuickGematriaOverlay({
  autoStart = true,
  hideOnEscape = true,
  variant = "popup",
}: QuickGematriaOverlayProps) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<GematriaResult | null>(null);
  const [status, setStatus] = useState("Ready");
  const [recording, setRecording] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const frameRef = useRef<number | null>(null);
  const startedRef = useRef(0);
  const speechHeardRef = useRef(false);
  const lastSpeechRef = useRef(0);
  const isStartingRef = useRef(false);
  const isRecordingRef = useRef(false);
  const recordingSessionRef = useRef(0);

  const calculate = useCallback(async (value: string) => {
    const api = desktopApi();
    const trimmed = value.trim();

    if (!api || !trimmed) {
      setResult(null);
      return;
    }

    try {
      setResult(await api.calculate(trimmed));
    } catch (error) {
      console.error(error);
      setStatus(`Calculation failed: ${String(error)}`);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void calculate(text);
    }, 60);

    return () => window.clearTimeout(timeout);
  }, [text, calculate]);

  const stopMedia = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
    }
    audioContextRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const finishRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      if (recorder.state === "recording") {
        recorder.requestData();
      }
      recorder.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    const api = desktopApi();

    if (!api) {
      setStatus("Desktop Quick Gematria bridge unavailable");
      return;
    }

    if (isStartingRef.current || isRecordingRef.current) {
      return;
    }

    isStartingRef.current = true;
    const sessionId = recordingSessionRef.current + 1;
    recordingSessionRef.current = sessionId;
    chunksRef.current = [];
    speechHeardRef.current = false;
    lastSpeechRef.current = 0;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      streamRef.current = stream;

      const mimeType = supportedRecorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      startedRef.current = performance.now();

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        if (recordingSessionRef.current !== sessionId) {
          return;
        }

        isRecordingRef.current = false;
        isStartingRef.current = false;
        setRecording(false);
        stopMedia();

        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });

        if (blob.size < MIN_AUDIO_BYTES) {
          setStatus("No usable audio captured. You can still type.");
          return;
        }

        setStatus("Transcribing...");
        const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));

        try {
          const response = await api.transcribe({
            audioBytes: bytes,
            mimeType: blob.type || "audio/webm",
          });

          const recognized = cleanSpeechText(response.text || "");
          setText(recognized);
          setStatus(recognized ? "Calculated" : "No speech recognized");
        } catch (error) {
          console.error(error);
          setStatus(
            `Whisper unavailable. You can still type: ${String(error)}`,
          );
        }
      };

      recorder.start(200);
      isStartingRef.current = false;
      isRecordingRef.current = true;
      setRecording(true);
      setStatus("Listening...");

      const context = new AudioContext();
      audioContextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);

      const samples = new Float32Array(analyser.fftSize);

      const monitor = () => {
        analyser.getFloatTimeDomainData(samples);

        let sum = 0;
        for (const sample of samples) {
          sum += sample * sample;
        }

        const rms = Math.sqrt(sum / samples.length);
        const now = performance.now();

        if (rms >= SPEECH_THRESHOLD) {
          speechHeardRef.current = true;
          lastSpeechRef.current = now;
        }

        const maxReached =
          now - startedRef.current >= MAX_RECORDING_MS;

        const silenceReached =
          speechHeardRef.current &&
          now - lastSpeechRef.current >= SILENCE_AFTER_SPEECH_MS;

        if (silenceReached || maxReached) {
          finishRecording();
          return;
        }

        frameRef.current = requestAnimationFrame(monitor);
      };

      frameRef.current = requestAnimationFrame(monitor);
    } catch (error) {
      isStartingRef.current = false;
      isRecordingRef.current = false;
      stopMedia();
      setRecording(false);
      setStatus(`Microphone unavailable: ${String(error)}`);
    }
  }, [finishRecording, stopMedia]);

  useEffect(() => {
    const api = desktopApi();
    if (!api) return;

    const autoStartTimers = new Set<number>();
    const queueAutoStart = (delayMs: number) => {
      const timer = window.setTimeout(() => {
        autoStartTimers.delete(timer);
        void startRecording();
      }, delayMs);
      autoStartTimers.add(timer);
    };

    const removeOpened = autoStart
      ? api.onOpened(() => {
          queueAutoStart(100);
        })
      : undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (hideOnEscape && event.key === "Escape") {
        recordingSessionRef.current += 1;
        isStartingRef.current = false;
        isRecordingRef.current = false;
        finishRecording();
        stopMedia();
        void api.hide();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    if (autoStart) {
      queueAutoStart(250);
    }

    return () => {
      autoStartTimers.forEach((timer) => window.clearTimeout(timer));
      removeOpened?.();
      window.removeEventListener("keydown", onKeyDown);
      recordingSessionRef.current += 1;
      isStartingRef.current = false;
      isRecordingRef.current = false;
      finishRecording();
      stopMedia();
    };
  }, [autoStart, finishRecording, hideOnEscape, startRecording, stopMedia]);

  const isEmbedded = variant === "embedded";

  return (
    <main className={isEmbedded ? "w-full" : "min-h-screen bg-base-200 p-5"}>
      <section className={isEmbedded ? "flex min-h-[480px] max-w-3xl flex-col rounded-box border border-base-300 bg-base-100 p-6 shadow-sm" : "mx-auto flex min-h-[480px] max-w-2xl flex-col rounded-3xl bg-base-100 p-6 shadow-2xl"}>
        <header className="mb-5 flex items-start justify-between gap-5">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.22em] opacity-55">
              My Song Bible
            </div>
            <h1 className="text-3xl font-black">Quick Gematria</h1>
            <p className="mt-1 text-sm opacity-65">{status}</p>
          </div>

          <button
            type="button"
            className={`btn ${
              recording ? "btn-error" : "btn-primary"
            }`}
            onClick={() => {
              if (recording) {
                finishRecording();
              } else {
                void startRecording();
              }
            }}
          >
            {recording ? "Stop" : "Speak"}
          </button>
        </header>

        <textarea
          autoFocus
          className="textarea textarea-bordered min-h-32 w-full text-xl leading-relaxed"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Speak or type a phrase…"
        />

        <div className="mt-6 grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-base-200 p-4 text-center">
            <div className="text-xs font-bold uppercase opacity-55">
              Jewish
            </div>
            <div className="mt-2 text-4xl font-black">
              {result?.jewish ?? "—"}
            </div>
          </div>

          <div className="rounded-2xl bg-base-200 p-4 text-center">
            <div className="text-xs font-bold uppercase opacity-55">
              English
            </div>
            <div className="mt-2 text-4xl font-black">
              {result?.english ?? "—"}
            </div>
          </div>

          <div className="rounded-2xl bg-base-200 p-4 text-center">
            <div className="text-xs font-bold uppercase opacity-55">
              Simple
            </div>
            <div className="mt-2 text-4xl font-black">
              {result?.simple ?? "—"}
            </div>
          </div>
        </div>

        {isEmbedded ? null : (
          <div className="mt-auto pt-6 text-center text-xs opacity-45">
            Ctrl+Alt+G opens Quick Gematria · Esc hides it
          </div>
        )}
      </section>
    </main>
  );
}
