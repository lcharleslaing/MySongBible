import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Outlet } from "react-router-dom";
import { useAppDefinition } from "../../context/AppDefinitionContext";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const sidebarWidthKey = "app-template-sidebar-width";
const sidebarCollapsedKey = "app-template-sidebar-collapsed";
const collapsedSidebarWidth = 72;
const minExpandedSidebarWidth = 220;
const maxExpandedSidebarWidth = 560;

function measureTextWidth(value: string, font: string, letterSpacing = 0) {
  const text = value.trim();
  if (!text) {
    return 0;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return text.length * 10 + Math.max(text.length - 1, 0) * letterSpacing;
  }

  context.font = font;
  return context.measureText(text).width + Math.max(text.length - 1, 0) * letterSpacing;
}

export function AppLayout() {
  const { appDefinition, homePage } = useAppDefinition();
  const navLabels = useMemo(() => ["Home", ...homePage.apps.map((app) => app.label)], [homePage.apps]);
  const automaticSidebarWidth = useMemo(() => {
    const navTextWidth = Math.max(...navLabels.map((label) => measureTextWidth(label, "14px sans-serif")), 0);
    const identityTextWidths = [
      appDefinition.sidebar_show_eyebrow ? measureTextWidth(appDefinition.sidebar_eyebrow.toUpperCase(), "600 12px sans-serif", 3.6) : 0,
      appDefinition.sidebar_show_title ? measureTextWidth(appDefinition.sidebar_title, "700 24px sans-serif") : 0,
      appDefinition.sidebar_show_description ? measureTextWidth(appDefinition.sidebar_description, "14px sans-serif") : 0,
    ];
    const navWidth = navTextWidth + 88;
    const identityWidth = Math.max(...identityTextWidths, 0) + (appDefinition.sidebar_show_icon ? 128 : 96);
    const rawWidth = Math.ceil(Math.max(navWidth, identityWidth));
    return Math.min(Math.max(rawWidth, minExpandedSidebarWidth), maxExpandedSidebarWidth);
  }, [appDefinition, navLabels]);
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(null);
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
        setIsCollapsed={(value) => {
          if (isSidebarCollapsed && !value) {
            setSidebarWidth(null);
          }
          setIsSidebarCollapsed(value);
        }}
        width={expandedSidebarWidth}
        setWidth={(value) => {
          setSidebarWidth(value);
        }}
      />
    </div>
  );
}
