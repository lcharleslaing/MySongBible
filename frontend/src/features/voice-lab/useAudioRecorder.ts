import { useEffect, useMemo, useRef, useState } from "react";

const preferredMimeTypes = [
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/webm;codecs=opus",
  "audio/webm",
] as const;

function getSupportedMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  return preferredMimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || "";
}

function guessFileExtension(mimeType: string) {
  if (mimeType.includes("ogg")) {
    return "ogg";
  }

  if (mimeType.includes("webm")) {
    return "webm";
  }

  if (mimeType.includes("wav")) {
    return "wav";
  }

  return "bin";
}

export function useAudioRecorder() {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [recorderError, setRecorderError] = useState("");
  const [mimeType, setMimeType] = useState("");

  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }

      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [audioUrl]);

  const formatCompatibilityWarning = useMemo(() => {
    if (!mimeType || mimeType.includes("ogg")) {
      return "";
    }

    return "Recorder fallback is using audio/webm. The backend will convert the recording to WAV before sending it to whisper.cpp.";
  }, [mimeType]);

  const startRecording = async () => {
    setRecorderError("");

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setRecorderError("Audio recording is not available in this environment.");
      return;
    }

    if (typeof MediaRecorder === "undefined") {
      setRecorderError("MediaRecorder is not supported in this browser runtime.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supportedMimeType = getSupportedMimeType();
      const recorder = supportedMimeType
        ? new MediaRecorder(stream, { mimeType: supportedMimeType })
        : new MediaRecorder(stream);

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      setAudioBlob(null);
      setMimeType(recorder.mimeType || supportedMimeType || "");

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl("");
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setRecorderError("Recording failed. Check microphone permissions and try again.");
        setIsRecording(false);
      };

      recorder.onstop = () => {
        const nextMimeType = recorder.mimeType || supportedMimeType || "audio/webm";
        const nextBlob = new Blob(audioChunksRef.current, { type: nextMimeType });
        const nextAudioUrl = URL.createObjectURL(nextBlob);

        setAudioBlob(nextBlob);
        setAudioUrl(nextAudioUrl);
        setMimeType(nextMimeType);
        setIsRecording(false);

        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      };

      recorder.start();
      setIsRecording(true);
    } catch (error) {
      setRecorderError(error instanceof Error ? error.message : "Could not access the microphone.");
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      return;
    }

    recorder.stop();
  };

  const resetRecording = () => {
    mediaRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaRecorderRef.current = null;
    mediaStreamRef.current = null;
    audioChunksRef.current = [];
    setIsRecording(false);
    setAudioBlob(null);
    setRecorderError("");
    setMimeType("");

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl("");
    }
  };

  const fileName = audioBlob ? `voice-lab-recording.${guessFileExtension(mimeType)}` : "";

  return {
    audioBlob,
    audioUrl,
    fileName,
    formatCompatibilityWarning,
    isRecording,
    mimeType,
    recorderError,
    resetRecording,
    startRecording,
    stopRecording,
  };
}
