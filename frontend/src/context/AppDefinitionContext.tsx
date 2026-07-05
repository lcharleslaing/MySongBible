import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { getSettings, type AppDefinitionRecord } from "../api/settings";

const defaultAppDefinition: AppDefinitionRecord = {
  package_name: "apptemplatebase",
  app_version: "0.1.0",
  app_display_name: "AppTemplateBase",
  sidebar_eyebrow: "AppTemplateBase",
  sidebar_title: "Desktop Starter",
  sidebar_description: "Local-first shell for voice-enabled desktop apps.",
  topbar_eyebrow: "Local-First Workspace",
  topbar_title: "Frontend Starter",
  home_eyebrow: "Overview",
  home_title: "Reusable local-first desktop starter",
  home_description: "This frontend is a clean launch surface for future desktop apps built on Electron, React, FastAPI, SQLite, and local voice tooling.",
};

type AppDefinitionContextValue = {
  appDefinition: AppDefinitionRecord;
  refreshAppDefinition: () => Promise<void>;
  setAppDefinition: (definition: AppDefinitionRecord) => void;
};

const AppDefinitionContext = createContext<AppDefinitionContextValue | null>(null);

export function AppDefinitionProvider({ children }: { children: ReactNode }) {
  const [appDefinition, setAppDefinition] = useState<AppDefinitionRecord>(defaultAppDefinition);

  const refreshAppDefinition = async () => {
    const settings = await getSettings();
    setAppDefinition(settings.app_definition);
  };

  useEffect(() => {
    refreshAppDefinition().catch(() => {
      setAppDefinition(defaultAppDefinition);
    });
  }, []);

  const value = useMemo(
    () => ({
      appDefinition,
      refreshAppDefinition,
      setAppDefinition,
    }),
    [appDefinition],
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
