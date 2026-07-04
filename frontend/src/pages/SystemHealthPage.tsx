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
    value: "Pending",
    tone: "warning" as const,
    detail: "API connectivity is intentionally deferred until the backend phase.",
  },
  {
    title: "Voice Services",
    value: "Pending",
    tone: "warning" as const,
    detail: "Local STT and TTS engines will plug into this UI later.",
  },
  {
    title: "Desktop Shell",
    value: "Pending",
    tone: "info" as const,
    detail: "Electron process integration has not been wired into the frontend yet.",
  },
];

export function SystemHealthPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Diagnostics"
        title="System health overview"
        description="Status cards below reflect scaffold progress only. Live backend and local engine health checks are not connected yet."
      />

      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((card) => (
          <StatusCard key={card.title} {...card} />
        ))}
      </div>
    </div>
  );
}
