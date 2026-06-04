# Editor Redesign — Storybook-matched canvas, toolbar, and addons

**Date:** 2026-06-04
**Status:** Design (approved direction, pending spec review)

## Goal

Make the desktop app look modern and flat, matching Storybook's editor. Three user complaints drive this:

1. **Looks old / not flat.** The center preview is a floating bordered card (`rounded-xl border shadow-2xl shadow-black/50`) with a 24px margin, on a muted-gray canvas. Wastes space, reads as dated.
2. **Wrong toolbar.** The current toolbar (component pill + Desktop/Mobile + text "Code/Inspect/Pop out" buttons) should be replaced by Storybook's icon toolbar: reload, zoom out/in/reset, measure, grid, outline, viewport, and a pop-out icon.
3. **Controls should be a tab.** The right panel's "Controls" is a section header today; make it a real tab row (Controls / Code).

Plus: **match Storybook's background colors** (white surfaces in light, Storybook's dark surfaces in dark), **fill the canvas edge-to-edge**, and make **every toolbar tool functional** (measure/grid/outline included).

## Decisions (locked)

- **Drop the component pill** from the toolbar — identity lives in the sidebar selection + window title. Pure tool toolbar.
- **Keep the blue brand accent** (`#3b82f6`) for active states (tabs, active tools, sidebar selection). Not Storybook coral.
- **Do both light and dark** themes in this round.

## Architecture

Two cooperating sides, split by where each tool's effect must run:

```
┌─────────────────── apps/desktop (host / renderer) ───────────────────┐
│  Toolbar  ──posts──▶  iframe.contentWindow.postMessage                │
│   • reload, zoom, viewport, pop-out  → act on the iframe element      │
│   • measure / grid / outline toggles → message into the preview       │
│  Right panel: Controls | Code tabs                                    │
│  UI state (renderer-local React): zoom, activeAddons, panelTab        │
└──────────────────────────────────────────────────────────────────────┘
                              │ postMessage
                              ▼
┌──────────── packages/runtime (@gobrand/openstory-runtime, in iframe) ─┐
│  preview-host listens for os:* messages and renders an overlay layer: │
│   • outline  → inject <style> outlining all elements                  │
│   • grid     → fixed grid overlay                                     │
│   • measure  → pointer-tracked canvas drawing the box model           │
│   • reload   → remount the rendered story (re-key)                    │
└───────────────────────────────────────────────────────────────────────┘
```

**Why this split:** measure/grid/outline must inspect and overlay the *rendered* DOM, which lives inside the iframe — so they belong in the runtime. Zoom/viewport/reload/pop-out manipulate the iframe element or window, which only the host can do.

**Why renderer-local state:** zoom level, which addons are on, and the active panel tab are pure view state for the main window. They do not need to round-trip through the Electron main process (unlike `selection`/`manifest`, which do). They live as React state in `MainApp`, exactly like the existing `panelMode`. (Open follow-up, out of scope: mirroring addon state into the detached window.)

## Message protocol (host → preview)

Posted with `iframeRef.current?.contentWindow?.postMessage(msg, "*")`. The runtime already runs a `message` listener in `preview-host.tsx`; we extend it.

| Message | Payload | Effect in runtime |
|---|---|---|
| `os:addon` | `{ addon: "outline" \| "grid" \| "measure", enabled: boolean }` | Toggle that overlay |
| `os:reload` | `{}` | Remount the rendered story (bump a render key) |

Existing messages (`pl:*`) are unchanged. New ones are namespaced `os:` to avoid collision.

Host-only tools (no message): **zoom** transforms the iframe element; **viewport** sets the iframe width; **pop-out** uses the existing `preview:popOut`/`preview:popIn` IPC.

## Components & files

### Visual tokens — `apps/desktop/src/styles.css`

Flatten + match Storybook backgrounds. Update the light (`:root`) and dark (`.dark`) variable blocks.

**Light** (Storybook light surfaces):
- `--background`, `--card`, `--sidebar` → white `#ffffff`
- canvas → white `#ffffff` (no muted gray)
- `--border` / `--input` → `#e3e8ee` (Storybook hairline)
- new `--toolbar-icon: #73828c`, `--toolbar-icon-hover: #2e3438`
- `--brand` unchanged (`#3b82f6`)

**Dark** (Storybook dark surfaces):
- canvas / content `--background` → `#1b1c1d`
- surfaces `--card` / `--sidebar` → `#222425`
- toolbar bar → `#292c2e`
- `--border` → `rgba(255,255,255,0.10)`
- `--toolbar-icon: #9aa4ad`, hover `#ffffff`
- `--brand` unchanged

Add these to the `@theme inline` map so Tailwind exposes `bg-*` / `text-*` / `border-*` utilities (`--color-toolbar-icon`, etc.).

**Remove dated cues:** delete the canvas card's `shadow-2xl shadow-black/50` + border + `rounded-xl`; flatten the `Button` primitive's heavy `ring`/`shadow` variants (keep a calm `ghost` and a flat `active` = `brand-soft` bg + `brand` text, no ring).

### Edge-to-edge canvas + zoom — `apps/desktop/src/views/main-app.tsx`

- Replace the centering wrapper `relative flex flex-1 items-center justify-center overflow-auto p-6` + the floating card with an **edge-to-edge** container: the iframe fills the whole center region, white bg, no border/shadow/margin. Internal centering of the component is the preview's job (it already centers).
- **Zoom wrapper:** wrap the iframe; apply `transform: scale(zoom)` with `transform-origin: top left`, and set the iframe's `width`/`height` to `${100 / zoom}%` so the scaled content still fills (Storybook's approach). Container keeps `overflow:auto` for zoom-in scroll.
- New renderer state: `const [zoom, setZoom] = useState(1)`, `const [addons, setAddons] = useState<{outline:boolean;grid:boolean;measure:boolean}>(...)`, `const [panelTab, setPanelTab] = useState<"controls"|"code">("controls")`.
- Helper `postToPreview(msg)` using `iframeRef`. Reload bumps an iframe `key` or posts `os:reload`. Addon toggles post `os:addon` and also re-post current addon state on iframe load / on `pl:ready` (so a reload re-applies active overlays).
- Right panel: render **always when a component is selected** (no more `panelMode` gating); the panel itself owns the Controls/Code tabs. Provide an optional collapse later (out of scope now).

### Toolbar rewrite — `apps/desktop/src/components/toolbar.tsx`

Replace contents with the icon toolbar. New props: `zoom`, `onZoomIn/Out/Reset`, `addons`, `onToggleAddon`, `onReload` (in addition to existing `state`, `api`, `component`, `story`). Drop `panelMode`/`setPanelMode` (panel owns its tabs now).

Layout (left → right), `h-11`, white/dark bar, 1px bottom border:
- **Reload** icon button → `onReload`
- divider
- **Zoom out** · `{Math.round(zoom*100)}%` · **Zoom in** · **Reset** (reset disabled at 100%)
- divider
- **Measure** · **Grid** · **Outline** toggle buttons (active = `brand-soft` bg + `brand` icon) → `onToggleAddon`
- `ml-auto`:
  - **Viewport** segmented Desktop/Mobile (restyled; keeps the existing `preview:set` viewport call)
  - divider
  - **Pop-out** icon button (existing `preview:popOut`/`popIn`, icon swaps with `state.detachedOpen`)

A reusable `ToolButton` (icon-only, `size-7`, `rounded-md`, `text-toolbar-icon hover:bg-foreground/[0.05]`, `aria-pressed` for toggles) lives in this file or `ui/`. Icons from the existing Hugeicons set in `lib/icons` (reload, zoom-in/out, refresh, ruler, grid, dashed-square, monitor, smartphone, external-link, shrink) — pick the closest available names; add any missing re-exports to `lib/icons`. Every button has a `title`/`aria-label`.

### Right panel tabs — `apps/desktop/src/components/right-panel.tsx`

- Replace the `mode`-prop swap with an internal tab row header: **Controls | Code**, driven by `panelTab` + `onTabChange` props (lifted to `MainApp` so the panel can be opened to a specific tab later). Active tab: `text-foreground font-semibold` with a 2px `brand` underline; inactive: `text-muted-foreground`.
- Body renders `InspectPanel` (Controls) or `CodePanel` (Code) under the tabs. Drop the in-panel `SectionHeader` "CONTROLS" label (the tab now names it); keep the "No editable controls" empty state. `CodePanel` keeps its file-name + Copy row.
- Container stays `w-[320px] border-l`; surfaces follow the new tokens.

### Addon engine — `packages/runtime/src/`

Extend `preview-host.tsx` message handling and add an overlay module. Keep each addon in its own small file with a `mount(): cleanup` / `setEnabled(on)` shape so they're independently testable.

New files:
- `src/addons/outline.ts` — `setOutlineEnabled(on)`: inject/remove a `<style id="os-outline">`. Port Storybook `addon-outline`'s `outlineCSS` (outlines every element type with color-coded rules). Pure DOM, no React.
- `src/addons/grid.ts` — `setGridEnabled(on)`: insert/remove a fixed, `pointer-events:none` overlay element with a repeating `linear-gradient` grid (Storybook backgrounds grid defaults: 100px cells, 10px minor lines; tunable constants).
- `src/addons/measure.ts` — `setMeasureEnabled(on)`: a full-window `pointer-events:none` `<canvas>` overlay + a `pointermove` listener; on hover, read the element's `getBoundingClientRect` + `getComputedStyle` margin/padding/border and draw the box-model (margin / border / padding / content) with dimension labels. Port the geometry + drawing from Storybook `addon-measure` (`box-model`, `canvas`, `label`, `rect` utils), trimmed to mouse-hover (no keyboard step).
- `src/addons/index.ts` — small registry: `applyAddons(state: {outline,grid,measure})` calling each `setEnabled`, used by the message handler.

`preview-host.tsx` changes:
- In the existing `message` listener, handle `os:addon` (update local addon state, call the registry) and `os:reload` (bump a `remountKey` so the rendered component remounts).
- On mount and whenever the host re-sends state (e.g. after `pl:ready`), apply the current addon state — so overlays survive remounts/HMR.
- Overlays attach to `document.body` (above the rendered component); they never alter the component's own DOM except outline's global `<style>`.

## Data flow (example: user clicks Outline)

1. Toolbar `Outline` button → `onToggleAddon("outline")` in `MainApp` → `setAddons(a => ({...a, outline: !a.outline}))`.
2. Effect posts `os:addon {addon:"outline", enabled:true}` to the iframe.
3. Runtime message handler updates its addon state, calls `applyAddons`, which injects the outline `<style>`.
4. Button shows active (`brand-soft` bg). On a later reload, `MainApp` re-posts current addon state on `pl:ready`, re-injecting the style.

## Error handling

- **postMessage before iframe ready:** posts are no-ops if `contentWindow` is null; `MainApp` re-sends addon state on `pl:ready`, so nothing is lost.
- **Measure overlay perf:** `pointermove` is throttled via `requestAnimationFrame`; the canvas is removed (listener detached) when measure is off.
- **Zoom bounds:** clamp `zoom` to `[0.25, 3]`; reset → 1.
- **Outline/grid teardown:** toggling off removes the injected node so no residue remains across stories.
- **No selected component:** toolbar tool buttons that need the preview are disabled when `!component` (matches today's `disabled={!component}`).

## Testing

Unit (vitest), following the repo's existing pure-unit style:
- `addons/outline` / `addons/grid`: `setEnabled(true)` inserts the node with the expected id; `setEnabled(false)` removes it; idempotent on double-toggle. (jsdom.)
- `addons/measure`: box-model geometry helper (given rect + computed margins/paddings → the four nested rectangles) is a pure function and is unit-tested directly; the canvas drawing is thin and excluded.
- Toolbar: zoom label renders `Math.round(zoom*100)%`; reset disabled at 1; toggle buttons reflect `aria-pressed` from `addons`. (Component test if the desktop suite supports it; otherwise a pure `zoomLabel`/`clampZoom` helper is unit-tested.)
- `clampZoom` and the zoom-step function are pure helpers in their own file, unit-tested.

Manual smoke (Task-9-style): load `examples/linkedin-starter`, verify edge-to-edge white canvas; toggle each addon and see the overlay; zoom in/out/reset; switch Controls/Code tabs; pop out; flip to dark mode and confirm surfaces match Storybook dark.

## Out of scope (explicit)

- Mirroring zoom/addon state into the **detached** preview window (host posts to the main iframe only for now).
- Storybook's full addon panel system, viewport **dropdown** with many device presets (we keep Desktop/Mobile), backgrounds **color** picker, keyboard-stepped measure.
- Coral accent, multi-tab components, panel collapse/resize.

## File-change summary

| File | Change |
|---|---|
| `apps/desktop/src/styles.css` | Flatten + Storybook bg tokens (light + dark); new toolbar-icon vars; `@theme inline` additions |
| `apps/desktop/src/components/ui/button.tsx` | Flatten variants (drop heavy ring/shadow) |
| `apps/desktop/src/views/main-app.tsx` | Edge-to-edge canvas; zoom wrapper; renderer state (zoom/addons/panelTab); `postToPreview`; always-on right panel |
| `apps/desktop/src/components/toolbar.tsx` | Full rewrite: icon toolbar (reload/zoom/measure/grid/outline/viewport/pop-out); `ToolButton` |
| `apps/desktop/src/components/right-panel.tsx` | Controls/Code tab header; drop section label |
| `apps/desktop/src/lib/icons.ts` | Re-export any missing Hugeicons used by the toolbar |
| `packages/runtime/src/preview-host.tsx` | Handle `os:addon` / `os:reload`; apply addon state on ready; remount key |
| `packages/runtime/src/addons/{outline,grid,measure,index}.ts` | New addon overlay engine |
| `packages/runtime/src/addons/*.test.ts` | Unit tests (outline/grid insert-remove, measure geometry) |
| `apps/desktop/src/.../*.test.ts` | zoom helpers / toolbar state tests |
