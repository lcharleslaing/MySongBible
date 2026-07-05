import { PageHeader } from "../components/ui/PageHeader";
import { DesktopInfoCard } from "../components/desktop/DesktopInfoCard";
import { useAppDefinition } from "../context/AppDefinitionContext";

const quickStartItems = [
  "Electron, React, and FastAPI are already wired into a single local desktop workflow.",
  "DaisyUI provides the base component system for navigation, forms, and status surfaces.",
  "Local speech modules stay centralized in the backend so future apps can extend them cleanly.",
];

export function HomePage() {
  const { appDefinition } = useAppDefinition();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={appDefinition.home_eyebrow}
        title={appDefinition.home_title}
        description={appDefinition.home_description}
      />

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="card border border-base-300 bg-base-100 shadow-sm">
          <div className="card-body gap-4">
            <h2 className="card-title text-xl">What this starter already establishes</h2>
            <ul className="space-y-3">
              {quickStartItems.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-base-content/80">
                  <span className="badge badge-primary badge-sm mt-0.5">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="card border border-primary/20 bg-primary text-primary-content shadow-sm">
          <div className="card-body">
            <span className="badge badge-outline">Template Intent</span>
            <h2 className="card-title text-2xl">Build once, reuse often.</h2>
            <p className="text-sm text-primary-content/80">
              Keep the shell generic, keep speech local, and keep future project-specific logic layered on top.
            </p>
          </div>
        </section>
      </div>

      <DesktopInfoCard />
    </div>
  );
}
