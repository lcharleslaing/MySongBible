import { PageHeader } from "../components/ui/PageHeader";

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Local configuration preview"
        description="These fields are UI placeholders for future persisted settings. They reflect the intended local-first configuration surface."
      />

      <section className="card border border-base-300 bg-base-100 shadow-sm">
        <div className="card-body gap-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <label className="form-control gap-2">
              <span className="label-text font-medium">Whisper Binary Path</span>
              <input
                type="text"
                className="input input-bordered"
                placeholder="/path/to/whisper-cli"
                defaultValue=""
              />
            </label>

            <label className="form-control gap-2">
              <span className="label-text font-medium">Whisper Model Path</span>
              <input
                type="text"
                className="input input-bordered"
                placeholder="/path/to/ggml-model.bin"
                defaultValue=""
              />
            </label>

            <label className="form-control gap-2">
              <span className="label-text font-medium">TTS Engine</span>
              <select className="select select-bordered" defaultValue="placeholder">
                <option value="placeholder">Placeholder</option>
                <option value="piper">Piper</option>
              </select>
            </label>

            <label className="form-control gap-2">
              <span className="label-text font-medium">SQLite Database Path</span>
              <input
                type="text"
                className="input input-bordered"
                value="./data/app_template_base.sqlite3"
                readOnly
              />
            </label>
          </div>

          <div className="alert">
            <span className="text-sm">
              Settings persistence is not connected yet. This page is only establishing the frontend contract.
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
