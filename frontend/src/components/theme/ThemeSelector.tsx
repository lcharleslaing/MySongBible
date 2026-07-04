import { useEffect, useState } from "react";

const themes = ["corporate", "light", "cupcake", "emerald", "night"] as const;
const storageKey = "apptemplatebase-theme";

export function ThemeSelector() {
  const [theme, setTheme] = useState<string>("corporate");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem(storageKey);
    const nextTheme = savedTheme && themes.includes(savedTheme as (typeof themes)[number]) ? savedTheme : "corporate";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
  }, []);

  const onThemeChange = (nextTheme: string) => {
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    window.localStorage.setItem(storageKey, nextTheme);
  };

  return (
    <label className="form-control w-40">
      <div className="label py-0">
        <span className="label-text text-xs uppercase tracking-[0.2em] text-base-content/60">Theme</span>
      </div>
      <select
        className="select select-bordered select-sm"
        value={theme}
        onChange={(event) => onThemeChange(event.target.value)}
      >
        {themes.map((themeOption) => (
          <option key={themeOption} value={themeOption}>
            {themeOption}
          </option>
        ))}
      </select>
    </label>
  );
}
