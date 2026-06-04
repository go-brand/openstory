# Native App Shell — Design

**Date:** 2026-05-31
**Branch:** feat/main-app-detached-preview
**Goal:** Make the OpenStory desktop app feel native — a full-width titlebar, command-palette search, a left sidebar of collapsible repositories, a second per-tab toolbar holding the viewport toggle plus Code/Inspect panel switches, and a migration to Hugeicons.

## Context

- Renderer shell lives in `apps/desktop/src/views/main-app.tsx` (3 columns: sidebar, canvas, right panel). Icons currently from `lucide-react`.
- Electron main: `electron/ipc.ts` (IPC handlers), `electron/store.ts` (`electron-store` persistence of `projects[]` + `selection`), `electron/windows/main-window.ts` (`titleBarStyle: 'hiddenInset'`).
- **Single Vite host:** `project:select` boots one Vite dev server (`vite-host.ts`); the manifest is fetched from that server. Only one project's components are loadable at a time.
- **Manifest** (`packages/vite-plugin/src/plugin.ts` `buildManifest`) exposes `id/platform/variants/props/controls` per preview. No source file path — `component` is a function reference.
- Hugeicons reference (matching `~/Desktop/tanstack-start/apps/app`): `@hugeicons/react` `HugeiconsIcon` + `@hugeicons/core-free-icons`.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Code panel source | **Real file source** — path travels config → manifest → IPC fs-read. |
| Top-bar search | **⌘K command palette** overlay. |
| Repo collapse behavior | **Accordion** — exactly one repo expanded (= the active project). |
| Right-panel non-Code name | **Inspect** (icon + label). |

## Layout

```
┌───────────────────────────────────────────────────────────────────┐
│ ◉◉◉   OpenStory          [ ⌘K  Search components… ]      ← TITLEBAR │  full-width drag, native lights left
├──────────────┬────────────────────────────────────────────────────┤
│ ▼ my-app     │ [ Button ]   [Desktop│Mobile]   [</>Code][⚙Inspect][⤢] │  ← TAB + TOOLBAR (2nd header)
│   Button     ├────────────────────────────────────────┬───────────┤
│   Card       │            CANVAS (iframe)             │  RIGHT    │
│ ▶ design-sys │                                        │  PANEL    │
│ ▶ marketing  │                                        │  Inspect  │
│ [+ Add repo] │                                        │  ⇄ Code   │
└──────────────┴────────────────────────────────────────┴───────────┘
```

## Components / changes

### A. Native titlebar (`titlebar.tsx`, new)
Full-width `h-11` row, whole row `-webkit-app-region: drag`. Traffic-lights inset on the left (`pl-[78px]`). OpenStory wordmark. A `no-drag` search-trigger button styled like a search field, opens the ⌘K palette. Window keeps `hiddenInset`; realign `trafficLightPosition` y to the taller bar.

### B. Command palette (`command-palette.tsx`, new)
Overlay + global ⌘K / Ctrl+K listener. Subsequence fuzzy match over the active repo's previews; a "Switch repository" section lists the other repos. Enter on a preview → `preview:set`; Enter on a repo → `project:select`. Keyboard up/down/enter/escape. No new dependency.

### C. Sidebar = repo accordion
Replaces the project `Select`. Each repo is a collapsible section; **accordion — exactly one expanded**, which is the active project (`selection.projectId`). Expanding a collapsed repo calls `project:select` (boots its Vite, loads its manifest). The platform-grouped preview tree renders only under the active repo (others are lazy — collapsed, nothing loaded, by design of the single Vite host). `+ Add repo` button at the bottom → `project:pickFolder` → `project:add` → `project:select`. Hover-× per repo → `project:remove`. Persistence already handled by `electron-store`.

### D. Second header — tab + toolbar
Under the titlebar, in the main column. Left: one "tab" chip showing the active component name (seam for future multi-tab — not built now). Middle: Desktop│Mobile segmented toggle (moved out of the old canvas bar). Right-aligned: `[</> Code]` + `[⚙ Inspect]` panel toggles, then the pop-out button. Right-panel state is `'inspect' | 'code' | null` (renderer-local `useState`); clicking the currently-active toggle closes the panel.

### E. Right panel
- `inspect` mode: today's Presets + Controls, content unchanged.
- `code` mode: source fetched via IPC, rendered in a mono/wrapped `<pre>` with a Copy button. No syntax-highlighting library (YAGNI). Falls back to a generated `<Component {...props} />` JSX snippet when no source resolves.

### F. Real-source plumbing (only backend work)
Mechanism: **explicit opt-in `sourcePath`** on the preview/stories def. Chosen over auto-capturing the stories file path (via an `import.meta.url` injection transform) because it is lower-risk (no source mutation, no node-in-browser bundling concern) and *more* correct — it points at the component file the user actually wants to see, not the stories wrapper.
1. `StoriesDef` / `PreviewDef` / `RegisteredPreview` in `packages/config/src/define.ts` gain optional `sourcePath?: string` (relative to the project root). `defineStories` copies it through.
2. `buildManifest(config, projectRoot?)` in the vite-plugin resolves `sourcePath` against `projectRoot` to an absolute path and adds `sourcePath: string | null` per preview (null when not set).
3. New IPC `preview:getSource(previewId)` in `electron/ipc.ts` + `electron/types.ts`: looks up the preview's `sourcePath` from the in-memory manifest, fs-reads it (guard: resolved path must sit inside the active project root; size cap 256 KB) → `{ path: string; code: string } | null`.
4. Example `examples/linkedin-starter/openstory.config.ts` stories set `sourcePath` to the component `linkedin.tsx` so the Code panel shows component code.
5. Projects that don't set `sourcePath` get `null` → Code panel falls back to the generated `<Component {...props} />` snippet.

### G. Icons
Migrate the desktop app from `lucide-react` to `@hugeicons/react` + `@hugeicons/core-free-icons`. Add deps to `apps/desktop/package.json`. Replace each icon usage with `<HugeiconsIcon icon={…Icon} />`. The Button CVA `[&_svg]:size-3.5` selector keeps sizing.

## Data flow

- Repo expand → `project:select(id)` → main boots Vite for that path → `viteHost` subscribe → `fetchManifest` → `broadcastState` → renderer sidebar renders previews under the active repo.
- Code panel open → renderer calls `preview:getSource(previewId)` → main resolves `sourcePath` from the in-memory manifest, fs-reads guarded, returns code → panel renders.
- Panel mode + palette-open are renderer-local UI state, not persisted in `electron-store`.

## Error handling

- `preview:getSource`: returns `null` on missing/oversized/out-of-root/unreadable file; panel falls back to the generated snippet.
- Palette over an empty/loading manifest: shows "No components" / loading state; switching repos still works.
- Auto-capture transform must no-op safely on files that don't call `defineStories` and must not break existing configs lacking `sourcePath`.

## Testing

- `packages/config`: `defineStories` preserves/sets `sourcePath`; manifest includes `sourcePath`.
- `packages/vite-plugin`: `buildManifest` emits `sourcePath`; transform injects source url only into `defineStories` calls.
- `apps/desktop` e2e (extend existing Playwright smoke): titlebar drag region present; ⌘K opens palette and selects a component; repo accordion expand selects project; Code/Inspect toggles swap the right panel; Code panel shows source.

## Scope boundaries (YAGNI)

- Multi-tab is a **seam**, not built — one tab chip only.
- No syntax-highlighting dependency.
- Command palette searches the **active** repo's components; other repos appear only as switch actions.
- No new persisted state for panel mode / palette.
