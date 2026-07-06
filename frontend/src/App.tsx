import { Routes, Route, Navigate } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { HomePage } from "./pages/HomePage";
import { AudioJournalPage } from "./pages/AudioJournalPage";
import { VoiceLabPage } from "./pages/VoiceLabPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SystemHealthPage } from "./pages/SystemHealthPage";
import { LocalAiSetupPage } from "./pages/LocalAiSetupPage";
import { AppDefinitionProvider } from "./context/AppDefinitionContext";

function App() {
  return (
    <AppDefinitionProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/audio-journal" element={<AudioJournalPage />} />
          <Route path="/voice-lab" element={<VoiceLabPage />} />
          <Route path="/local-ai-setup" element={<LocalAiSetupPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/system-health" element={<SystemHealthPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </AppDefinitionProvider>
  );
}

export default App;
