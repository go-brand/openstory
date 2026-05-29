import { ipcMain, BrowserWindow, dialog } from 'electron';
import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { AppStore } from './store';
import { ViteHost } from './vite-host';
import type { AppState, ManifestPreview } from './types';

type Deps = {
  store: AppStore;
  viteHost: ViteHost;
  getHud: () => BrowserWindow | null;
};

function buildPreviewUrl(
  port: number,
  sel: {
    previewId: string | null;
    variantId: string | null;
    viewport: 'desktop' | 'mobile';
  }
): string | null {
  if (!sel.previewId || !sel.variantId) return null;
  const params = new URLSearchParams();
  params.set('preview', sel.previewId);
  params.set('variant', sel.variantId);
  params.set('viewport', sel.viewport);
  return `http://127.0.0.1:${port}/__pl__/?${params}`;
}

function buildAppState(
  store: AppStore,
  viteHost: ViteHost,
  manifest: ManifestPreview[]
): AppState {
  const s = store.state;
  const status = viteHost.status();
  const iframeUrl =
    status.status === 'ready' && status.port
      ? buildPreviewUrl(status.port, s.selection)
      : null;
  return {
    projects: s.projects,
    selection: s.selection,
    overlay: s.overlay,
    manifest,
    iframeUrl,
    vite: status,
  };
}

export function registerIpc(deps: Deps) {
  let manifest: ManifestPreview[] = [];

  function broadcastState() {
    const state = buildAppState(deps.store, deps.viteHost, manifest);
    deps.getHud()?.webContents.send('state:update', state);
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
    buildAppState(deps.store, deps.viteHost, manifest)
  );

  ipcMain.handle('project:pickFolder', async () => {
    const hud = deps.getHud();
    const opts = { properties: ['openDirectory' as const] };
    const result = hud
      ? await dialog.showOpenDialog(hud, opts)
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
      deps.store.patchSelection(input);
      broadcastState();
    }
  );

  ipcMain.handle('overlay:setOpacity', (_e, value: number) => {
    deps.store.patchOverlay({ opacity: value });
    broadcastState();
  });

  ipcMain.handle('overlay:setClickThrough', (_e, enabled: boolean) => {
    deps.store.patchOverlay({ clickThrough: enabled });
    deps.getHud()?.setIgnoreMouseEvents(enabled, { forward: true });
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
    const w = deps.getHud();
    if (w) w.setAlwaysOnTop(enabled, 'screen-saver');
    broadcastState();
  });

  return { broadcastState };
}
