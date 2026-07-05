import { useEffect, useState } from "react";

import { useAppDefinition } from "../../context/AppDefinitionContext";
import { ThemeSelector } from "../theme/ThemeSelector";

function formatClock(value: Date) {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(value);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(value);

  return `${date} @ ${time}`;
}

export function Topbar() {
  const { appDefinition } = useAppDefinition();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <header className="navbar border-b border-base-300 bg-base-100 px-4 sm:px-6">
      <div className="flex-1 gap-3">
        <label htmlFor="app-sidebar" className="btn btn-ghost btn-square lg:hidden" aria-label="Open sidebar">
          <span className="text-xl">☰</span>
        </label>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-base-content/50">
            {appDefinition.topbar_eyebrow}
          </p>
          <h2 className="text-lg font-semibold text-base-content">{appDefinition.topbar_title}</h2>
        </div>
      </div>
      <div className="flex flex-none items-center gap-3">
        <div className="hidden whitespace-nowrap text-sm font-medium text-base-content/70 md:block">
          {formatClock(now)}
        </div>
        <ThemeSelector />
      </div>
    </header>
  );
}
