# OpenStory — Storybook-style main app + detached live preview

> Design spec. Date: 2026-05-29. Status: approved for planning.

## Goal

Turn OpenStory's single frameless overlay into two cooperating windows:

1. **Main window** — an opaque, modern Storybook-like app: a component tree, a canvas, and a props panel (curated presets **plus** live per-prop controls). No transparency controls here.
2. **Detached preview window** — today's frameless, transparent, always-on-top overlay (opacity / difference-blend / click-through). Launched per component via a **Pop out** button. Live-linked to the main window, single instance.

This fixes the current defect (the HUD auto-locks to `manifest[0]` with no component picker — only one platform's variants are ever reachable) and adds Storybook-style prop editing, while preserving the pixel-compare overlay as its own window.

## Current state (grounding)

- **`apps/desktop/src/App.tsx`** — one renderer. Picks `manifest.find(previewId) ?? manifest[0]`; renders only that preview's variants + the overlay controls. No component selector. This is the bug.
- **`apps/desktop/electron/`** — `main.ts` (app bootstrap), `windows/hud.ts` (single `BrowserWindow`), `ipc.ts` (handlers + `broadcastState`), `store.ts` (`AppStore`, persisted via `electron-store`), `vite-host.ts` (`ViteHost.start(root)` boots the project's vite in `mode: 'openstory'`, port 0), `types.ts` (shared IPC + state types).
- **`packages/vite-plugin/src/plugin.ts`** — serves `/__pl__` harness + `/__pl__/manifest.json`. The manifest currently emits `{ id, platform, variants: [{ id, label }] }` — **no props**.
- **`packages/runtime/src/preview-host.tsx`** — `mountPreviewHost` renders the selected fixture. `PreviewStage` uses `fixture.props` only and **ignores** `RenderMessage.fixtureOverrides`.
- **`packages/runtime/src/bridge.ts`** — `RenderMessage` already declares `fixtureOverrides?: Record<string, unknown>`. `pl:render` / `pl:manifest` / `pl:ready` / `pl:size` message types exist.
- **`packages/config/src/define.ts`** — `Fixture<T> = { id, label, props, notes? }`; `defineStories` already captures each story's `props`. The data we need is already collected; it's just not exposed downstream.

## Architecture

### Windows

Two `BrowserWindow`s, same renderer bundle, role selected by a query param (`?role=main` / `?role=detached`):

- **Main**: standard window, opaque, normal title bar, resizable. Default window on launch.
- **Detached**: `frame: false`, `transparent: true`, `alwaysOnTop` (user-togglable), `hasShadow: false`. Created lazily on first **Pop out**; reused thereafter (single instance). Closing it returns to main-only.

The Electron **main process** stays the single source of truth (`AppStore` + `broadcastState`). Both windows are pure views over the same `AppState`; neither owns canonical state.

### Canvas (shared)

Both windows embed the **same** vite harness iframe (`http://127.0.0.1:<port>/__pl__/?role=…`). The iframe content is identical; only the **window chrome** differs (opaque vs transparent) and the **overlay CSS** (opacity / blend) is applied by the detached window's wrapper, exactly as `App.tsx` does today. The main window renders the canvas at full opacity with no blend.

### State model

`AppState` (in `types.ts`) extends with prop overrides; overlay state becomes detached-only in meaning (still stored centrally):

```ts
type ActiveSelection = {
  projectId: string | null;
  previewId: string | null;        // now driven by the component tree
  variantId: string | null;        // the active preset fixture
  viewport: 'desktop' | 'mobile';
  propOverrides: Record<string, unknown>;  // NEW — live edits on top of the preset
};
```

- Selecting a **preset** sets `variantId` and **clears** `propOverrides` (preset = clean starting point).
- Editing a **control** writes into `propOverrides` (merged over the preset's props downstream).
- `overlay` (opacity/blend/click-through/alwaysOnTop) is applied by the **detached** window only. The main window ignores it.

### Data flow (selection + live props)

```
defineStories(openstory.config.ts)
  └─ vite plugin /__pl__/manifest.json   [+ fixtures[].props, + controls[]]
       └─ MAIN renders tree + presets + controls
            └─ user edits prop → IPC 'preview:setProps' → AppStore.propOverrides
                 └─ broadcastState → both renderers
                      └─ each renderer postMessages pl:render {previewId,variantId,viewport,fixtureOverrides:propOverrides} into its iframe
                           └─ runtime PreviewStage renders {...fixture.props, ...fixtureOverrides} — re-render, no reload
```

Transport is the **existing postMessage bridge** (no iframe reload → no flicker). URL params remain the cold-start seed (`readSelectionFromUrl`); postMessage drives all subsequent updates.

## Component / manifest / controls

### Manifest gains props + control descriptors

Extend the plugin manifest **and** the `pl:manifest` postMessage so each fixture carries its props, and each preview carries an inferred control list:

```ts
type ManifestControl = {
  name: string;                                   // prop key
  kind: 'text' | 'boolean' | 'number' | 'select'; // inferred
  options?: string[];                             // for 'select' (union of string values seen across fixtures)
};
type ManifestPreview = {
  id: string;
  platform: string;
  variants: Array<{ id: string; label: string; props: Record<string, unknown> }>;  // props NEW
  controls: ManifestControl[];                                                      // NEW
};
```

### Control-type inference (no extra author declaration)

Infer from the JS types of the fixtures' prop values (union across all fixtures of a preview):

- `string` → `text`
- `boolean` → `boolean`
- `number` → `number`
- a prop that is a `string` in some fixtures and takes a small set of distinct values across fixtures → still `text` for v1 (no reliable enum source). `select` is reserved for a future explicit `argTypes` declaration — **out of scope now**.
- `undefined`/missing in a fixture → control still listed if any fixture defines it; missing value treated as empty.
- non-primitive props (objects/arrays/functions/ReactNode) → **no control** (not editable inline); they still pass through from the preset unchanged.

Inference lives in `@gobrand/openstory-config` (a `deriveControls(previews)` helper) so both the vite manifest route and tests share one implementation.

### Runtime override merge (the 1-line gap)

`PreviewStage` merges overrides over preset props:

```ts
const props = { ...(fixture.props ?? {}), ...(selection.fixtureOverrides ?? {}) };
```

`App` in `preview-host.tsx` already receives `fixtureOverrides` on `pl:render`; thread it into `selection` and pass to `PreviewStage`.

## Main window UI (`App.tsx` → split)

Refactor the single `App.tsx` into role-based views (keep files focused):

- `src/views/main-app.tsx` — Storybook layout:
  - **Left**: component tree grouped by `platform` → preview. Selecting a preview sets `previewId` (clears overrides, selects its first fixture).
  - **Center**: opaque canvas iframe + a `Desktop | Mobile` viewport toggle + a `⧉ Pop out` button (calls `preview:popOut`).
  - **Right**: `Presets` (the fixtures, click swaps + clears overrides) and `Controls` (rendered from `manifest.controls`, seeded from the active fixture's props merged with current overrides; editing calls `preview:setProps`).
  - No opacity/blend/click-through here.
- `src/views/detached-preview.tsx` — transparent canvas iframe + the overlay controls section moved verbatim from today's `App.tsx` (opacity slider, difference blend, click-through, always-on-top). Reads/writes `overlay` state.
- `src/App.tsx` — reads `?role` and renders `MainApp` or `DetachedPreview`. Shared state subscription stays here.

The existing shadcn-style primitives (`components/ui/*`) and `lib/utils` are reused.

## IPC additions (`types.ts` + `ipc.ts`)

```ts
'preview:setProps': (overrides: Record<string, unknown>) => void;  // merge/replace propOverrides
'preview:popOut': () => void;     // create-or-focus the detached window
'preview:popIn': () => void;      // close the detached window (also on window close)
```

`preview:set` keeps driving `previewId`/`variantId`/`viewport` (clears `propOverrides` when `variantId` changes). `broadcastState` already fans `state:update` to all windows — extend it to enumerate both windows.

## Detached window lifecycle (`windows/`)

- Add `windows/detached.ts` mirroring `windows/hud.ts` but `frame:false, transparent:true`. (Rename/repurpose `hud.ts` → `main.ts`-window or keep as the main window factory.)
- `preview:popOut`: if detached window absent → create + load renderer `?role=detached`; else focus it.
- On detached `closed`: clear the reference; main window unaffected.
- `window:setAlwaysOnTop` now targets the **detached** window.
- Single instance only (re-pop focuses the existing one) — per the live-linked decision.

## Error handling

- No `openstory.config.ts` in the picked folder → plugin already serves a friendly message; main app shows the empty/`vite.error` state (existing behavior).
- Empty `manifest.previews` → main app shows "No previews found in openstory.config.ts" in the tree area.
- A prop control whose value can't render (component throws) → the harness iframe surfaces the error; the main app stays usable (the canvas is sandboxed in the iframe).
- Detached window: closing it must never tear down the vite server or the main window (`ViteHost` is owned by main process, independent of windows).

## Testing

- **config** (`define.test.ts` + new): `deriveControls` infers `text`/`boolean`/`number` and skips non-primitive props; unions prop keys across fixtures; fixtures expose `props`.
- **runtime** (`preview-host` test): `PreviewStage` renders `{...preset, ...overrides}`; `pl:render` with `fixtureOverrides` updates the rendered props without remount.
- **vite-plugin** (`plugin.test.ts`): manifest JSON includes `variants[].props` and `controls[]`.
- **desktop**: existing Playwright e2e (`tests/smoke.test.ts`) — extend to: open example project, select a non-first component from the tree, edit a text control, pop out, confirm a second (transparent) window exists and mirrors the selection. Keep it light (smoke-level).

## Out of scope (YAGNI)

- Multiple detached windows / frozen snapshots (chose live-linked single).
- Explicit `argTypes`/`select` declarations (inference only for v1).
- Editing object/array/ReactNode props inline.
- Persisting `propOverrides` across restarts (presets persist via selection; overrides are session-scoped).

## Files

**Modify**: `packages/config/src/define.ts` (+`deriveControls`, export `ManifestControl`), `packages/vite-plugin/src/plugin.ts` (manifest props+controls), `packages/runtime/src/preview-host.tsx` (override merge + thread `fixtureOverrides`), `apps/desktop/electron/types.ts` (state + IPC), `apps/desktop/electron/ipc.ts` (new handlers, broadcast both windows), `apps/desktop/electron/store.ts` (`propOverrides` default), `apps/desktop/electron/main.ts` + `windows/hud.ts` (window factories).
**Create**: `apps/desktop/electron/windows/detached.ts`, `apps/desktop/src/views/main-app.tsx`, `apps/desktop/src/views/detached-preview.tsx`.
**Tests**: extend the four test files noted above.
