import * as React from "react";
import type { Theme } from "../../electron/types";
import type { Api } from "../lib/api";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) return { theme: "light", setTheme: () => {} };
  return ctx;
}

// The store is the single source of truth for the theme. `theme` arrives as a
// prop from App.tsx (fed by AppState over IPC); setTheme writes through the
// `theme:set` IPC and the new value round-trips back via `state:update`, which
// keeps the main and detached windows in sync without local state.
export function ThemeProvider({
  theme,
  api,
  children,
}: {
  theme: Theme;
  api: Api;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const setTheme = React.useCallback(
    (next: Theme) => {
      api?.invoke("theme:set", next).catch(() => {});
    },
    [api],
  );

  const value = React.useMemo<ThemeContextValue>(() => ({ theme, setTheme }), [theme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
