import { useEffect, useState, type CSSProperties } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const sidebarWidthKey = "app-template-sidebar-width";
const sidebarCollapsedKey = "app-template-sidebar-collapsed";
const defaultSidebarWidth = 288;
const collapsedSidebarWidth = 72;

export function AppLayout() {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem(sidebarWidthKey));
    return Number.isFinite(saved) ? Math.min(Math.max(saved, 220), 520) : defaultSidebarWidth;
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => window.localStorage.getItem(sidebarCollapsedKey) === "true");
  const layoutWidth = isSidebarCollapsed ? collapsedSidebarWidth : sidebarWidth;

  useEffect(() => {
    window.localStorage.setItem(sidebarWidthKey, String(sidebarWidth));
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
        width={sidebarWidth}
        setWidth={setSidebarWidth}
      />
    </div>
  );
}
