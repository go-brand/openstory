import { useEffect, useRef, useState } from "react";
import type { AppState } from "../../electron/types";
import type { Api } from "../lib/api";
import { useHarnessBridge, type ContentSize } from "../lib/use-harness-bridge";
import { HugeiconsIcon, PackageIcon, Loading03Icon, Alert02Icon } from "../lib/icons";
import { LEFT_SIDEBAR_TOGGLE_ID, Titlebar } from "../components/titlebar";
import { SIDEBAR_SHELL_ID, SidebarShell } from "../components/sidebar";
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
import { markPreviewRequest } from "../lib/performance";

export function previewFrameVisibility(contentSize: ContentSize): "hidden" | "visible" {
  return contentSize === undefined ? "hidden" : "visible";
}

export function mainAppShellSnapshot({
  hasComponent,
  docsActive,
  leftSidebarOpen,
  inspectorOpen,
}: {
  hasComponent: boolean;
  docsActive: boolean;
  leftSidebarOpen: boolean;
  inspectorOpen: boolean;
}): { leftSidebarOpen: boolean; rightPanelOpen: boolean } {
  return {
    leftSidebarOpen,
    rightPanelOpen: hasComponent && inspectorOpen && !docsActive,
  };
}

export function MainApp({ state, api }: { state: AppState; api: Api }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [addons, setAddons] = useState<AddonState>(NO_ADDONS);
  const [panelTab, setPanelTab] = useState<PanelTab>("controls");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { reload, contentSize } = useHarnessBridge(
    iframeRef,
    state.selection,
    api,
    addons,
    state.docs,
    state.theme,
  );

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

  // Canvas mode. Docs/auto-docs always fill the canvas. A single component story
  // is sized to the box the harness reports (pl:size): `sized` once it arrives,
  // hidden while we wait (so stale content from the previous selection cannot
  // flash), `"fill"` for docs/pages.
  const isDocMode = docsActive || state.selection.pageId !== null;
  const sized = !isDocMode && contentSize && contentSize !== "fill" ? contentSize : null;
  const frameVisibility = previewFrameVisibility(contentSize);
  // The canvas toolbar (zoom/addons/viewport) only makes sense when an
  // actual component story is being previewed. Hide it for docs/pages and for
  // the empty state — note `component` has a `?? manifest[0]` display fallback,
  // so gate on the real selection (`componentId`), not the fallback.
  const isStoryPreview = !isDocMode && state.selection.componentId !== null;
  const shell = mainAppShellSnapshot({
    hasComponent: Boolean(component),
    docsActive,
    leftSidebarOpen,
    inspectorOpen,
  });

  function toggleLeftSidebar() {
    if (leftSidebarOpen) {
      const sidebar = document.getElementById(SIDEBAR_SHELL_ID);
      if (sidebar?.contains(document.activeElement)) {
        document.getElementById(LEFT_SIDEBAR_TOGGLE_ID)?.focus();
      }
    }
    setLeftSidebarOpen((isOpen) => !isOpen);
  }

  function selectStory(componentId: string, storyId: string) {
    markPreviewRequest("story");
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
        state={state}
        api={api}
        onOpenPalette={() => setPaletteOpen(true)}
        leftSidebarOpen={leftSidebarOpen}
        onToggleLeftSidebar={toggleLeftSidebar}
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen((isOpen) => !isOpen)}
      />

      <div className="flex flex-1 overflow-hidden">
        <SidebarShell
          isOpen={shell.leftSidebarOpen}
          state={state}
          api={api}
          onSelectStory={selectStory}
        />

        {/* Canvas. Plain neutral bg by design — the preset-color tint is
            detached-only (it backs difference-blend pixel comparison there). */}
        <main className="relative flex flex-1 flex-col overflow-hidden bg-background px-2">
          {/* Toolbar only for an actual component story. Docs/pages are
              markdown and the empty state has nothing to control — both hide it
              and let the canvas reclaim the height. */}
          {isStoryPreview && (
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
          )}
          <div className="relative flex-1 overflow-auto bg-canvas">
            {state.iframeUrl ? (
              // One stable iframe element across all modes (a separate element
              // per branch would remount and reload the harness on every resize).
              // `sized` → component story: size the iframe to the reported box and
              // pin it to the TOP of the themed canvas (bg-canvas — OpenStory's
              // own background — shows AROUND the component; not centered, so it
              // never drifts as the size resolves). Otherwise fill the canvas
              // (docs/pages). While the selected render is still loading,
              // the iframe is rendered but hidden so stale content never flashes.
              <div
                className={
                  sized
                    ? "flex min-h-full w-full items-start justify-center p-8"
                    : "h-full w-full origin-top-left"
                }
                style={
                  sized
                    ? undefined
                    : {
                        transform: `scale(${clampZoom(zoom)})`,
                        width: `${100 / clampZoom(zoom)}%`,
                        height: `${100 / clampZoom(zoom)}%`,
                      }
                }
              >
                <iframe
                  ref={iframeRef}
                  src={state.iframeUrl}
                  className="border-0 bg-transparent"
                  style={
                    sized
                      ? {
                          width: sized.width,
                          height: sized.height,
                          flex: "0 0 auto",
                          transform: `scale(${clampZoom(zoom)})`,
                          transformOrigin: "top center",
                        }
                      : {
                          width: "100%",
                          height: "100%",
                          visibility: frameVisibility,
                        }
                  }
                />
              </div>
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <CanvasEmpty previewServer={state.previewServer} />
              </div>
            )}
            {state.iframeUrl && !component && !docsComponent && state.selection.pageId === null && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-canvas p-6">
                <CanvasEmpty previewServer={state.previewServer} emptyRepo />
              </div>
            )}
          </div>
        </main>

        {/* Keep the panel MOUNTED across docs↔story so it collapses via its own
            width animation instead of snapping the canvas on mount/unmount. In
            docs we drive it closed (controls don't apply to the stacked view). */}
        {component && (
          <RightPanel
            isOpen={shell.rightPanelOpen}
            closeMode={docsActive ? "instant" : "animated"}
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

function CanvasEmpty({
  previewServer,
  emptyRepo = false,
}: {
  previewServer: AppState["previewServer"];
  emptyRepo?: boolean;
}) {
  const adapterName = previewServer.adapter === "next" ? "Next" : "Vite";
  const [icon, title, subtitle] =
    previewServer.status === "error"
      ? ([
          Alert02Icon,
          `${previewServer.adapter ? adapterName : "Preview"} failed to start`,
          previewServer.error,
        ] as const)
      : previewServer.status === "starting"
        ? ([Loading03Icon, `Starting ${adapterName}…`, "Spinning up the preview server"] as const)
        : emptyRepo
          ? ([
              PackageIcon,
              "No stories in this repository",
              "Add OpenStory stories to openstory.config.ts",
            ] as const)
          : ([PackageIcon, "No preview loaded", "Pick a repository to load stories"] as const);
  const spin = previewServer.status === "starting";
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
