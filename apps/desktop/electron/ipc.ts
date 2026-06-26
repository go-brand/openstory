import { ipcMain, BrowserWindow, dialog } from "electron";
import { randomUUID } from "node:crypto";
import { basename, relative, resolve, sep } from "node:path";
import { readFileSync, statSync } from "node:fs";
import { AppStore } from "./store";
import { ViteHost } from "./vite-host";
import type { AppState, Layout, ManifestComponent, ManifestDoc, PreviewSource } from "./types";
import { reconcileSelection } from "./selection";

// Hard cap so a stray huge file can't be slurped into the renderer's Code panel.
const MAX_SOURCE_BYTES = 256 * 1024;

// True when `target` resolves inside `root` (defends the fs read against a
// sourcePath that escapes the active project, e.g. via `..`).
function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel.length > 0 && !rel.startsWith("..") && !rel.startsWith(`..${sep}`);
}

type Deps = {
  store: AppStore;
  viteHost: ViteHost;
  getMain: () => BrowserWindow | null;
  getDetached: () => BrowserWindow | null;
  openDetached: () => void;
  closeDetached: () => void;
};

// Stable base harness URL — selection + overrides flow via postMessage, so the
// iframe is never re-navigated within a project (no flicker).
function buildHarnessUrl(port: number): string {
  return `http://127.0.0.1:${port}/__pl__/`;
}

function buildAppState(
  store: AppStore,
  viteHost: ViteHost,
  manifest: ManifestComponent[],
  docs: ManifestDoc[],
  detachedOpen: boolean,
): AppState {
  const s = store.state;
  const status = viteHost.status();
  const iframeUrl = status.status === "ready" && status.port ? buildHarnessUrl(status.port) : null;
  return {
    projects: s.projects,
    selection: s.selection,
    overlay: s.overlay,
    theme: s.theme,
    manifest,
    docs,
    iframeUrl,
    detachedOpen,
    vite: status,
  };
}

export function registerIpc(deps: Deps) {
  let manifest: ManifestComponent[] = [];
  let docs: ManifestDoc[] = [];

  function broadcastState() {
    const state = buildAppState(
      deps.store,
      deps.viteHost,
      manifest,
      docs,
      deps.getDetached() !== null,
    );
    deps.getMain()?.webContents.send("state:update", state);
    deps.getDetached()?.webContents.send("state:update", state);
  }

  async function fetchManifest(port: number) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/__pl__/manifest.json`);
      if (!res.ok) {
        manifest = [];
        docs = [];
        return;
      }
      const body = (await res.json()) as { components: ManifestComponent[]; docs?: ManifestDoc[] };
      manifest = body.components ?? [];
      docs = body.docs ?? [];

      // Reconcile the persisted selection against the new manifest: keep it if
      // still valid, reset to the first preview, or clear it entirely when the
      // manifest can't satisfy it (e.g. switching to a repo with no components) —
      // otherwise the harness would render the previous repo's stale preview.
      const patch = reconcileSelection(manifest, deps.store.state.selection);
      if (patch) deps.store.patchSelection(patch);
    } catch {
      manifest = [];
      docs = [];
    }
  }

  deps.viteHost.subscribe(async (status) => {
    if (status.status === "ready" && status.port) {
      await fetchManifest(status.port);
    }
    broadcastState();
  });

  ipcMain.handle("state:get", () =>
    buildAppState(deps.store, deps.viteHost, manifest, docs, deps.getDetached() !== null),
  );

  ipcMain.handle("project:pickFolder", async () => {
    const main = deps.getMain();
    const opts = { properties: ["openDirectory" as const] };
    const result = main
      ? await dialog.showOpenDialog(main, opts)
      : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle("project:add", async (_e, path: string) => {
    const record = deps.store.addProject({
      id: randomUUID(),
      name: basename(path),
      path,
      addedAt: new Date().toISOString(),
    });
    broadcastState();
    return record;
  });

  ipcMain.handle("project:remove", (_e, id: string) => {
    deps.store.removeProject(id);
    broadcastState();
  });

  ipcMain.handle("project:select", async (_e, id: string) => {
    const project = deps.store.state.projects.find((p) => p.id === id);
    if (!project) return;
    deps.store.patchSelection({ projectId: id });
    broadcastState();
    await deps.viteHost.start(project.path);
  });

  ipcMain.handle(
    "preview:set",
    (
      _e,
      input: {
        componentId: string;
        storyId: string;
        viewport: "desktop" | "mobile";
      },
    ) => {
      // Selecting a story is a clean start: clear overrides + layout override and
      // exit any docs or page view.
      deps.store.patchSelection({
        ...input,
        propOverrides: {},
        layout: null,
        docsComponentId: null,
        pageId: null,
      });
      broadcastState();
    },
  );

  ipcMain.handle("preview:setProps", (_e, overrides: Record<string, unknown>) => {
    deps.store.patchSelection({ propOverrides: overrides });
    broadcastState();
  });

  // Per-selection layout override; null reverts to the component's declared layout.
  ipcMain.handle("preview:setLayout", (_e, layout: Layout | null) => {
    deps.store.patchSelection({ layout });
    broadcastState();
  });

  ipcMain.handle("preview:setDocs", (_e, componentId: string | null) => {
    deps.store.patchSelection({ docsComponentId: componentId, pageId: null });
    broadcastState();
  });

  ipcMain.handle("preview:setPage", (_e, pageId: string | null) => {
    deps.store.patchSelection({
      pageId,
      componentId: null,
      storyId: null,
      docsComponentId: null,
      propOverrides: {},
      layout: null,
    });
    broadcastState();
  });

  // Read a preview's component source for the Code panel. Returns null (panel
  // falls back to a generated snippet) when the preview has no sourcePath, the
  // path escapes the active project root, the file is missing/oversized, or the
  // read fails. Path comes from the trusted manifest, but is re-checked against
  // the active project root before reading — defense in depth.
  // The harness re-posts pl:manifest when Vite HMR re-runs import.meta.glob (a
  // *.stories.tsx was added/removed). Re-fetch the manifest and broadcast so the
  // sidebar tree updates live without a relaunch. Mirrors the viteHost.subscribe
  // "ready → fetchManifest → broadcast" path above.
  ipcMain.handle("preview:refreshManifest", async () => {
    const status = deps.viteHost.status();
    if (status.status === "ready" && status.port) {
      await fetchManifest(status.port);
      broadcastState();
    }
  });

  ipcMain.handle("preview:getSource", (_e, componentId: string): PreviewSource | null => {
    const preview = manifest.find((p) => p.id === componentId);
    // Fall back to docs when no component matches or the component has no sourcePath.
    const sourcePath =
      preview?.sourcePath ?? docs.find((d) => d.id === componentId)?.sourcePath ?? null;
    if (!sourcePath) return null;

    const state = deps.store.state;
    const project = state.projects.find((p) => p.id === state.selection.projectId);
    if (!project) return null;

    const root = resolve(project.path);
    const path = resolve(sourcePath);
    if (!isInside(root, path)) return null;

    try {
      if (statSync(path).size > MAX_SOURCE_BYTES) return null;
      return { path, code: readFileSync(path, "utf8") };
    } catch {
      return null;
    }
  });

  ipcMain.handle("preview:popOut", () => {
    deps.openDetached();
  });

  ipcMain.handle("preview:popIn", () => {
    deps.closeDetached();
  });

  ipcMain.handle("overlay:setOpacity", (_e, value: number) => {
    deps.store.patchOverlay({ opacity: value });
    broadcastState();
  });

  ipcMain.handle("overlay:setClickThrough", (_e, enabled: boolean) => {
    deps.store.patchOverlay({ clickThrough: enabled });
    deps.getDetached()?.setIgnoreMouseEvents(enabled, { forward: true });
    broadcastState();
  });

  ipcMain.handle("overlay:setBlendMode", (_e, mode: "normal" | "difference") => {
    deps.store.patchOverlay({ blendMode: mode });
    broadcastState();
  });

  ipcMain.handle("overlay:setVisible", (_e, visible: boolean) => {
    deps.store.patchOverlay({ visible });
    broadcastState();
  });

  ipcMain.handle("window:setAlwaysOnTop", (_e, enabled: boolean) => {
    deps.store.patchOverlay({ alwaysOnTop: enabled });
    deps.getDetached()?.setAlwaysOnTop(enabled, "screen-saver");
    broadcastState();
  });

  ipcMain.handle("theme:set", (_e, theme: "light" | "dark") => {
    deps.store.setTheme(theme);
    broadcastState();
  });

  return { broadcastState };
}
