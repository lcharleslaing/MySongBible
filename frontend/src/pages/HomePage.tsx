import { PageHeader } from "../components/ui/PageHeader";
import { Link } from "react-router-dom";
import { updateHomePage } from "../api/settings";
import { AppIcon } from "../components/icons/AppIconLibrary";
import { useAppDefinition } from "../context/AppDefinitionContext";

export function HomePage() {
  const { appDefinition, homePage, setHomePage } = useAppDefinition();

  const hideMarketing = () => {
    const next = { ...homePage, show_marketing_on_startup: false };
    setHomePage(next);
    updateHomePage(next).catch(() => setHomePage(homePage));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={appDefinition.home_show_eyebrow ? appDefinition.home_eyebrow : ""}
        title={appDefinition.home_show_title ? appDefinition.home_title : ""}
        description={appDefinition.home_show_description ? appDefinition.home_description : ""}
      />

      {homePage.show_marketing_on_startup ? (
        <section className="overflow-hidden rounded-box border border-primary/20 bg-primary text-primary-content shadow-sm">
          <div className="grid gap-6 p-7 lg:grid-cols-[1.4fr_auto] lg:items-center">
            <div><p className="text-xs font-semibold uppercase tracking-[0.25em] opacity-70">{homePage.marketing_eyebrow}</p><h2 className="mt-2 text-3xl font-bold">{homePage.marketing_title}</h2><p className="mt-3 max-w-2xl text-sm opacity-80">{homePage.marketing_description}</p></div>
            <div className="rounded-2xl bg-primary-content/10 px-6 py-5 text-center"><div className="text-4xl font-bold">{homePage.apps.length}</div><div className="text-xs uppercase tracking-wider opacity-70">apps ready</div></div>
          </div>
          <label className="flex cursor-pointer items-center gap-3 border-t border-primary-content/15 px-7 py-4 text-sm">
            <input type="checkbox" className="checkbox checkbox-sm border-primary-content" checked onChange={hideMarketing} />
            <span>Show this welcome area on startup</span>
          </label>
        </section>
      ) : null}

      <section>
        <div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">Dashboard</p><h2 className="mt-1 text-2xl font-semibold">Your apps</h2></div><span className="badge badge-ghost">{homePage.apps.length} available</span></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {homePage.apps.map((app) => <Link key={app.id} to={app.path} className="card border border-base-300 bg-base-100 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"><div className="card-body"><div className="flex items-center justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-box bg-primary/10 text-primary"><AppIcon name={app.icon} className="h-5 w-5" /></span><span className="badge badge-primary badge-outline">{app.badge}</span></div><h3 className="card-title mt-2">{app.label}</h3><p className="text-sm text-base-content/70">{app.description}</p></div></Link>)}
        </div>
      </section>
    </div>
  );
}
