import { NavLink } from "react-router-dom";
import { useAppDefinition } from "../../context/AppDefinitionContext";
import appIconUrl from "../../../../electron/assets/icons/icon.png";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/audio-journal", label: "Audio Journal" },
  { to: "/settings", label: "Settings" },
  { to: "/system-health", label: "System Health" },
];

export function Sidebar() {
  const { appDefinition } = useAppDefinition();

  return (
    <div className="drawer-side z-40">
      <label htmlFor="app-sidebar" aria-label="close sidebar" className="drawer-overlay" />
      <aside className="min-h-full w-72 bg-base-100 border-r border-base-300">
        <div className="border-b border-base-300 p-5">
          <div className="flex items-center gap-3">
            <img
              src={appIconUrl}
              alt=""
              aria-hidden="true"
              className="h-14 w-14 shrink-0 rounded-2xl object-cover shadow-sm"
            />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-[0.3em] text-base-content/60">
                {appDefinition.sidebar_eyebrow}
              </p>
              <h1 className="mt-1 text-2xl font-bold leading-tight text-base-content">{appDefinition.sidebar_title}</h1>
            </div>
          </div>
          <p className="mt-2 text-sm text-base-content/70">
            {appDefinition.sidebar_description}
          </p>
        </div>
        <ul className="menu gap-2 p-4">
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => (isActive ? "active" : "")}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
