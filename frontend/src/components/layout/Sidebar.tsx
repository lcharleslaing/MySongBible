import { NavLink } from "react-router-dom";
import { useAppDefinition } from "../../context/AppDefinitionContext";

const navItems = [
  { to: "/", label: "Home" },
  { to: "/voice-lab", label: "Voice Lab" },
  { to: "/local-ai-setup", label: "Local AI Setup" },
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
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-base-content/60">
            {appDefinition.sidebar_eyebrow}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-base-content">{appDefinition.sidebar_title}</h1>
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
