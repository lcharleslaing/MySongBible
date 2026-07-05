import { useEffect, useMemo, useState } from "react";
import { getVoiceStatus, type VoiceStatusRecord } from "../api/system";
import { PageHeader } from "../components/ui/PageHeader";
import { StatusCard } from "../components/ui/StatusCard";

type HealthCard = {
  title: string;
  value: string;
  tone: "success" | "warning" | "error" | "info";
  detail: string;
};

const staticCards: HealthCard[] = [
  {
    title: "Frontend Shell",
    value: "Ready",
    tone: "success",
    detail: "Vite, React, TypeScript, Tailwind, and DaisyUI are scaffolded.",
  },
  {
    title: "Backend API",
    value: "Ready",
    tone: "success",
    detail: "FastAPI, SQLite settings, transcripts, STT, and TTS endpoints are available locally.",
  },
  {
    title: "Desktop Shell",
    value: "Ready",
    tone: "success",
    detail: "Electron launches the frontend, starts the backend, and exposes a narrow preload bridge.",
  },
];

function getVoiceServicesCard(voiceStatus: VoiceStatusRecord | null, error: string | null): HealthCard {
  if (error) {
    return {
      title: "Voice Services",
      value: "Unknown",
      tone: "warning",
      detail: `Voice readiness could not be loaded: ${error}`,
    };
  }

  if (!voiceStatus) {
    return {
      title: "Voice Services",
      value: "Checking",
      tone: "info",
      detail: "Checking local STT and TTS readiness.",
    };
  }

  if (voiceStatus.stt_ready && voiceStatus.tts_ready) {
    return {
      title: "Voice Services",
      value: "Complete",
      tone: "success",
      detail: "Whisper STT and Piper TTS are ready on this machine.",
    };
  }

  if (voiceStatus.stt_ready || voiceStatus.tts_ready) {
    return {
      title: "Voice Services",
      value: "Partial",
      tone: "warning",
      detail: `${voiceStatus.stt_message} ${voiceStatus.tts_message}`,
    };
  }

  return {
    title: "Voice Services",
    value: "Not Ready",
    tone: "error",
    detail: `${voiceStatus.stt_message} ${voiceStatus.tts_message}`,
  };
}

export function SystemHealthPage() {
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatusRecord | null>(null);
  const [voiceStatusError, setVoiceStatusError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    getVoiceStatus()
      .then((nextVoiceStatus) => {
        if (isMounted) {
          setVoiceStatus(nextVoiceStatus);
          setVoiceStatusError(null);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setVoiceStatusError(error instanceof Error ? error.message : "Voice status unavailable.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const cards = useMemo(
    () => [
      ...staticCards.slice(0, 2),
      getVoiceServicesCard(voiceStatus, voiceStatusError),
      staticCards[2],
    ],
    [voiceStatus, voiceStatusError],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Diagnostics"
        title="System health overview"
        description="These cards summarize the current template capabilities. Detailed live status remains available on the Settings page."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <StatusCard key={card.title} {...card} />
        ))}
      </div>
    </div>
  );
}
