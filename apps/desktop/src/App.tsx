import { useEffect, useState } from "react";
import type { AppState } from "../electron/types";
import { MainApp } from "./views/main-app";
import { DetachedPreview } from "./views/detached-preview";
import { ThemeProvider } from "./components/theme-provider";

const FALLBACK_STATE: AppState = {
  projects: [],
  selection: {
    projectId: null,
    previewId: null,
    variantId: null,
    docsComponentId: null,
    viewport: "desktop",
    propOverrides: {},
  },
  overlay: {
    opacity: 1,
    clickThrough: false,
    blendMode: "normal",
    visible: true,
    alwaysOnTop: false,
  },
  theme: "light",
  manifest: [],
  iframeUrl: null,
  detachedOpen: false,
  vite: { status: "idle", port: null, error: null },
};

function getApi() {
  return typeof window !== "undefined" ? window.openStory : undefined;
}

// Window is always present in the Electron renderer, so resolve the role once
// at module load rather than on every render.
const ROLE = new URLSearchParams(window.location.search).get("role") ?? "main";

export function App() {
  const api = getApi();
  const [state, setState] = useState<AppState>(FALLBACK_STATE);

  useEffect(() => {
    if (!api) return;
    let mounted = true;
    api
      .invoke("state:get")
      .then((next) => {
        if (mounted) setState(next);
      })
      .catch(() => {});
    const off = api.on("state:update", (next) => setState(next));
    return () => {
      mounted = false;
      off();
    };
  }, [api]);

  return (
    <ThemeProvider theme={state.theme} api={api}>
      {ROLE === "detached" ? (
        <DetachedPreview state={state} api={api} />
      ) : (
        <MainApp state={state} api={api} />
      )}
    </ThemeProvider>
  );
}
