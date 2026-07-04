import { ThemeSelector } from "../theme/ThemeSelector";

export function Topbar() {
  return (
    <header className="navbar border-b border-base-300 bg-base-100 px-4 sm:px-6">
      <div className="flex-1 gap-3">
        <label htmlFor="app-sidebar" className="btn btn-ghost btn-square lg:hidden" aria-label="Open sidebar">
          <span className="text-xl">☰</span>
        </label>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-base-content/50">
            Local-First Workspace
          </p>
          <h2 className="text-lg font-semibold text-base-content">Frontend Starter</h2>
        </div>
      </div>
      <div className="flex-none">
        <ThemeSelector />
      </div>
    </header>
  );
}
