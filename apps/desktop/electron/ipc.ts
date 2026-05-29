import { ipcMain, BrowserWindow, dialog } from 'electron';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { AppStore } from './store';
import { ViteHost } from './vite-host';
import type { AppState, ManifestPreview } from './types';

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
  manifest: ManifestPreview[],
  detachedOpen: boolean
): AppState {
  const s = store.state;
  const status = viteHost.status();
  const iframeUrl =
    status.status === 'ready' && status.port
      ? buildHarnessUrl(status.port)
      : null;
  return {
    projects: s.projects,
    selection: s.selection,
    overlay: s.overlay,
    manifest,
    iframeUrl,
    detachedOpen,
    vite: status,
  };
}

export function registerIpc(deps: Deps) {
  let manifest: ManifestPreview[] = [];

  function broadcastState() {
    const state = buildAppState(
      deps.store,
      deps.viteHost,
      manifest,
      deps.getDetached() !== null
    );
    deps.getMain()?.webContents.send('state:update', state);
    deps.getDetached()?.webContents.send('state:update', state);
  }

  async function fetchManifest(port: number) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/__pl__/manifest.json`);
      if (!res.ok) {
        manifest = [];
        return;
      }
      const body = (await res.json()) as { previews: ManifestPreview[] };
      manifest = body.previews ?? [];

      // Reset to first preview + variant when the persisted selection is not
      // present in the current manifest (nothing selected yet, or stale ids
      // left over from a different project).
      const sel = deps.store.state.selection;
      const selectedPreview = manifest.find((p) => p.id === sel.previewId);
      const selectionValid =
        selectedPreview?.variants.some((v) => v.id === sel.variantId) ?? false;
      if (!selectionValid) {
        const first = manifest[0];
        if (first && first.variants[0]) {
          deps.store.patchSelection({
            previewId: first.id,
            variantId: first.variants[0].id,
            propOverrides: {},
          });
        }
      }
    } catch {
      manifest = [];
    }
  }

  deps.viteHost.subscribe(async (status) => {
    if (status.status === 'ready' && status.port) {
      await fetchManifest(status.port);
    }
    broadcastState();
  });

  ipcMain.handle('state:get', () =>
    buildAppState(
      deps.store,
      deps.viteHost,
      manifest,
      deps.getDetached() !== null
    )
  );

  ipcMain.handle('project:pickFolder', async () => {
    const main = deps.getMain();
    const opts = { properties: ['openDirectory' as const] };
    const result = main
      ? await dialog.showOpenDialog(main, opts)
      : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle('project:add', async (_e, path: string) => {
    const record = deps.store.addProject({
      id: randomUUID(),
      name: basename(path),
      path,
      addedAt: new Date().toISOString(),
    });
    broadcastState();
    return record;
  });

  ipcMain.handle('project:remove', (_e, id: string) => {
    deps.store.removeProject(id);
    broadcastState();
  });

  ipcMain.handle('project:select', async (_e, id: string) => {
    const project = deps.store.state.projects.find((p) => p.id === id);
    if (!project) return;
    deps.store.patchSelection({ projectId: id });
    broadcastState();
    await deps.viteHost.start(project.path);
  });

  ipcMain.handle(
    'preview:set',
    (
      _e,
      input: {
        previewId: string;
        variantId: string;
        viewport: 'desktop' | 'mobile';
      }
    ) => {
      // Selecting a preset/variant is a clean starting point — clear overrides.
      deps.store.patchSelection({ ...input, propOverrides: {} });
      broadcastState();
    }
  );

  ipcMain.handle(
    'preview:setProps',
    (_e, overrides: Record<string, unknown>) => {
      deps.store.patchSelection({ propOverrides: overrides });
      broadcastState();
    }
  );

  ipcMain.handle('preview:popOut', () => {
    deps.openDetached();
  });

  ipcMain.handle('preview:popIn', () => {
    deps.closeDetached();
  });

  ipcMain.handle('overlay:setOpacity', (_e, value: number) => {
    deps.store.patchOverlay({ opacity: value });
    broadcastState();
  });

  ipcMain.handle('overlay:setClickThrough', (_e, enabled: boolean) => {
    deps.store.patchOverlay({ clickThrough: enabled });
    deps.getDetached()?.setIgnoreMouseEvents(enabled, { forward: true });
    broadcastState();
  });

  ipcMain.handle(
    'overlay:setBlendMode',
    (_e, mode: 'normal' | 'difference') => {
      deps.store.patchOverlay({ blendMode: mode });
      broadcastState();
    }
  );

  ipcMain.handle('overlay:setVisible', (_e, visible: boolean) => {
    deps.store.patchOverlay({ visible });
    broadcastState();
  });

  ipcMain.handle('window:setAlwaysOnTop', (_e, enabled: boolean) => {
    deps.store.patchOverlay({ alwaysOnTop: enabled });
    deps.getDetached()?.setAlwaysOnTop(enabled, 'screen-saver');
    broadcastState();
  });

  return { broadcastState };
}
