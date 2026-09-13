import * as React from "react";

type ThemeMode = "light" | "dark" | "auto";
type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "empat_theme";

const ThemeContext = React.createContext<{
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (t: ThemeMode) => void;
}>({ theme: "light", resolvedTheme: "light", setTheme: () => {} });

function getStoredTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "auto" ? stored : "light";
}

function resolve(mode: ThemeMode): ResolvedTheme {
  if (mode !== "auto") return mode;
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<ThemeMode>(() => getStoredTheme());
  const [resolvedTheme, setResolvedTheme] = React.useState<ResolvedTheme>(() => resolve(getStoredTheme()));

  React.useLayoutEffect(() => {
    const updateResolvedTheme = () => {
      const next = resolve(theme);
      setResolvedTheme(next);
      applyTheme(next);
    };

    updateResolvedTheme();

    if (theme !== "auto") return;

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", updateResolvedTheme);
    return () => media.removeEventListener("change", updateResolvedTheme);
  }, [theme]);

  const setTheme = React.useCallback((nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);

    const nextResolved = resolve(nextTheme);
    setResolvedTheme(nextResolved);
    applyTheme(nextResolved);
  }, []);

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return React.useContext(ThemeContext);
}
