# Sidebar mode switch (Design System / Docs)

**Date:** 2026-06-28
**Status:** Approved design, pre-implementation
**Builds on:** [feature-docs](./2026-06-26-feature-docs-design.md) (`docs[]` manifest + `page` leaves), [sidebar nav tree](./2026-06-03-sidebar-nav-tree-design.md) (`buildTree`)

## Problem

Feature docs and the component design system now share one sidebar tree. They
are two different products with two different mental models — a component
catalog (browse by component → variants → controls) vs. product knowledge
(browse by feature). Interleaving them as peer folders is a category error: a
"Features" folder reads as just another component group, the component browser
gets walls of prose, and a reader looking for "how notifications work" wades
through Badge variants.

**Separate them into two modes.** The manifest already ships `components[]` and
`docs[]` as distinct arrays; the desktop should expose a **mode switch** that
swaps which one drives the sidebar — keeping the project switcher and preview
surface shared.

> Note: this is distinct from a component's auto-docs ("Documentation" leaf).
> That documents a *component* and stays in Design System mode. Feature docs
> (`*.stories.md`) are the *Docs* mode.

## Decisions (settled in brainstorm)

1. **Two modes: `design` | `docs`.** A segmented pill of icon+label tabs sits
   directly under the project switcher (the reference pattern: workspace
   selector → tab pill → swapping nav). Minimal chrome, matching the
   repo-switcher's rounded/bordered aesthetic.
2. **Mode filters the tree only.** `design` → tree from `components[]`; `docs` →
   tree from `docs[]`. The preview surface, toolbar, right panel, and project
   switcher are unchanged and shared across modes.
3. **Component auto-docs stay in Design System mode.** They belong to a
   component, not to the Docs mode. (No code change — they are already part of
   the component tree.)
4. **Auto-default to the populated mode.** On manifest load, if the active mode
   has zero entries and the other has some, switch to the populated one. A
   project with only components opens in Design System; only docs → Docs.
5. **Empty-mode state.** Active mode with zero entries shows a one-line hint
   (Docs: "Drop a `*.stories.md` to document a feature."; Design System: the
   existing "No stories found" copy).
6. **Mode persists** in the selection store (global, like `viewport`), so it
   survives relaunch; reconciled against content on load (decision 4).
7. **Switching mode does NOT change the rendered preview** or the current
   selection — it only re-roots the tree. Re-selecting in the new tree drives
   the preview. (Matches Linear/Figma mode behavior; no jarring auto-render.)

## Non-goals (v1 cuts — fast-follows)

- **Mode-aware search.** Command-palette search stays as-is in v1. Making search
  span both modes and switch mode on select is a fast-follow.
- **Per-project mode memory.** Mode is global, not remembered per project.
- **A third mode / more tabs.** Two modes only.
- **Animated tab transitions.** Static swap; no sliding indicator required (a
  simple active-state is enough).

## Architecture

The data is already split (`components[]` / `docs[]`). The change is desktop IA:
a `mode` field, a toggle component, and a `buildTree` that takes the mode.

### A. Selection state + IPC

`ActiveSelection` (`apps/desktop/electron/types.ts`) gains:

```ts
/** Which sidebar tree is active. Design System = components[]; Docs = docs[]. */
mode: "design" | "docs";
```

- `store.ts` default selection: `mode: "design"`.
- New IPC `preview:setMode`:
  ```ts
  "preview:setMode": (mode: "design" | "docs") => void;
  ```
  Handler patches `{ mode }` and broadcasts. It does NOT touch
  componentId/storyId/pageId/docsComponentId (decision 7).

### B. Auto-default (ipc `fetchManifest`)

After `manifest`/`docs` are fetched and selection reconciled, apply a mode
default: if `selection.mode === "docs"` and `docs.length === 0` and
`manifest.length > 0` → patch `mode: "design"`; symmetric for the empty-design
case. Only flips away from an *empty* mode; never overrides a mode that has
content. Runs in the same place as `reconcileSelection`.

### C. `buildTree` takes the mode

`buildTree(manifest, docs, mode)` returns only the active mode's nodes:

- `mode === "design"` → today's component projection (components only).
- `mode === "docs"` → the doc projection (docs only).

This *removes* the current merge (docs no longer appear among components). The
existing `Entry`-union plumbing collapses back to per-mode building: a small
internal `buildComponentNodes(components)` and `buildDocNodes(docs)` sharing the
section/folder machinery. The sidebar call site becomes
`buildTree(state.manifest, state.docs, state.selection.mode)`.

### D. Mode toggle component

New `apps/desktop/src/components/sidebar/mode-tabs.tsx`:

```ts
export function ModeTabs({
  mode,
  onSelect,
}: {
  mode: "design" | "docs";
  onSelect: (mode: "design" | "docs") => void;
}): JSX.Element;
```

- A segmented pill: a `rounded-lg border border-border bg-card` container with
  two equal-width tab buttons (`design`, `docs`). Active tab gets a raised inner
  surface (`bg-foreground/[0.06]`, `text-foreground`); inactive is
  `text-muted-foreground`. Each tab = icon + label.
  - Design System: `DashboardSquare01Icon`, label "Design System".
  - Docs: `File01Icon`, label "Docs".
- Click → `onSelect(mode)`. `role="tablist"` / `role="tab"` + `aria-selected`
  for a11y; left/right arrow keys move between tabs.
- Rendered in `sidebar.tsx` directly under `<RepoSwitcher>`, wired to
  `api.invoke("preview:setMode", m)`. Hidden if there are no projects (nothing
  to scope).

### E. Empty states (`sidebar.tsx`)

The tree body branches on mode when `nodes.length === 0`:

- `docs` mode empty → "Drop a `*.stories.md` to document a feature."
- `design` mode empty → existing "No stories found in openstory.config.ts."

The existing "Add a repository…" state (no projects) is unchanged and wins
first.

## Touch-points

| Layer | File | Change |
|-------|------|--------|
| Selection type | `apps/desktop/electron/types.ts` | `ActiveSelection.mode`; `IpcInvoke["preview:setMode"]` |
| Store default | `apps/desktop/electron/store.ts` | `mode: "design"` in default selection |
| IPC | `apps/desktop/electron/ipc.ts` | `preview:setMode` handler; auto-default mode in `fetchManifest` |
| Tree | `apps/desktop/src/components/sidebar/build-tree.ts` | `buildTree(manifest, docs, mode)` — per-mode projection (drop the merge) |
| Tree tests | `apps/desktop/src/components/sidebar/build-tree.test.ts` | mode-scoped projection tests |
| Toggle | `apps/desktop/src/components/sidebar/mode-tabs.tsx` (new) | the segmented pill |
| Sidebar | `apps/desktop/src/components/sidebar.tsx` | render `ModeTabs`; pass `mode` to `buildTree`; mode-aware empty state |

## Testing

- **build-tree** (`build-tree.test.ts`): `mode:"design"` yields only component
  nodes (no `page` leaves), `mode:"docs"` yields only `page` leaves grouped by
  frontmatter `group`; an empty active set returns `[]`; existing component-tree
  tests pass when called with `mode:"design"`.
- **ipc / selection**: `preview:setMode` patches mode without disturbing
  story/page selection; auto-default flips an empty active mode to the populated
  one and never overrides a populated mode (unit-test the default helper).
- **mode-tabs**: pure render not unit-tested (consistent with repo's
  presentational components — verified in the e2e run); keyboard + aria asserted
  manually.
- **e2e (manual)**: toggle swaps the tree; component "Documentation" appears
  only in Design System; a docs-only project opens in Docs; empty Docs shows the
  hint.

## Risks

- **`buildTree` signature churn** — it currently takes `(manifest, docs)`; adding
  `mode` touches the one sidebar call site and the tests. Contained; the
  per-mode split actually simplifies the `Entry`-union code added for docs.
- **Stale selection across modes** — selecting a story, switching to Docs, the
  story stays rendered while the tree shows docs. Intended (decision 7); the
  tree simply highlights nothing until a doc is picked.
- **Mode persistence vs. content** — a persisted `docs` mode for a project that
  later loses all docs would show an empty tree; the auto-default (B) corrects
  it on the next manifest load.
