import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "system" | "light" | "dark";
const KEY = "cadence-theme";

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(t: ThemeChoice) {
  const root = document.documentElement;
  if (t === "system") delete root.dataset.theme;
  else root.dataset.theme = t;
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeChoice>(read);
  useEffect(() => applyTheme(theme), [theme]);
  const setTheme = useCallback((t: ThemeChoice) => {
    setThemeState(t);
    try {
      if (t === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, t);
    } catch {
      /* storage blocked: the choice lasts for this visit */
    }
  }, []);
  return { theme, setTheme };
}
