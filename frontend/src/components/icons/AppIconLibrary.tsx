import type { SVGProps } from "react";

export type AppIconName =
  | "activity"
  | "bot"
  | "briefcase"
  | "clone"
  | "home"
  | "menu"
  | "mic"
  | "settings"
  | "spark"
  | "waveform";

type IconDefinition = {
  name: AppIconName;
  label: string;
  paths: string[];
};

export const appIconLibrary: IconDefinition[] = [
  { name: "home", label: "Home", paths: ["M3 10.5 12 3l9 7.5", "M5 9.5V21h14V9.5", "M9 21v-7h6v7"] },
  { name: "menu", label: "Menu", paths: ["M4 7h16", "M4 12h16", "M4 17h16"] },
  { name: "mic", label: "Microphone", paths: ["M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z", "M5 11a7 7 0 0 0 14 0", "M12 18v3", "M8 21h8"] },
  { name: "settings", label: "Settings", paths: ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7.7 7.7 0 0 0-2-1.2L14.2 3h-4.4l-.3 2.6a7.7 7.7 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.5 2.4-1a7.7 7.7 0 0 0 2 1.2l.3 2.6h4.4l.3-2.6a7.7 7.7 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5c.1-.4.1-.8.1-1.2Z"] },
  { name: "activity", label: "Activity", paths: ["M3 12h4l2-7 6 14 2-7h4"] },
  { name: "clone", label: "Clone", paths: ["M8 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z", "M4 16H3a1 1 0 0 1-1-1V4a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v1"] },
  { name: "waveform", label: "Waveform", paths: ["M3 12h2", "M7 7v10", "M11 4v16", "M15 8v8", "M19 10v4", "M21 12h-2"] },
  { name: "bot", label: "Bot", paths: ["M12 8V4", "M8 4h8", "M6 8h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z", "M9 14h.01", "M15 14h.01", "M9 18h6"] },
  { name: "briefcase", label: "Briefcase", paths: ["M10 6V5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v1", "M4 7h16v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z", "M4 12h16", "M9 12v2h6v-2"] },
  { name: "spark", label: "Spark", paths: ["M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z", "M5 17l.8 2.2L8 20l-2.2.8L5 23l-.8-2.2L2 20l2.2-.8L5 17Z"] },
];

const iconMap = new Map(appIconLibrary.map((icon) => [icon.name, icon]));

export function normalizeAppIconName(value: string | null | undefined): AppIconName {
  return iconMap.has(value as AppIconName) ? (value as AppIconName) : "briefcase";
}

export function AppIcon({ name, title, ...props }: SVGProps<SVGSVGElement> & { name?: string | null; title?: string }) {
  const definition = iconMap.get(normalizeAppIconName(name));

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : "true"} role={title ? "img" : undefined} {...props}>
      {title ? <title>{title}</title> : null}
      {definition?.paths.map((path) => <path key={path} d={path} />)}
    </svg>
  );
}
