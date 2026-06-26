# OpenStory Main App + Detached Preview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split OpenStory's single overlay into an opaque Storybook-style main window (component tree + canvas + preset/live-control props panel) plus a frameless, transparent, always-on-top detached preview window for pixel-compare, live-linked over the existing postMessage bridge.

**Architecture:** `defineStories` data already carries fixture props; expose it (plus inferred control descriptors) through the manifest. The runtime merges live `fixtureOverrides` over preset props. The Electron main process keeps `AppStore` as the single source of truth and broadcasts to two windows that load the same renderer, distinguished by a `?role=main|detached` query param. Selection + prop overrides reach each window's harness iframe via `postMessage(pl:render)` — no reload.

**Tech Stack:** TypeScript, React 19, Electron + electron-vite, Vite 7, Vitest (config/runtime/vite-plugin), Playwright (desktop e2e), pnpm workspaces + Turborepo.

**Spec:** `docs/superpowers/specs/2026-05-29-main-app-detached-preview-design.md`

---

## File Structure

**Modify:**
- `packages/config/src/define.ts` — add `ManifestControl` type + `deriveControls(fixtures)` helper; export both.
- `packages/config/src/index.ts` — export `ManifestControl`, `deriveControls`.
- `packages/runtime/src/preview-host.tsx` — thread `fixtureOverrides` from `pl:render` into the rendered props.
- `packages/vite-plugin/src/plugin.ts` — manifest route emits `variants[].props` + `controls[]`.
- `apps/desktop/electron/types.ts` — `ActiveSelection.propOverrides`; `ManifestPreview` gains `variants[].props` + `controls`; new IPC channels.
- `apps/desktop/electron/store.ts` — `propOverrides` in defaults.
- `apps/desktop/electron/ipc.ts` — `preview:setProps`/`popOut`/`popIn`; stable harness URL; broadcast both windows; window-level overlay ops target the detached window.
- `apps/desktop/electron/main.ts` — own both windows; pass role; detached lifecycle.
- `apps/desktop/src/App.tsx` — role router.

**Create:**
- `apps/desktop/electron/windows/main-window.ts` — opaque main window factory (replaces `hud.ts`).
- `apps/desktop/electron/windows/detached-window.ts` — transparent/frameless/always-on-top factory.
- `apps/desktop/src/views/main-app.tsx` — tree + canvas + presets + controls.
- `apps/desktop/src/views/detached-preview.tsx` — transparent canvas + overlay controls.
- `apps/desktop/src/lib/use-harness-bridge.ts` — shared hook: postMessage `pl:render` to the iframe on selection/override change.

**Delete:**
- `apps/desktop/electron/windows/hud.ts` (renamed to `main-window.ts`).

---

## Phase 1 — config: inferred controls

### Task 1: `deriveControls`

**Files:**
- Modify: `packages/config/src/define.ts`
- Modify: `packages/config/src/index.ts`
- Test: `packages/config/src/define.test.ts`

- [ ] **Step 1: Write the failing test** (append to `define.test.ts`)

```ts
import { deriveControls } from './define';

describe('deriveControls', () => {
  const fixtures = [
    { id: 'a', label: 'A', props: { text: 'hi', count: 2, dark: true, author: { name: 'x' } } },
    { id: 'b', label: 'B', props: { text: 'yo', extra: 'z' } },
  ];

  it('infers primitive control kinds and unions keys across fixtures', () => {
    const controls = deriveControls(fixtures);
    expect(controls).toEqual([
      { name: 'text', kind: 'text' },
      { name: 'count', kind: 'number' },
      { name: 'dark', kind: 'boolean' },
      { name: 'extra', kind: 'text' },
    ]);
  });

  it('skips non-primitive props (objects/arrays/functions)', () => {
    const controls = deriveControls([{ id: 'a', label: 'A', props: { author: { name: 'x' }, tags: [1], fn: () => {} } }]);
    expect(controls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-config exec vitest run src/define.test.ts`
Expected: FAIL — `deriveControls is not a function`.

- [ ] **Step 3: Write minimal implementation** (add to `packages/config/src/define.ts`, after the `Fixture` type)

```ts
export type ManifestControl = {
  name: string;
  kind: 'text' | 'boolean' | 'number';
};

function controlKind(value: unknown): ManifestControl['kind'] | 'skip' | null {
  if (value === null || value === undefined) return null; // no kind yet, keep looking
  if (typeof value === 'string') return 'text';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  return 'skip'; // object / array / function / ReactNode — not inline-editable
}

/**
 * Infer an editable control per prop from the fixtures' values. Keys are unioned
 * across all fixtures in first-seen order; a prop that is ever non-primitive is
 * dropped; a prop that is only ever null/undefined is dropped.
 */
export function deriveControls(fixtures: Fixture[]): ManifestControl[] {
  const order: string[] = [];
  const kinds = new Map<string, ManifestControl['kind'] | 'skip' | null>();

  for (const fixture of fixtures) {
    const props = (fixture.props ?? {}) as Record<string, unknown>;
    for (const [name, value] of Object.entries(props)) {
      if (!kinds.has(name)) {
        order.push(name);
        kinds.set(name, null);
      }
      const current = kinds.get(name);
      if (current === 'skip') continue;
      const k = controlKind(value);
      if (k === 'skip') kinds.set(name, 'skip');
      else if (k && current == null) kinds.set(name, k);
    }
  }

  return order
    .map((name) => ({ name, kind: kinds.get(name) }))
    .filter(
      (c): c is ManifestControl =>
        c.kind === 'text' || c.kind === 'boolean' || c.kind === 'number'
    );
}
```

Then export from `packages/config/src/index.ts` — add to the existing export block:

```ts
export {
  defineOpenStoryConfig,
  defineStories,
  deriveControls,
  type Fixture,
  type ManifestControl,
  type Platform,
  type PreviewDef,
  type OpenStoryConfig,
  type RegisteredPreview,
  type StoriesDef,
  type Story,
  type Viewport,
} from './define.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-config exec vitest run src/define.test.ts`
Expected: PASS.

- [ ] **Step 5: Build the package** (downstream packages import the built dist)

Run: `pnpm --filter @gobrand/openstory-config run build`
Expected: EXIT 0.

- [ ] **Step 6: Commit**

```bash
git add packages/config/src/define.ts packages/config/src/index.ts packages/config/src/define.test.ts
git commit -m "feat(config): deriveControls — infer editable controls from fixture props"
```

---

## Phase 2 — runtime: live prop overrides

### Task 2: merge `fixtureOverrides` in `PreviewStage`

**Files:**
- Modify: `packages/runtime/src/preview-host.tsx`
- Test: `packages/runtime/src/preview-host.test.tsx` (create)

The runtime's `RenderMessage` already declares `fixtureOverrides`; `PreviewStage` ignores it. Thread it through.

- [ ] **Step 1: Write the failing test** (create `packages/runtime/src/preview-host.test.tsx`)

```tsx
import { describe, expect, it } from 'vitest';
import { mergeProps } from './preview-host';

describe('mergeProps', () => {
  it('overrides preset props with fixture overrides', () => {
    expect(mergeProps({ text: 'preset', author: 'a' }, { text: 'edited' })).toEqual({
      text: 'edited',
      author: 'a',
    });
  });
  it('returns preset props unchanged when no overrides', () => {
    expect(mergeProps({ text: 'preset' }, undefined)).toEqual({ text: 'preset' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-runtime exec vitest run src/preview-host.test.tsx`
Expected: FAIL — `mergeProps` not exported.

- [ ] **Step 3: Write minimal implementation** (edit `packages/runtime/src/preview-host.tsx`)

Add an exported helper near the top (after imports):

```ts
export function mergeProps(
  presetProps: Record<string, unknown>,
  overrides: Record<string, unknown> | undefined
): Record<string, unknown> {
  return overrides ? { ...presetProps, ...overrides } : presetProps;
}
```

Extend `ActiveSelection` to carry overrides:

```ts
type ActiveSelection = {
  previewId: string;
  variantId: string;
  viewport: 'desktop' | 'mobile';
  fixtureOverrides?: Record<string, unknown>;
};
```

In `PreviewStage`, replace the `const props = ...` line with:

```ts
const props = mergeProps(
  (fixture.props ?? {}) as Record<string, unknown>,
  selection.fixtureOverrides
);
```

In `readSelectionFromUrl`, return `fixtureOverrides: undefined` is fine (omit). In the `App` `handleMessage` `pl:render` branch, include overrides:

```ts
setSelection({
  previewId: next.previewId,
  variantId: next.variantId,
  viewport: next.viewport,
  fixtureOverrides: next.fixtureOverrides,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-runtime exec vitest run src/preview-host.test.tsx`
Expected: PASS.

- [ ] **Step 5: Build**

Run: `pnpm --filter @gobrand/openstory-runtime run build`
Expected: EXIT 0.

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/preview-host.tsx packages/runtime/src/preview-host.test.tsx
git commit -m "feat(runtime): merge live fixtureOverrides over preset props"
```

---

## Phase 3 — vite-plugin: manifest carries props + controls

### Task 3: extend the `/__pl__/manifest.json` route

**Files:**
- Modify: `packages/vite-plugin/src/plugin.ts`
- Test: `packages/vite-plugin/src/plugin.test.ts`

- [ ] **Step 1: Write the failing test** (append to `plugin.test.ts`)

```ts
import { buildManifest } from './plugin';
import { deriveControls } from '@gobrand/openstory-config';

describe('buildManifest', () => {
  it('emits variants with props and inferred controls', () => {
    const config = {
      previews: [
        {
          id: 'linkedin',
          platform: 'linkedin',
          component: () => null,
          fixtures: [
            { id: 'a', label: 'A', props: { text: 'hi', dark: true } },
            { id: 'b', label: 'B', props: { text: 'yo' } },
          ],
        },
      ],
    };
    const manifest = buildManifest(config);
    expect(manifest.previews[0]).toEqual({
      id: 'linkedin',
      platform: 'linkedin',
      variants: [
        { id: 'a', label: 'A', props: { text: 'hi', dark: true } },
        { id: 'b', label: 'B', props: { text: 'yo' } },
      ],
      controls: deriveControls(config.previews[0].fixtures),
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-vite exec vitest run src/plugin.test.ts`
Expected: FAIL — `buildManifest` not exported.

- [ ] **Step 3: Write minimal implementation** (edit `packages/vite-plugin/src/plugin.ts`)

Add the import at the top:

```ts
import { deriveControls } from '@gobrand/openstory-config';
import type { OpenStoryConfig } from '@gobrand/openstory-config';
```

Add an exported pure builder (above `openStory`):

```ts
export function buildManifest(config: OpenStoryConfig) {
  return {
    previews: config.previews.map((p) => ({
      id: p.id,
      platform: p.platform,
      variants: p.fixtures.map((f) => ({
        id: f.id,
        label: f.label,
        props: f.props,
      })),
      controls: deriveControls(p.fixtures),
    })),
  };
}
```

In `configureServer`, replace the inline `manifest` construction (the `const manifest = { previews: config.previews.map(...) }` block) with:

```ts
const mod = await server.ssrLoadModule(resolvedConfigPath);
const config = (mod.default ?? mod) as OpenStoryConfig;
const manifest = buildManifest(config);
res.setHeader('content-type', 'application/json');
res.end(JSON.stringify(manifest));
return;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-vite exec vitest run src/plugin.test.ts`
Expected: PASS.

- [ ] **Step 5: Build**

Run: `pnpm --filter @gobrand/openstory-vite run build`
Expected: EXIT 0.

- [ ] **Step 6: Commit**

```bash
git add packages/vite-plugin/src/plugin.ts packages/vite-plugin/src/plugin.test.ts
git commit -m "feat(vite): manifest carries fixture props + inferred controls"
```

---

## Phase 4 — desktop: state shape

### Task 4: types + store defaults

**Files:**
- Modify: `apps/desktop/electron/types.ts`
- Modify: `apps/desktop/electron/store.ts`

- [ ] **Step 1: Update `types.ts`**

In `ActiveSelection` add `propOverrides`:

```ts
export type ActiveSelection = {
  projectId: string | null;
  previewId: string | null;
  variantId: string | null;
  viewport: 'desktop' | 'mobile';
  propOverrides: Record<string, unknown>;
};
```

Replace `ManifestPreview` with:

```ts
export type ManifestControl = { name: string; kind: 'text' | 'boolean' | 'number' };

export type ManifestPreview = {
  id: string;
  platform: string;
  variants: Array<{ id: string; label: string; props: Record<string, unknown> }>;
  controls: ManifestControl[];
};
```

In `IpcInvoke` add three channels (alongside `preview:set`):

```ts
  'preview:setProps': (overrides: Record<string, unknown>) => void;
  'preview:popOut': () => void;
  'preview:popIn': () => void;
```

- [ ] **Step 2: Update `store.ts` defaults**

In `defaults.selection`, add `propOverrides: {}`:

```ts
  selection: {
    projectId: null,
    previewId: null,
    variantId: null,
    viewport: 'desktop',
    propOverrides: {},
  },
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter openstory-desktop run typecheck`
Expected: FAIL — `App.tsx`/`ipc.ts` reference the old shapes (fixed in later tasks). Note the errors; they must all be resolved by Task 9. Do not commit yet.

> This task intentionally leaves the desktop app non-compiling; Tasks 5–9 restore it. Commit at the end of Task 6 once the main process compiles, and after Task 9 for the renderer.

---

## Phase 5 — desktop: two windows

### Task 5: main + detached window factories

**Files:**
- Create: `apps/desktop/electron/windows/main-window.ts`
- Create: `apps/desktop/electron/windows/detached-window.ts`
- Delete: `apps/desktop/electron/windows/hud.ts`

- [ ] **Step 1: Create `main-window.ts`** (opaque; based on the old `hud.ts` but solid background, not always-on-top, role=main)

```ts
import { BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type CreateMainOptions = {
  bounds?: { x?: number; y?: number; width?: number; height?: number };
};

async function loadRenderer(win: BrowserWindow, role: string) {
  if (process.env.ELECTRON_RENDERER_URL) {
    const base = process.env.ELECTRON_RENDERER_URL;
    const url = `${base}?role=${role}`;
    for (let i = 0; i < 10; i++) {
      try {
        await win.loadURL(url);
        return;
      } catch (err) {
        if (i === 9) throw err;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'), {
      query: { role },
    });
  }
}

export async function createMainWindow(
  opts: CreateMainOptions = {}
): Promise<BrowserWindow> {
  const bounds = opts.bounds ?? {};
  const win = new BrowserWindow({
    width: bounds.width ?? 1100,
    height: bounds.height ?? 760,
    x: bounds.x,
    y: bounds.y,
    title: 'OpenStory',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 16 },
    backgroundColor: '#0f0f10',
    minWidth: 720,
    minHeight: 520,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  await loadRenderer(win, 'main');
  return win;
}

export { loadRenderer };
```

- [ ] **Step 2: Create `detached-window.ts`** (transparent/frameless/always-on-top; role=detached)

```ts
import { BrowserWindow } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRenderer } from './main-window';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type CreateDetachedOptions = {
  bounds?: { x?: number; y?: number; width?: number; height?: number };
};

export async function createDetachedWindow(
  opts: CreateDetachedOptions = {}
): Promise<BrowserWindow> {
  const bounds = opts.bounds ?? {};
  const win = new BrowserWindow({
    width: bounds.width ?? 600,
    height: bounds.height ?? 700,
    x: bounds.x,
    y: bounds.y,
    title: 'OpenStory Preview',
    frame: false,
    transparent: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    resizable: true,
    minWidth: 280,
    minHeight: 320,
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.setVisibleOnAllWorkspaces(true);
  await loadRenderer(win, 'detached');
  return win;
}
```

- [ ] **Step 3: Delete the old window file**

```bash
git rm apps/desktop/electron/windows/hud.ts
```

- [ ] **Step 4: Verify (compile happens in Task 6)** — no standalone run; `main.ts` still imports `hud.ts` until Task 6. Proceed.

---

## Phase 6 — desktop: main process wiring

### Task 6: main.ts + ipc.ts for two windows, props, lifecycle

**Files:**
- Modify: `apps/desktop/electron/main.ts`
- Modify: `apps/desktop/electron/ipc.ts`

- [ ] **Step 1: Rewrite `ipc.ts`** — stable harness URL, prop overrides, both-window broadcast, detached lifecycle, window-level overlay ops target the detached window.

Replace the file with:

```ts
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
  manifest: ManifestPreview[]
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
    vite: status,
  };
}

export function registerIpc(deps: Deps) {
  let manifest: ManifestPreview[] = [];

  function broadcastState() {
    const state = buildAppState(deps.store, deps.viteHost, manifest);
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
    buildAppState(deps.store, deps.viteHost, manifest)
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
```

- [ ] **Step 2: Rewrite the window-management part of `main.ts`** — own both windows; wire `openDetached`/`closeDetached`.

Replace the imports of `createHudWindow` and the `hudWindow`/`createHud` section. Specifically:

Change the import line:

```ts
import { createMainWindow } from './windows/main-window';
import { createDetachedWindow } from './windows/detached-window';
```

Replace the `let hudWindow` declaration and `createHud` function with:

```ts
let mainWindow: BrowserWindow | null = null;
let detachedWindow: BrowserWindow | null = null;
let isQuitting = false;

function attachBoundsPersistence(win: BrowserWindow) {
  let timer: NodeJS.Timeout | null = null;
  const save = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => store.set('hudBounds', win.getBounds()), 250);
  };
  win.on('moved', save);
  win.on('resized', save);
}

async function createMain() {
  const bounds = store.state.hudBounds ?? undefined;
  mainWindow = await createMainWindow(bounds ? { bounds } : {});
  attachBoundsPersistence(mainWindow);
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.focus();
  return mainWindow;
}

async function openDetached() {
  if (detachedWindow) {
    detachedWindow.focus();
    return;
  }
  detachedWindow = await createDetachedWindow({});
  if (store.state.overlay.alwaysOnTop) {
    detachedWindow.setAlwaysOnTop(true, 'screen-saver');
  }
  detachedWindow.on('closed', () => {
    detachedWindow = null;
  });
}

function closeDetached() {
  detachedWindow?.close();
  detachedWindow = null;
}
```

In `bootstrap`, replace `await createHud();` with `await createMain();`, and update `registerIpc`:

```ts
  const { broadcastState } = registerIpc({
    store,
    viteHost,
    getMain: () => mainWindow,
    getDetached: () => detachedWindow,
    openDetached: () => {
      void openDetached();
    },
    closeDetached,
  });
  registerShortcuts({ store, getHud: () => detachedWindow, broadcastState });
```

In `app.on('activate', ...)` replace `createHud()` with `createMain()`.

> `registerShortcuts` keeps its signature (`getHud`); it now receives the detached window (the overlay shortcuts target the transparent window). No change to `shortcuts.ts`.

- [ ] **Step 3: Typecheck the main process**

Run: `pnpm --filter openstory-desktop exec tsc -p tsconfig.node.json --noEmit`
Expected: EXIT 0 (renderer `tsconfig.json` still fails until Task 9).

- [ ] **Step 4: Commit** (main process compiles)

```bash
git add apps/desktop/electron
git commit -m "feat(desktop): two-window main process — props, detached lifecycle, both-window broadcast"
```

---

## Phase 7 — desktop: renderer

### Task 7: shared harness bridge hook + role router

**Files:**
- Create: `apps/desktop/src/lib/use-harness-bridge.ts`
- Modify: `apps/desktop/src/App.tsx`

- [ ] **Step 1: Create `use-harness-bridge.ts`** — posts `pl:render` to the iframe whenever selection/overrides change, and on the iframe's `pl:ready`.

```ts
import { useEffect, useRef } from 'react';
import type { AppState } from '../../electron/types';

export function useHarnessBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  selection: AppState['selection']
) {
  const latest = useRef(selection);
  latest.current = selection;

  function post() {
    const win = iframeRef.current?.contentWindow;
    const s = latest.current;
    if (!win || !s.previewId || !s.variantId) return;
    win.postMessage(
      {
        type: 'pl:render',
        previewId: s.previewId,
        variantId: s.variantId,
        viewport: s.viewport,
        fixtureOverrides: s.propOverrides,
      },
      '*'
    );
  }

  // Re-post on any selection/override change.
  useEffect(() => {
    post();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selection.previewId,
    selection.variantId,
    selection.viewport,
    selection.propOverrides,
  ]);

  // Re-post when the harness (re)loads and announces readiness.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if ((e.data as { type?: string })?.type === 'pl:ready') post();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
```

- [ ] **Step 2: Rewrite `App.tsx`** as a role router + shared state subscription.

```tsx
import { useEffect, useState } from 'react';
import type { AppState } from '../electron/types';
import { MainApp } from './views/main-app';
import { DetachedPreview } from './views/detached-preview';

const FALLBACK_STATE: AppState = {
  projects: [],
  selection: {
    projectId: null,
    previewId: null,
    variantId: null,
    viewport: 'desktop',
    propOverrides: {},
  },
  overlay: {
    opacity: 1,
    clickThrough: false,
    blendMode: 'normal',
    visible: true,
    alwaysOnTop: false,
  },
  manifest: [],
  iframeUrl: null,
  vite: { status: 'idle', port: null, error: null },
};

function getApi() {
  return typeof window !== 'undefined' ? window.openStory : undefined;
}

export function App() {
  const api = getApi();
  const [state, setState] = useState<AppState>(FALLBACK_STATE);
  const role =
    new URLSearchParams(window.location.search).get('role') ?? 'main';

  useEffect(() => {
    if (!api) return;
    let mounted = true;
    api.invoke('state:get').then((next) => {
      if (mounted) setState(next);
    }).catch(() => {});
    const off = api.on('state:update', (next) => setState(next));
    return () => {
      mounted = false;
      off();
    };
  }, [api]);

  if (role === 'detached') return <DetachedPreview state={state} api={api} />;
  return <MainApp state={state} api={api} />;
}
```

> Both views receive `state` + `api` as props (no duplicate subscription). `api` may be `undefined` (preload missing) — views guard with `api?.invoke(...)`.

- [ ] **Step 3: Verify (compiles after Task 8 + 9)** — `views/*` don't exist yet. Proceed; full typecheck in Task 9.

### Task 8: `main-app.tsx` view

**Files:**
- Create: `apps/desktop/src/views/main-app.tsx`

- [ ] **Step 1: Create the view** — tree (grouped by platform) + canvas + Pop out + presets + controls. Reuses `components/ui/*`.

```tsx
import { useRef } from 'react';
import {
  Folder, FolderPlus, Layers, Maximize2, Smartphone, ExternalLink,
} from 'lucide-react';
import type { AppState } from '../../electron/types';
import { useHarnessBridge } from '../lib/use-harness-bridge';
import { Button } from '../components/ui/button';
import { Separator } from '../components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../components/ui/select';

type Api = AppState extends never ? never : Window['openStory'] | undefined;

export function MainApp({ state, api }: { state: AppState; api: Api }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  useHarnessBridge(iframeRef, state.selection);

  const preview =
    state.manifest.find((p) => p.id === state.selection.previewId) ??
    state.manifest[0];
  const variant =
    preview?.variants.find((v) => v.id === state.selection.variantId) ??
    preview?.variants[0];

  async function onPickFolder() {
    if (!api) return;
    const path = await api.invoke('project:pickFolder');
    if (path) {
      const record = await api.invoke('project:add', path);
      await api.invoke('project:select', record.id);
    }
  }

  function selectPreview(previewId: string, variantId: string) {
    api?.invoke('preview:set', {
      previewId,
      variantId,
      viewport: state.selection.viewport,
    });
  }

  function setControl(name: string, value: unknown) {
    api?.invoke('preview:setProps', {
      ...state.selection.propOverrides,
      [name]: value,
    });
  }

  const groups = groupByPlatform(state.manifest);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-200">
      {/* Sidebar: project + component tree */}
      <aside className="flex w-64 flex-col border-r border-neutral-800 bg-neutral-900">
        <header className="drag flex h-11 items-center pr-3 pl-[78px] text-[11px] font-semibold tracking-[0.16em] text-neutral-300 uppercase">
          OpenStory
        </header>
        <div className="no-drag flex flex-1 flex-col gap-3 overflow-y-auto p-3">
          {state.projects.length === 0 ? (
            <Button variant="primary" size="lg" onClick={onPickFolder} disabled={!api}>
              <FolderPlus /> Open a project…
            </Button>
          ) : (
            <Select
              value={state.selection.projectId ?? ''}
              onValueChange={(v) => api?.invoke('project:select', v)}
            >
              <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
              <SelectContent>
                {state.projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {state.manifest.length === 0 ? (
            <p className="px-1 text-[11px] text-neutral-500">
              No previews found in <code>openstory.config.ts</code>.
            </p>
          ) : (
            groups.map(([platform, previews]) => (
              <div key={platform}>
                <div className="mb-1 text-[10px] tracking-wider text-neutral-500 uppercase">
                  {platform}
                </div>
                {previews.map((p) => (
                  <Button
                    key={p.id}
                    variant={p.id === preview?.id ? 'active' : 'ghost'}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => selectPreview(p.id, p.variants[0]?.id ?? '')}
                  >
                    {p.id}
                  </Button>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Canvas */}
      <main className="relative flex flex-1 flex-col bg-neutral-100">
        <div className="no-drag flex h-11 items-center justify-between border-b border-neutral-800 bg-neutral-900 px-3">
          <div className="flex gap-1.5">
            {(['desktop', 'mobile'] as const).map((v) => (
              <Button
                key={v}
                variant={state.selection.viewport === v ? 'active' : 'secondary'}
                size="sm"
                onClick={() =>
                  preview && variant &&
                  api?.invoke('preview:set', {
                    previewId: preview.id,
                    variantId: variant.id,
                    viewport: v,
                  })
                }
              >
                {v === 'desktop' ? <Maximize2 /> : <Smartphone />}
                {v === 'desktop' ? 'Desktop' : 'Mobile'}
              </Button>
            ))}
          </div>
          <Button size="sm" variant="secondary" onClick={() => api?.invoke('preview:popOut')}>
            <ExternalLink /> Pop out
          </Button>
        </div>
        <div className="flex flex-1 items-center justify-center overflow-auto">
          {state.iframeUrl ? (
            <iframe ref={iframeRef} src={state.iframeUrl} className="h-full w-full border-0 bg-transparent" />
          ) : (
            <div className="text-[13px] text-neutral-500">
              {state.vite.status === 'error'
                ? `Vite error: ${state.vite.error ?? 'unknown'}`
                : state.vite.status === 'starting'
                  ? 'Starting Vite…'
                  : 'Pick a project to load previews'}
            </div>
          )}
        </div>
      </main>

      {/* Right: presets + controls */}
      {preview && (
        <aside className="flex w-72 flex-col gap-4 overflow-y-auto border-l border-neutral-800 bg-neutral-900 p-3">
          <section>
            <div className="mb-2 flex items-center gap-1.5 text-[10px] tracking-wider text-neutral-500 uppercase">
              <Layers className="size-3" /> Presets
            </div>
            <div className="flex flex-col gap-1">
              {preview.variants.map((v) => (
                <Button
                  key={v.id}
                  variant={v.id === variant?.id ? 'active' : 'ghost'}
                  size="sm"
                  className="justify-start"
                  onClick={() => selectPreview(preview.id, v.id)}
                >
                  {v.label}
                </Button>
              ))}
            </div>
          </section>
          {preview.controls.length > 0 && variant && (
            <section>
              <div className="mb-2 text-[10px] tracking-wider text-neutral-500 uppercase">
                Controls
              </div>
              <div className="flex flex-col gap-3">
                {preview.controls.map((c) => {
                  const value =
                    state.selection.propOverrides[c.name] ?? variant.props[c.name];
                  return (
                    <label key={c.name} className="flex flex-col gap-1 text-[11px] text-neutral-400">
                      <span>{c.name}</span>
                      {c.kind === 'boolean' ? (
                        <input
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={(e) => setControl(c.name, e.target.checked)}
                        />
                      ) : c.kind === 'number' ? (
                        <input
                          type="number"
                          value={typeof value === 'number' ? value : ''}
                          onChange={(e) => setControl(c.name, e.target.valueAsNumber)}
                          className="rounded bg-neutral-800 px-2 py-1 text-neutral-200"
                        />
                      ) : (
                        <input
                          type="text"
                          value={typeof value === 'string' ? value : ''}
                          onChange={(e) => setControl(c.name, e.target.value)}
                          className="rounded bg-neutral-800 px-2 py-1 text-neutral-200"
                        />
                      )}
                    </label>
                  );
                })}
              </div>
            </section>
          )}
        </aside>
      )}
    </div>
  );
}

function groupByPlatform(
  manifest: AppState['manifest']
): Array<[string, AppState['manifest']]> {
  const map = new Map<string, AppState['manifest']>();
  for (const p of manifest) {
    const list = map.get(p.platform) ?? [];
    list.push(p);
    map.set(p.platform, list);
  }
  return [...map.entries()];
}
```

> If `Button` has no `'active'`/`'primary'` variants, reuse whatever variant names exist in `components/ui/button.tsx` (check before writing — the old `App.tsx` used `'active'`, `'primary'`, `'secondary'`, `'ghost'`, so they exist).

### Task 9: `detached-preview.tsx` view + full typecheck

**Files:**
- Create: `apps/desktop/src/views/detached-preview.tsx`

- [ ] **Step 1: Create the view** — transparent canvas (opacity/blend) + overlay controls (moved from old `App.tsx`).

```tsx
import { useRef } from 'react';
import { MousePointerClick, Pin } from 'lucide-react';
import type { AppState } from '../../electron/types';
import { useHarnessBridge } from '../lib/use-harness-bridge';
import { Slider } from '../components/ui/slider';
import { Checkbox } from '../components/ui/checkbox';

type Api = Window['openStory'] | undefined;

const PLATFORM_BG: Record<string, string> = {
  linkedin: '#f3f2ef', x: '#000000', instagram: '#fafafa', tiktok: '#000000',
  threads: '#101010', facebook: '#f0f2f5', youtube: '#0f0f0f', bluesky: '#ffffff',
};

export function DetachedPreview({ state, api }: { state: AppState; api: Api }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  useHarnessBridge(iframeRef, state.selection);

  const preview =
    state.manifest.find((p) => p.id === state.selection.previewId) ??
    state.manifest[0];
  const platformBg = (preview && PLATFORM_BG[preview.platform]) ?? '#f3f2ef';

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-transparent">
      <div className="drag flex h-7 items-center justify-center bg-neutral-900/70 text-[10px] text-neutral-400 backdrop-blur">
        OpenStory Preview · drag
      </div>
      <div
        className="flex flex-1 items-center justify-center overflow-hidden"
        style={{
          background: platformBg,
          opacity: state.overlay.opacity,
          mixBlendMode: state.overlay.blendMode,
        }}
      >
        {state.iframeUrl && (
          <iframe ref={iframeRef} src={state.iframeUrl} className="h-full w-full border-0 bg-transparent" />
        )}
      </div>
      <div className="no-drag flex flex-col gap-2 bg-neutral-900/85 p-3 backdrop-blur">
        <div className="flex items-center justify-between text-[11px] text-neutral-400">
          <span>Opacity</span>
          <span className="tabular-nums">{Math.round(state.overlay.opacity * 100)}%</span>
        </div>
        <Slider
          min={0} max={1} step={0.01}
          value={[state.overlay.opacity]}
          onValueChange={(v) => api?.invoke('overlay:setOpacity', v[0] ?? 1)}
        />
        <label className="flex items-center gap-2 text-[11px] text-neutral-400">
          <Checkbox
            checked={state.overlay.blendMode === 'difference'}
            onCheckedChange={(c) => api?.invoke('overlay:setBlendMode', c ? 'difference' : 'normal')}
          />
          Difference blend
        </label>
        <label className="flex items-center gap-2 text-[11px] text-neutral-400">
          <Checkbox
            checked={state.overlay.clickThrough}
            onCheckedChange={(c) => api?.invoke('overlay:setClickThrough', Boolean(c))}
          />
          <MousePointerClick className="size-3" /> Click-through
        </label>
        <label className="flex items-center gap-2 text-[11px] text-neutral-400">
          <Checkbox
            checked={state.overlay.alwaysOnTop}
            onCheckedChange={(c) => api?.invoke('window:setAlwaysOnTop', Boolean(c))}
          />
          <Pin className="size-3" /> Always on top
        </label>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Full desktop typecheck**

Run: `pnpm --filter openstory-desktop run typecheck`
Expected: EXIT 0.

- [ ] **Step 3: Build the desktop app**

Run: `pnpm --filter openstory-desktop run build`
Expected: EXIT 0.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src
git commit -m "feat(desktop): role-based renderer — main Storybook app + detached preview, live props"
```

---

## Phase 8 — verification

### Task 10: e2e smoke + manual verify

**Files:**
- Modify: `apps/desktop/tests/smoke.test.ts`

- [ ] **Step 1: Extend the smoke test** — open the bundled example, select a non-first component, edit a control, pop out. Keep it light. Read the existing `smoke.test.ts` for the launch/helper pattern and follow it; add assertions:
  - after selecting a project (point at `examples/linkedin-starter`), the component tree lists more than one preview entry (or at least the linkedin preview),
  - clicking a non-first tree item changes `previewId` (assert the active preview label/canvas updates),
  - editing a text control fires `preview:setProps` (assert the right-panel input reflects the typed value),
  - clicking **Pop out** results in two windows (`electronApp.windows().length === 2`).

> Use the same Playwright-electron harness already in `smoke.test.ts`. If the current test only asserts the window opens, extend that flow rather than rewriting it.

- [ ] **Step 2: Run e2e**

Run: `pnpm --filter openstory-desktop run test:e2e`
Expected: PASS.

- [ ] **Step 3: Manual verification** (drag/opacity can't be unit-tested) — `pnpm --filter openstory-desktop dev`, then:
  - [ ] Open `~/Desktop/openstory/examples/linkedin-starter` → tree lists previews; selecting one renders it opaque in the main canvas.
  - [ ] Right panel: clicking a preset swaps props; editing a text/number/boolean control live-updates the canvas with no reload.
  - [ ] Click **Pop out** → a second frameless transparent window appears mirroring the selection.
  - [ ] In the detached window: opacity slider fades it; difference blend; click-through (F8) lets clicks pass; always-on-top keeps it above other apps. Main window has none of these controls.
  - [ ] Edit a control in the main app → detached window updates live.
  - [ ] Close the detached window → main app unaffected; vite server still running.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/tests/smoke.test.ts
git commit -m "test(desktop): e2e smoke for component select, live control, pop-out"
```

---

## Self-Review notes

- **Spec coverage:** two windows (Task 5/6/7), opaque main + transparent detached (Task 5/8/9), component tree fixes the `manifest[0]` lock (Task 8), presets + live controls (Task 1/3/8), runtime override merge (Task 2), manifest props+controls (Task 3), `propOverrides` state + IPC (Task 4/6), detached lifecycle + window-level overlay ops on detached (Task 5/6), live postMessage no-reload (Task 7), control inference rules (Task 1), error/empty states (Task 8 view), testing (Tasks 1/2/3/10). Covered.
- **Type consistency:** `ManifestControl { name, kind }`, `deriveControls(fixtures)`, `buildManifest(config)`, `mergeProps(preset, overrides)`, `ActiveSelection.propOverrides`, `ManifestPreview.variants[].props` + `.controls`, IPC `preview:setProps|popOut|popIn`, renderer `useHarnessBridge(iframeRef, selection)` — names used identically across tasks.
- **Decision recorded:** selection drives the iframe via `postMessage(pl:render)` (Task 7); `iframeUrl` is the stable base harness URL (Task 6) so the iframe only reloads when the project/port changes.
- **Out of scope (per spec):** multi/snapshot detached windows, explicit argTypes/select controls, object-prop editing, persisting overrides.
