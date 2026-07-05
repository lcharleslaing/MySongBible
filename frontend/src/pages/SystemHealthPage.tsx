import { PageHeader } from "../components/ui/PageHeader";
import { StatusCard } from "../components/ui/StatusCard";

const cards = [
  {
    title: "Frontend Shell",
    value: "Ready",
    tone: "success" as const,
    detail: "Vite, React, TypeScript, Tailwind, and DaisyUI are scaffolded.",
  },
  {
    title: "Backend API",
    value: "Ready",
    tone: "success" as const,
    detail: "FastAPI, SQLite settings, transcripts, STT, and TTS endpoints are available locally.",
  },
  {
    title: "Voice Services",
    value: "Ready",
    tone: "success" as const,
    detail: "Local STT and TTS wiring is in place. Voice cloning remains future scaffold work and is not required for template health.",
  },
  {
    title: "Desktop Shell",
    value: "Ready",
    tone: "success" as const,
    detail: "Electron launches the frontend, starts the backend, and exposes a narrow preload bridge.",
  },
];

export function SystemHealthPage() {
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
