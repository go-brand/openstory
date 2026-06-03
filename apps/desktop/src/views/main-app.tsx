import { useEffect, useRef, useState } from "react";
import type { AppState } from "../../electron/types";
import type { Api } from "../lib/api";
import { useHarnessBridge } from "../lib/use-harness-bridge";
import { HugeiconsIcon, PackageIcon, Loading03Icon, Alert02Icon } from "../lib/icons";
import { Titlebar } from "../components/titlebar";
import { Sidebar } from "../components/sidebar";
import { Toolbar, type PanelMode } from "../components/toolbar";
import { RightPanel } from "../components/right-panel";
import { CommandPalette } from "../components/command-palette";
import { DocsStub } from "../components/docs-stub";

export function MainApp({ state, api }: { state: AppState; api: Api }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  useHarnessBridge(iframeRef, state.selection);

  const [panelMode, setPanelMode] = useState<PanelMode>("inspect");
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ⌘K / Ctrl+K toggles the command palette from anywhere in the window.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const component =
    state.manifest.find((p) => p.id === state.selection.componentId) ?? state.manifest[0];
  const story =
    component?.stories.find((v) => v.id === state.selection.storyId) ?? component?.stories[0];
  const docsComponent = state.selection.docsComponentId
    ? state.manifest.find((p) => p.id === state.selection.docsComponentId)
    : undefined;

  function selectStory(componentId: string, storyId: string) {
    api?.invoke("preview:set", {
      componentId,
      storyId,
      viewport: state.selection.viewport,
    });
  }

  function setControl(name: string, value: unknown) {
    api?.invoke("preview:setProps", {
      ...state.selection.propOverrides,
      [name]: value,
    });
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <Titlebar onOpenPalette={() => setPaletteOpen(true)} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar state={state} api={api} onSelectStory={selectStory} />

        {/* Canvas. Plain neutral bg by design — the preset-color tint is
            detached-only (it backs difference-blend pixel comparison there). */}
        <main className="relative flex flex-1 flex-col overflow-hidden bg-background">
          <Toolbar
            state={state}
            api={api}
            component={component}
            story={story}
            panelMode={panelMode}
            setPanelMode={setPanelMode}
          />
          <div className="relative flex flex-1 items-center justify-center overflow-auto p-6">
            {state.iframeUrl ? (
              <div className="h-full w-full overflow-hidden rounded-xl border border-input bg-muted shadow-2xl shadow-black/50">
                <iframe
                  ref={iframeRef}
                  src={state.iframeUrl}
                  className="h-full w-full border-0 bg-transparent"
                />
              </div>
            ) : (
              <CanvasEmpty vite={state.vite} />
            )}
            {docsComponent && <DocsStub componentName={docsComponent.id} />}
            {state.iframeUrl && !component && !docsComponent && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background p-6">
                <CanvasEmpty vite={state.vite} emptyRepo />
              </div>
            )}
          </div>
        </main>

        {component && panelMode && (
          <RightPanel
            mode={panelMode}
            state={state}
            api={api}
            component={component}
            story={story}
            onSetControl={setControl}
          />
        )}
      </div>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        state={state}
        api={api}
      />
    </div>
  );
}

function CanvasEmpty({ vite, emptyRepo = false }: { vite: AppState["vite"]; emptyRepo?: boolean }) {
  const [icon, title, subtitle] =
    vite.status === "error"
      ? ([Alert02Icon, "Vite failed to start", vite.error ?? "Unknown error"] as const)
      : vite.status === "starting"
        ? ([Loading03Icon, "Starting Vite…", "Spinning up the dev server"] as const)
        : emptyRepo
          ? ([
              PackageIcon,
              "No stories in this repository",
              "Add OpenStory stories to openstory.config.ts",
            ] as const)
          : ([PackageIcon, "No preview loaded", "Pick a repository to load stories"] as const);
  const spin = vite.status === "starting";
  return (
    <div className="flex max-w-xs flex-col items-center gap-3 text-center">
      <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground">
        <HugeiconsIcon icon={icon} className={`size-5 ${spin ? "animate-spin" : ""}`} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-medium text-foreground">{title}</p>
        <p className="text-[12px] leading-relaxed text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
