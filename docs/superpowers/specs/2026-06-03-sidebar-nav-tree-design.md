# Sidebar + Navigation Tree (Storybook parity — area 2)

**Date:** 2026-06-03
**Status:** Approved design, pre-implementation
**North star:** [`storybook-parity-north-star.md`](./2026-06-03-storybook-parity-north-star.md) — area 2
**Builds on:** [`general-storybook-grouping-presets`](./2026-06-02-general-storybook-grouping-presets-design.md) (`group` paths), [`theme-light-dark`](./2026-06-03-theme-light-dark-design.md) (semantic tokens)

## Problem

Our sidebar renders repos as an accordion; the active repo expands to a flat
group tree of preview leaves. A component's **stories** (`variants`) are not in
the tree — they are picked as buttons in the right panel. There is no per-component
Docs node, node kinds aren't differentiated by icon, and search lives in the
titlebar, detached from the tree.

Storybook's sidebar is the bar: a searchable, collapsible
**section → component → (Documentation + stories)** tree with kind icons and
keyboard nav. We match that layout — it is plainly better than ours today — and
fix the papercuts Storybook users complain about (below) so we match the look
without inheriting the friction. We win on automation/overlay/diff later; here we
reach parity on the structural backbone.

## CTO decisions (settled in brainstorm)

1. **Match Storybook's left-sidebar layout.** Same structure, icons, selection feel.
2. **Repo = switcher, not accordion.** A compact repo dropdown at the top of the
   sidebar; the tree below is pure sections for the active repo. Only one repo's
   manifest loads at a time (single Vite host), so this also fits the architecture.
3. **Sections are auto-derived** from each component's workspace location
   (`apps/app` → "App", `packages/ui` → "UI"); non-monorepo → no sections.
   Author `group` nests under the section. Strong defaults, simple override.
4. **Stories become tree leaves now.** Selecting a story loads that variant on the
   canvas. The right-panel variant-picker ("Presets") list is superseded and removed.
5. **Docs node is stubbed now.** A synthetic `Documentation` node per multi-story
   component routes to a lightweight placeholder; the real docs view is area 6.

## Non-goals (scope boundary)

- Canvas/preview chrome and the right addon-panel **tabs** — areas 3/5.
- Typed controls / args table — area 4. We only *remove* the presets list from the
  right panel; live Controls stay untouched.
- Docs **content** — area 6. We add the node + a stub route only.
- Multi-manifest (loading several repos at once). One active repo, as today.

## Lessons from Storybook complaints (baked into this design)

Researched from Storybook issues (#10757 search, #13040/#13000 keyboard, #8255
single-story hoist, #1859 mixed levels). We adopt the layout *and* the fixes:

| Storybook pain | Our fix |
|----------------|---------|
| Fuzzy search is noisy — "button" misses Button (#10757) | Rank **exact → prefix → substring → fuzzy**; never bury an exact label. Match component + story + section labels. |
| Tedious to open folders one-by-one in large libs | **Default-expanded** tree (Storybook defaults collapsed — the actual papercut) + search **auto-expands** the path to every hit; per-node collapse for what you want hidden. |
| Keyboard nav skips items / jumps scroll to top / loses cursor (#13040) | Cursor walks a **flattened list of currently-visible nodes**; selection preserves scroll; no focus reset on expand/collapse. |
| Single-story components create ugly one-entry folders (#8255) | **Hoist:** a component with exactly one variant is a leaf that loads it directly — no expand arrow, no lone Docs child. |
| Can't have stories + nested folders at one level (#1859) | Folders hold components **and** subfolders; ungrouped/sectionless leaves render first at the root. |

## Architecture

Detection is Node's job (it has fs + workspace access); presentation and
interaction are the renderer's. Same "resolved-in-plugin" boundary the preset
work set — Electron and the renderer consume already-resolved values.

### A. Section derivation — `packages/vite-plugin`

We split Storybook's single `title` string into two concerns:

- **`section`** — auto-derived repo structure (where the file lives).
- **`group`** — author taxonomy (existing field, how they want it organized).

Algorithm, per preview, at manifest-build time:

1. From the preview's `sourcePath`, walk up to the **workspace root**: the nearest
   ancestor containing `pnpm-workspace.yaml`, or a `package.json` with a
   `workspaces` field (npm/yarn). Cache per build.
2. If a workspace root exists and the component lives under it, `section` = the
   **first path segment of the component's package dir relative to the root**,
   title-cased for display (`apps/app/src/...` → key `app`, label "App";
   `packages/ui/...` → key `ui`, label "UI"). Keep both raw key + display label.
3. **No workspace** (single-package repo, or no markers) → `section = null`. The
   component renders at the tree root (flat, Storybook-style); no section chrome.
4. Author `group` is independent: it nests **under** the derived section. A
   config-level section rename/pin escape hatch is reserved (not MVP).

Emitted as `section: string | null` on `ManifestPreview` (the workspace package
basename, e.g. `"app"`, `"ui"`). The section header renders it **uppercased via
CSS** (like Storybook's `APPLICATION` / `DESIGN SYSTEM`), so no title-casing is
stored. Pure additive field — no behavior change to `group`/`background`.

### B. Tree model — renderer

A `ManifestPreview` already *is* a component (`id` + `variants[]`). Story leaves
are its variants; the Docs node is **synthetic** (generated, not authored). The
tree is a pure projection of the flat manifest — nothing new to persist beyond
collapse state.

Node kinds (discriminated union, so render + keyboard logic stay total):

| Kind | Source | Icon (Hugeicons, color) | On select |
|------|--------|------|-----------|
| `section` | derived `section` | none — uppercase header + collapse caret | toggle collapse |
| `folder` | intermediate `group` segment | folder, purple | toggle collapse |
| `component` | a `ManifestPreview` (≥2 variants) | grid/component, blue | toggle collapse |
| `docs` | synthetic, per multi-story component | document, amber | route to docs **stub** |
| `story` | a `variant`, **or** a hoisted single-variant component | bookmark, teal | load variant on canvas → set `previewId`+`variantId` |

`buildTree(manifest)` replaces `buildGroupTree`:

1. Bucket by `section` (null → an unlabeled root bucket).
2. Within a section, nest `group` segments into `folder` nodes.
3. Each component →
   - **≥2 variants:** a `component` node with children `[docsNode, ...storyNodes]`.
   - **1 variant:** **hoisted** to a single `story` leaf (no component wrapper, no
     docs node). Label = component name.
4. **Ordering:** sectionless/ungrouped leaves first at root; then sections in
   first-seen order; folders first-seen; components alpha; stories in authored order.
5. Each node carries a stable path-derived `id` for selection, collapse, keyboard.

Real Hugeicons names resolved at build (component/docs/bookmark glyphs added to
`apps/desktop/src/lib/icons.ts`); colors per the reference (blue/purple/amber/teal),
expressed via semantic tokens where possible.

### C. Interaction

- **Search/filter** — input at the top of the sidebar (`Find components…`).
  Filters the tree to matching nodes; **ranking exact → prefix → substring → fuzzy**
  so exact labels never get buried. Ancestors of matches stay visible and
  auto-expand; clearing restores the prior collapse state. Matches component, story,
  and section labels; match substring highlighted. The global ⌘K command palette is
  unchanged (separate jump-anywhere surface).
- **Keyboard nav** — focus on a node: `↑/↓` move across the **flattened
  visible-node list**, `→` expand/descend, `←` collapse/ascend, `Enter`/`Space`
  select. Selection preserves scroll position; expand/collapse never resets the
  cursor or jumps to top (the Storybook #13040 fix).
- **Expand/collapse** — the tree is **default-expanded**; clicking a container
  toggles it. Collapse is a pure UI concern, so it lives in the renderer and
  persists in `localStorage` keyed by repo id (survives reload; no IPC round-trip).
- **Selection** — `selection.previewId` + `variantId` already persist (in the
  electron store, since they drive the iframe). Add `selection.docsComponentId:
  string | null` for when a Docs stub is the active node, set via a new
  `preview:setDocs` IPC; selecting a story clears it.

### D. Repo switcher + right-panel cleanup

- **Switcher** — compact control at the top of the sidebar: active repo name +
  caret → dropdown of all repos (each with remove) + `Add repository…`. Selecting
  swaps the loaded repo via the existing `project:select`. Replaces the repo
  accordion. Frees the titlebar `Search components…` field (palette stays on ⌘K).
- **Right panel** — remove the `Presets` (variant-picker) block from
  `right-panel.tsx`; story selection now lives in the tree. Live **Controls** stay.
  `panelMode` untouched (area 3 owns the panel model).

## Manifest / type changes

| Type | Change |
|------|--------|
| `ManifestPreview` (`apps/desktop/electron/types.ts`) | add `section: string \| null` |
| `ManifestPreview` build (`packages/vite-plugin/src/plugin.ts`) | emit `section` |
| `ActiveSelection` | add `docsComponentId: string \| null` (active node is a Docs stub) |
| `IpcInvoke` | add `preview:setDocs(componentId: string \| null)` |

The desktop reads the manifest over HTTP (`/__pl__/manifest.json` → `fetchManifest`
in `ipc.ts`), **not** through `bridge.ts` — so the runtime bridge message is
untouched. Collapse state is renderer `localStorage`, not store state.

## File touch-points

| Layer | File | Change |
|-------|------|--------|
| Section derive | `packages/vite-plugin/src/plugin.ts` (+ new `derive-section.ts`) | resolve workspace root + `section` per preview; emit it |
| Types | `apps/desktop/electron/types.ts` | `section` field; `docsComponentId`; `preview:setDocs` |
| IPC | `apps/desktop/electron/ipc.ts` | `preview:setDocs` handler; clear `docsComponentId` on `preview:set` |
| Tree | `apps/desktop/src/components/sidebar.tsx` | replace `buildGroupTree`→`buildTree`; node-kind rendering; switcher; search; keyboard |
| Tree build (extract) | `apps/desktop/src/components/sidebar/build-tree.ts` (new) | pure `buildTree` + node types, unit-tested in isolation |
| Icons | `apps/desktop/src/lib/icons.ts` | add component / document / bookmark glyphs |
| Right panel | `apps/desktop/src/components/right-panel.tsx` | drop presets block |
| Docs stub | `apps/desktop/src/views/` | placeholder route for a Docs node (until area 6) |
| Palette | `apps/desktop/src/components/command-palette.tsx` | include story leaves + section labels in results |

## Testing

- **`vite-plugin`** — section derivation: monorepo `apps/app`→"App",
  `packages/ui`→"UI"; non-monorepo → `null`; component at workspace root; author
  `group` nests under section; workspace-root cache correctness.
- **renderer `build-tree.ts`** — sectionless-first ordering; single-variant hoist
  (no component wrapper / no docs node); multi-variant → component + docs + stories;
  folders hold mixed children; stable ids; search ranking (exact before fuzzy) +
  ancestor-keep; collapse persistence round-trips.
- **desktop e2e** (Playwright `_electron`, per existing theme tests) — the harness
  doesn't seed a project, so automated e2e covers always-rendered chrome: repo
  switcher present, `Find components…` search present, `Add repository…` reachable
  in the dropdown, existing suite stays green. Story-leaf → canvas, Docs → stub,
  and keyboard nav are covered by the `build-tree`/`search` unit tests (selection +
  flatten mapping) plus a manual smoke pass against `examples/linkedin-starter`.

## Risks

- **Workspace detection** is the only new Node logic — isolate + unit-test against
  monorepo and single-package fixtures; fall back to `null` (flat) on any ambiguity
  rather than guessing a wrong section.
- **`buildTree` + keyboard** is the main new UI logic — extracted to a pure module
  and tested independently of React.
- **Scope creep into areas 3–6** — explicitly fenced by Non-goals; we touch the
  right panel only to *remove* the superseded presets list.
