import { useEffect, useRef, useState } from "react";
import type { AppState } from "../../electron/types";
import type { Api } from "../lib/api";
import { useHarnessBridge } from "../lib/use-harness-bridge";
import { HugeiconsIcon, PackageIcon, Loading03Icon, Alert02Icon } from "../lib/icons";
import { Titlebar } from "../components/titlebar";
import { Sidebar } from "../components/sidebar";
import { Toolbar } from "../components/toolbar";
import { RightPanel, type PanelTab } from "../components/right-panel";
import {
  NO_ADDONS,
  clampZoom,
  zoomStep,
  type AddonName,
  type AddonState,
} from "../lib/preview-view";
import { CommandPalette } from "../components/command-palette";

export function MainApp({ state, api }: { state: AppState; api: Api }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [addons, setAddons] = useState<AddonState>(NO_ADDONS);
  const [panelTab, setPanelTab] = useState<PanelTab>("controls");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { reload } = useHarnessBridge(iframeRef, state.selection, api, addons);

  function toggleAddon(addon: AddonName) {
    setAddons((a) => ({ ...a, [addon]: !a[addon] }));
  }

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
  // Docs mode renders inside the iframe (the host stacks every story under a
  // title). The manager just suppresses the per-story controls panel.
  const docsActive = state.selection.docsComponentId !== null;
  const docsComponent = docsActive
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
      <Titlebar
        onOpenPalette={() => setPaletteOpen(true)}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
      />

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
            zoom={zoom}
            onZoomIn={() => setZoom((z) => zoomStep(z, 1))}
            onZoomOut={() => setZoom((z) => zoomStep(z, -1))}
            onZoomReset={() => setZoom(1)}
            addons={addons}
            onToggleAddon={toggleAddon}
            onReload={reload}
          />
          <div className="relative flex-1 overflow-auto bg-canvas">
            {state.iframeUrl ? (
              <div
                className="h-full w-full origin-top-left"
                style={{
                  transform: `scale(${clampZoom(zoom)})`,
                  width: `${100 / clampZoom(zoom)}%`,
                  height: `${100 / clampZoom(zoom)}%`,
                }}
              >
                <iframe
                  ref={iframeRef}
                  src={state.iframeUrl}
                  className="h-full w-full border-0 bg-transparent"
                />
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <CanvasEmpty vite={state.vite} />
              </div>
            )}
            {state.iframeUrl && !component && !docsComponent && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-canvas p-6">
                <CanvasEmpty vite={state.vite} emptyRepo />
              </div>
            )}
          </div>
        </main>

        {/* Keep the panel MOUNTED across docs↔story so it collapses via its own
            width animation instead of snapping the canvas on mount/unmount. In
            docs we drive it closed (controls don't apply to the stacked view). */}
        {component && (
          <RightPanel
            isOpen={sidebarOpen && !docsActive}
            tab={panelTab}
            onTabChange={setPanelTab}
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
