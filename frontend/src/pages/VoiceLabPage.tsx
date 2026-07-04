import { PageHeader } from "../components/ui/PageHeader";

export function VoiceLabPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Voice Lab"
        title="Speech workflow playground"
        description="This page is scaffolded for local STT and TTS flows. Buttons are placeholders until backend voice services are connected."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="card-title">Speech to Text</h2>
              <span className="badge badge-outline">Placeholder</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" className="btn btn-primary" disabled>
                Record
              </button>
              <button type="button" className="btn btn-outline" disabled>
                Transcribe
              </button>
            </div>
            <div className="rounded-box min-h-56 border border-base-300 bg-base-200 p-4">
              <p className="text-sm font-medium text-base-content/70">Transcript Output</p>
              <p className="mt-4 text-sm text-base-content/50">
                Transcript text will appear here after local audio capture and transcription are wired in.
              </p>
            </div>
          </div>
        </section>

        <section className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="card-title">Text to Speech</h2>
              <span className="badge badge-outline">Placeholder</span>
            </div>
            <label className="form-control gap-2">
              <span className="label-text font-medium">Text Input</span>
              <textarea
                className="textarea textarea-bordered min-h-40"
                placeholder="Enter text for future local TTS playback..."
                defaultValue="This is a starter interface for future local text-to-speech testing."
              />
            </label>
            <div className="flex justify-end">
              <button type="button" className="btn btn-secondary" disabled>
                Speak
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
