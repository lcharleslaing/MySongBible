import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { getSettings, type AppDefinitionRecord, type HomePageSettingsRecord } from "../api/settings";

const defaultAppDefinition: AppDefinitionRecord = {
  package_name: "my-song-bible",
  app_version: "0.1.0",
  app_display_name: "My Song Bible",
  sidebar_show_icon: true,
  sidebar_show_eyebrow: true,
  sidebar_show_title: true,
  sidebar_show_description: true,
  sidebar_eyebrow: "My Song Bible",
  sidebar_title: "Song Workspace",
  sidebar_description: "Local-first workspace for songs, voice notes, and creative study.",
  topbar_show_eyebrow: true,
  topbar_show_title: true,
  topbar_eyebrow: "Local-First Workspace",
  topbar_title: "My Song Bible",
  home_show_eyebrow: true,
  home_show_title: true,
  home_show_description: true,
  home_eyebrow: "Overview",
  home_title: "My Song Bible",
  home_description: "A local-first workspace for capturing, reviewing, and organizing song ideas with voice-enabled tools.",
};

export const defaultHomePageSettings: HomePageSettingsRecord = {
  show_marketing_on_startup: true,
  marketing_eyebrow: "Built for local work",
  marketing_title: "Everything you need, right where you left it.",
  marketing_description: "A private, local-first workspace that brings your everyday tools together without getting in the way.",
  apps: [
    { id: "audio-journal", label: "Audio Journal", description: "Record, review, and organize spoken notes.", path: "/audio-journal", badge: "Capture", icon: "mic" },
    { id: "listen-commands", label: "Listen Commands", description: "Log content blocks from local voice commands.", path: "/listen-commands", badge: "Listen", icon: "spark" },
    { id: "settings", label: "Settings", description: "Personalize the app and configure this device.", path: "/settings", badge: "Configure", icon: "settings" },
    { id: "system-health", label: "System Health", description: "Check local services and runtime readiness.", path: "/system-health", badge: "Monitor", icon: "activity" },
  ],
};

function normalizeAppDefinition(definition: AppDefinitionRecord): AppDefinitionRecord {
  return { ...defaultAppDefinition, ...definition };
}

function normalizeHomePage(settings: HomePageSettingsRecord): HomePageSettingsRecord {
  const appsById = new Map(settings.apps.map((app) => [app.id, { ...app, icon: app.icon || "briefcase" }]));
  for (const app of defaultHomePageSettings.apps) {
    if (!appsById.has(app.id)) {
      appsById.set(app.id, app);
    }
  }

  return {
    ...defaultHomePageSettings,
    ...settings,
    apps: Array.from(appsById.values()),
  };
}

type AppDefinitionContextValue = {
  appDefinition: AppDefinitionRecord;
  homePage: HomePageSettingsRecord;
  refreshAppDefinition: () => Promise<void>;
  setAppDefinition: (definition: AppDefinitionRecord) => void;
  setHomePage: (settings: HomePageSettingsRecord) => void;
};

const AppDefinitionContext = createContext<AppDefinitionContextValue | null>(null);

export function AppDefinitionProvider({ children }: { children: ReactNode }) {
  const [appDefinition, setAppDefinition] = useState<AppDefinitionRecord>(defaultAppDefinition);
  const [homePage, setHomePage] = useState<HomePageSettingsRecord>(defaultHomePageSettings);

  const refreshAppDefinition = async () => {
    const settings = await getSettings();
    setAppDefinition(normalizeAppDefinition(settings.app_definition));
    setHomePage(normalizeHomePage(settings.home_page));
  };

  useEffect(() => {
    refreshAppDefinition().catch(() => {
      setAppDefinition(defaultAppDefinition);
    });
  }, []);

  const setNormalizedHomePage = (settings: HomePageSettingsRecord) => {
    setHomePage(normalizeHomePage(settings));
  };

  const value = useMemo(
    () => ({
      appDefinition,
      homePage,
      refreshAppDefinition,
      setAppDefinition,
      setHomePage: setNormalizedHomePage,
    }),
    [appDefinition, homePage],
  );

  return (
    <AppDefinitionContext.Provider value={value}>
      {children}
    </AppDefinitionContext.Provider>
  );
}

export function useAppDefinition() {
  const context = useContext(AppDefinitionContext);
  if (!context) {
    throw new Error("useAppDefinition must be used inside AppDefinitionProvider.");
  }
  return context;
}
