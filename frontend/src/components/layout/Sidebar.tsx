import type { PointerEvent as ReactPointerEvent } from "react";
import { NavLink } from "react-router-dom";
import { useAppDefinition } from "../../context/AppDefinitionContext";
import { AppIcon } from "../icons/AppIconLibrary";
import appIconUrl from "../../../../electron/assets/icons/icon.png";

type SidebarProps = {
  isCollapsed: boolean;
  setIsCollapsed: (value: boolean) => void;
  width: number;
  setWidth: (value: number) => void;
};

export function Sidebar({ isCollapsed, setIsCollapsed, width, setWidth }: SidebarProps) {
  const { appDefinition, homePage } = useAppDefinition();
  const navItems = [{ to: "/", label: "Home", icon: "home" }, ...homePage.apps.map((app) => ({ to: app.path, label: app.label, icon: app.icon }))];
  const showIdentityText = !isCollapsed && (appDefinition.sidebar_show_eyebrow || appDefinition.sidebar_show_title);
  const showIdentityBlock = appDefinition.sidebar_show_icon || showIdentityText || (!isCollapsed && appDefinition.sidebar_show_description);

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (isCollapsed) {
      return;
    }

    const startX = event.clientX;
    const startWidth = width;
    event.currentTarget.setPointerCapture(event.pointerId);

    const resize = (moveEvent: globalThis.PointerEvent) => {
      setWidth(Math.min(Math.max(startWidth + moveEvent.clientX - startX, 220), 560));
    };
    const stopResize = () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", stopResize);
    };

    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", stopResize);
  };

  return (
    <div className="drawer-side z-[200] !overflow-visible">
      <label htmlFor="app-sidebar" aria-label="close sidebar" className="drawer-overlay" />
      <aside
        className={`relative z-[200] flex min-h-full flex-col !overflow-visible border-r border-base-300 bg-base-100 transition-[width] duration-150 ${isCollapsed ? "items-center" : ""}`}
        style={{ width: isCollapsed ? 72 : width }}
      >
        <button
          type="button"
          className={`btn btn-ghost btn-square btn-sm absolute top-3 z-10 ${isCollapsed ? "left-1/2 -translate-x-1/2" : "right-3"}`}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <span className="text-lg">{isCollapsed ? "›" : "‹"}</span>
        </button>

        {showIdentityBlock ? (
          <div className={`w-full border-b border-base-300 ${isCollapsed ? "px-2 pb-4 pt-14" : "p-5 pr-12"}`}>
            <div className={`flex items-center ${isCollapsed ? "justify-center" : "gap-3"}`}>
              {appDefinition.sidebar_show_icon ? (
                <img
                  src={appIconUrl}
                  alt=""
                  aria-hidden="true"
                  className={`${isCollapsed ? "h-11 w-11 rounded-xl" : "h-14 w-14 rounded-2xl"} shrink-0 object-cover shadow-sm`}
                />
              ) : null}
              {showIdentityText ? (
                <div className="min-w-0">
                  {appDefinition.sidebar_show_eyebrow ? (
                    <p className="whitespace-nowrap text-xs font-semibold uppercase tracking-[0.3em] text-base-content/60">
                      {appDefinition.sidebar_eyebrow}
                    </p>
                  ) : null}
                  {appDefinition.sidebar_show_title ? (
                    <h1 className="mt-1 whitespace-nowrap text-2xl font-bold leading-tight text-base-content">{appDefinition.sidebar_title}</h1>
                  ) : null}
                </div>
              ) : null}
            </div>
            {!isCollapsed && appDefinition.sidebar_show_description ? (
              <p className="mt-2 text-sm text-base-content/70">
                {appDefinition.sidebar_description}
              </p>
            ) : null}
          </div>
        ) : null}

        <ul className={`menu w-full gap-2 !overflow-visible ${isCollapsed ? "items-center px-2 py-4" : "p-4"}`}>
          {navItems.map((item) => (
            <li key={item.to} className={isCollapsed ? "group relative z-[300] flex w-full items-center justify-center !overflow-visible" : undefined}>
              <NavLink
                to={item.to}
                end={item.to === "/"}
                title={isCollapsed ? item.label : undefined}
                aria-label={isCollapsed ? item.label : undefined}
                className={({ isActive }) => isCollapsed
                  ? `!flex !h-11 !min-h-11 !w-11 !items-center !justify-center !overflow-visible !rounded-box !p-0 ${isActive ? "active" : ""}`
                  : isActive ? "active" : ""}
              >
                <AppIcon name={item.icon} className="h-5 w-5 shrink-0" />
                {isCollapsed ? <span className="sr-only">{item.label}</span> : <span className="whitespace-nowrap">{item.label}</span>}
              </NavLink>
              {isCollapsed ? (
                <span className="pointer-events-none absolute left-[calc(100%+0.5rem)] top-1/2 z-[9999] -translate-y-1/2 whitespace-nowrap rounded bg-neutral px-2 py-1 text-sm font-medium text-neutral-content opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                  {item.label}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {!isCollapsed ? (
          <button
            type="button"
            className="absolute inset-y-0 right-[-4px] hidden w-2 cursor-col-resize touch-none bg-transparent after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-base-300 hover:after:bg-primary lg:block"
            aria-label="Resize sidebar"
            onPointerDown={startResize}
          />
        ) : null}
      </aside>
    </div>
  );
}
