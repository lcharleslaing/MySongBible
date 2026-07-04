import { placeholderRequest } from "./client";

export async function getSettingsPlaceholder() {
  return placeholderRequest({
    whisperBinaryPath: "",
    whisperModelPath: "",
    ttsEngine: "placeholder",
    databasePath: "./data/app_template_base.sqlite3",
  });
}
