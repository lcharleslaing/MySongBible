import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Outlet } from "react-router-dom";
import { useAppDefinition } from "../../context/AppDefinitionContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const sidebarWidthKey = "app-template-sidebar-width";
const sidebarCollapsedKey = "app-template-sidebar-collapsed";
const previousStaticSidebarWidth = 288;
const collapsedSidebarWidth = 72;
const minExpandedSidebarWidth = 180;
const maxExpandedSidebarWidth = 420;

function estimateTextWidth(value: string, averageCharacterWidth: number, letterSpacing = 0) {
  const text = value.trim();
  if (!text) {
    return 0;
  }
  return text.length * averageCharacterWidth + Math.max(text.length - 1, 0) * letterSpacing;
}

export function AppLayout() {
  const { appDefinition, homePage } = useAppDefinition();
  const navLabels = useMemo(() => ["Home", ...homePage.apps.map((app) => app.label)], [homePage.apps]);
  const automaticSidebarWidth = useMemo(() => {
    const navTextWidth = Math.max(...navLabels.map((label) => estimateTextWidth(label, 8.5)), 0);
    const identityTextWidths = [
      appDefinition.sidebar_show_eyebrow ? estimateTextWidth(appDefinition.sidebar_eyebrow, 7.2, 3.6) : 0,
      appDefinition.sidebar_show_title ? estimateTextWidth(appDefinition.sidebar_title, 13) : 0,
      appDefinition.sidebar_show_description ? estimateTextWidth(appDefinition.sidebar_description, 7.2) : 0,
    ];
    const navWidth = navTextWidth + 92;
    const identityWidth = Math.max(...identityTextWidths, 0) + (appDefinition.sidebar_show_icon ? 136 : 80);
    const rawWidth = Math.ceil(Math.max(navWidth, identityWidth));
    return Math.min(Math.max(rawWidth, minExpandedSidebarWidth), maxExpandedSidebarWidth);
  }, [appDefinition, navLabels]);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem(sidebarWidthKey));
    return Number.isFinite(saved) && saved !== previousStaticSidebarWidth
      ? Math.min(Math.max(saved, minExpandedSidebarWidth), maxExpandedSidebarWidth)
      : null;
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => window.localStorage.getItem(sidebarCollapsedKey) === "true");
  const expandedSidebarWidth = sidebarWidth ?? automaticSidebarWidth;
  const layoutWidth = isSidebarCollapsed ? collapsedSidebarWidth : expandedSidebarWidth;

  useEffect(() => {
    if (sidebarWidth !== null) {
      window.localStorage.setItem(sidebarWidthKey, String(sidebarWidth));
    }
  }, [sidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem(sidebarCollapsedKey, String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  return (
    <div
      className="drawer bg-base-200 lg:drawer-open lg:[grid-template-columns:var(--app-sidebar-width)_1fr]"
      style={{ "--app-sidebar-width": `${layoutWidth}px` } as CSSProperties}
    >
      <input id="app-sidebar" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content min-h-screen">
        <Topbar />
        <main className="px-4 pb-24 pt-4 sm:px-6 sm:pb-28 sm:pt-6 lg:px-8 lg:pb-32 lg:pt-8">
          <Outlet />
        </main>
      </div>
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        width={expandedSidebarWidth}
        setWidth={setSidebarWidth}
      />
    </div>
  );
}
