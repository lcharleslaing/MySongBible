import { QuickGematriaOverlay } from "../features/quick-gematria";

export function QuickGematriaPage() {
  return (
    <div className="space-y-6">
      <QuickGematriaOverlay autoStart={false} hideOnEscape={false} variant="embedded" />
    </div>
  );
}
