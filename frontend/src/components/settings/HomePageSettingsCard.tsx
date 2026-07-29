import { useEffect, useState } from "react";

import { type HomeAppRecord, type HomePageSettingsRecord, updateHomePage } from "../../api/settings";
import { useAppDefinition } from "../../context/AppDefinitionContext";
import { AppIcon, appIconLibrary } from "../icons/AppIconLibrary";

type Step = 0 | 1 | 2;

const emptyApp: HomeAppRecord = { id: "", label: "", description: "", path: "", badge: "App", icon: "briefcase" };

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function appPath(value: string) {
  const slug = slugify(value);
  return slug ? `/${slug}` : "";
}

export function HomePageSettingsCard({ disabled = false }: { disabled?: boolean }) {
  const { homePage, setHomePage } = useAppDefinition();
  const [draft, setDraft] = useState<HomePageSettingsRecord>(homePage);
  const [appDraft, setAppDraft] = useState<HomeAppRecord>(emptyApp);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => setDraft(homePage), [homePage]);

  const openEditor = (app?: HomeAppRecord) => {
    setDraft(homePage);
    setAppDraft(app ? { ...app, icon: app.icon || "briefcase" } : emptyApp);
    setEditingId(app?.id || null);
    setStep(0);
    setError("");
    setIsOpen(true);
  };

  const nextStep = () => {
    if (step === 0 && (!draft.marketing_title.trim() || !draft.marketing_description.trim())) {
      setError("Add a marketing title and description before continuing.");
      return;
    }
    if (step === 1 && (!appDraft.label.trim() || !appDraft.description.trim() || !appDraft.path.startsWith("/"))) {
      setError("Add an app name, description, and a route beginning with /.");
      return;
    }
    setError("");
    setStep((step + 1) as Step);
  };

  const save = async () => {
    const normalized = { ...appDraft, id: appDraft.id || slugify(appDraft.label), label: appDraft.label.trim(), description: appDraft.description.trim(), badge: appDraft.badge.trim() || "App", icon: appDraft.icon || "briefcase" };
    if (!normalized.id || draft.apps.some((app) => app.id === normalized.id && app.id !== editingId)) {
      setError("That app name conflicts with an existing dashboard app.");
      return;
    }
    const apps = editingId ? draft.apps.map((app) => app.id === editingId ? normalized : app) : [...draft.apps, normalized];
    const next = { ...draft, apps };
    try {
      setIsSaving(true);
      const saved = await updateHomePage(next);
      setHomePage(saved.home_page);
      setIsOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the home page.");
    } finally {
      setIsSaving(false);
    }
  };

  const removeApp = async (app: HomeAppRecord) => {
    const next = { ...homePage, apps: homePage.apps.filter((item) => item.id !== app.id) };
    try {
      setIsSaving(true);
      const saved = await updateHomePage(next);
      setHomePage(saved.home_page);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not remove the app.");
    } finally {
      setIsSaving(false);
    }
  };

  return <>
    <div className="rounded-box border border-base-300 bg-base-200/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">Home Page</p><h2 className="mt-1 text-xl font-semibold">Marketing and app dashboard</h2><p className="mt-1 text-sm text-base-content/60">{homePage.show_marketing_on_startup ? "Welcome area shown" : "Dashboard only"} · {homePage.apps.length} dashboard apps</p></div><button type="button" className="btn btn-primary btn-sm" onClick={() => openEditor()} disabled={disabled || isSaving}>Add app</button></div>
      <div className="mt-4 divide-y divide-base-300 border-t border-base-300">
        {homePage.apps.map((app) => <div key={app.id} className="flex items-center gap-3 py-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-box bg-base-100 text-base-content/70"><AppIcon name={app.icon} className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="truncate font-medium">{app.label}</p><p className="truncate text-xs text-base-content/60">{app.path} · {app.description}</p></div><button className="btn btn-ghost btn-xs" type="button" onClick={() => openEditor(app)}>Edit</button><button className="btn btn-ghost btn-xs text-error" type="button" onClick={() => removeApp(app)} disabled={isSaving}>Remove</button></div>)}
      </div>
    </div>

    {isOpen ? <dialog className="modal modal-open" aria-labelledby="home-page-editor-title"><div className="modal-box max-w-3xl">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-base-content/60">Home Page</p><h2 id="home-page-editor-title" className="mt-1 text-2xl font-semibold">{editingId ? "Update dashboard app" : "Add dashboard app"}</h2><p className="mt-1 text-sm text-base-content/60">Configure the welcome area, app data, then review and save.</p></div><button className="btn btn-circle btn-ghost btn-sm" onClick={() => setIsOpen(false)} disabled={isSaving}>✕</button></div>
      <ul className="steps steps-horizontal my-6 w-full text-xs">{["Marketing", "App data", "Review"].map((label, index) => <li key={label} className={`step ${index <= step ? "step-primary" : ""}`}>{label}</li>)}</ul>
      {error ? <div className="alert alert-error mb-4 py-3 text-sm">{error}</div> : null}
      {step === 0 ? <div className="grid gap-4 md:grid-cols-2"><label className="form-control gap-2"><span className="label-text font-medium">Marketing eyebrow</span><input className="input input-bordered" value={draft.marketing_eyebrow} onChange={(event) => setDraft({ ...draft, marketing_eyebrow: event.target.value })} /></label><label className="form-control gap-2"><span className="label-text font-medium">Marketing title</span><input className="input input-bordered" value={draft.marketing_title} onChange={(event) => setDraft({ ...draft, marketing_title: event.target.value })} /></label><label className="form-control gap-2 md:col-span-2"><span className="label-text font-medium">Marketing description</span><textarea className="textarea textarea-bordered min-h-24" value={draft.marketing_description} onChange={(event) => setDraft({ ...draft, marketing_description: event.target.value })} /></label><label className="label cursor-pointer justify-start gap-3 md:col-span-2"><input type="checkbox" className="checkbox checkbox-primary" checked={draft.show_marketing_on_startup} onChange={(event) => setDraft({ ...draft, show_marketing_on_startup: event.target.checked })} /><span className="label-text">Show the marketing area on startup</span></label></div> : null}
      {step === 1 ? <div className="grid gap-4 md:grid-cols-2"><label className="form-control gap-2"><span className="label-text font-medium">App name</span><input autoFocus className="input input-bordered" value={appDraft.label} onChange={(event) => { const label = event.target.value; setAppDraft({ ...appDraft, label, id: editingId ? appDraft.id : slugify(label), path: editingId ? appDraft.path : appPath(label) }); }} /></label><label className="form-control gap-2"><span className="label-text font-medium">Badge</span><input className="input input-bordered" value={appDraft.badge} onChange={(event) => setAppDraft({ ...appDraft, badge: event.target.value })} /></label><label className="form-control gap-2"><span className="label-text font-medium">Menu icon</span><select className="select select-bordered" value={appDraft.icon} onChange={(event) => setAppDraft({ ...appDraft, icon: event.target.value })}>{appIconLibrary.map((icon) => <option key={icon.name} value={icon.name}>{icon.label}</option>)}</select></label><label className="form-control gap-2"><span className="label-text font-medium">Auto-detected route</span><input className="input input-bordered bg-base-200" value={appDraft.path} readOnly placeholder="Generated from the app name" /><span className="label-text-alt">Generated automatically from the app name.</span></label><label className="form-control gap-2"><span className="label-text font-medium">App ID</span><input className="input input-bordered" value={appDraft.id} onChange={(event) => setAppDraft({ ...appDraft, id: slugify(event.target.value) })} /></label><label className="form-control gap-2 md:col-span-2"><span className="label-text font-medium">Description</span><textarea className="textarea textarea-bordered min-h-24" value={appDraft.description} onChange={(event) => setAppDraft({ ...appDraft, description: event.target.value })} /></label></div> : null}
      {step === 2 ? <div className="space-y-4"><div className="card border border-base-300 bg-base-200/50"><div className="card-body"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-box bg-primary/10 text-primary"><AppIcon name={appDraft.icon} className="h-5 w-5" /></span><span className="badge badge-primary badge-outline w-fit">{appDraft.badge || "App"}</span></div><h3 className="card-title">{appDraft.label}</h3><p className="text-sm text-base-content/70">{appDraft.description}</p><p className="text-xs text-base-content/50">Dashboard and left menu route: {appDraft.path}</p></div></div><p className="text-sm text-base-content/60">Saving updates both the home dashboard and the left navigation menu.</p></div> : null}
      <div className="modal-action justify-between"><button className="btn btn-ghost" onClick={() => setStep((step - 1) as Step)} disabled={step === 0 || isSaving}>Back</button>{step < 2 ? <button className="btn btn-primary" onClick={nextStep}>Continue</button> : <button className="btn btn-primary" onClick={save} disabled={isSaving}>{isSaving ? "Saving…" : editingId ? "Update app" : "Save app"}</button>}</div>
    </div><button className="modal-backdrop" onClick={() => setIsOpen(false)}>close</button></dialog> : null}
  </>;
}
