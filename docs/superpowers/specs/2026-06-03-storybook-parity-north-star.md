# Storybook Parity — North Star

> **Living doc.** This is the index we return to all week. Each UI area below has a
> Storybook reference, our current state, the north state we're aiming for, and a
> gap list. As an area enters its own spec→plan→build cycle, link its sub-spec here
> and flip its status on the board.

Date started: 2026-06-03

---

## Vision

OpenStory becomes a **general-purpose component workbench** with the UI quality of
Storybook. Full Storybook parity is the bar: a real docs/autodocs surface, a nested
component→story tree, a light-default theme with a dark toggle, typed controls, and a
proper canvas editor toolbar.

The **social-platform overlay + pixel-comparison** capability that defines OpenStory
today does not go away — it becomes **one feature among many** (one viewport/background
mode, one inspector tab) rather than the product's whole identity.

What "better than Storybook" means for us: same craft, plus the native desktop shell
(frameless window, command palette, detached preview) and the overlay/diff superpower
that web Storybook can't do.

---

## Status board

| # | Area | Status | Sub-spec |
|---|------|--------|----------|
| 1 | Design tokens + light/dark theme | `not-started` | — |
| 2 | Sidebar + navigation tree | `not-started` | — |
| 3 | View model / top nav (Canvas ↔ Docs, addon tabs) | `not-started` | — |
| 4 | Controls panel (typed controls + args table) | `not-started` | — |
| 5 | Canvas toolbar / editor | `not-started` | — |
| 6 | Docs view (autodocs) | `not-started` | — |

Status values: `not-started` → `in-progress` → `done`.

---

## Reference & asset conventions

- **Screenshots** live in `docs/superpowers/assets/storybook-parity/`.
  - `current-app-*.png` — our app today.
  - `storybook-*.png` — Storybook reference shots.
  - `north-*.png` — mockups of our target (added per area as we design it).
- **Storybook source** is studied via [`opensrc`](https://github.com/storybookjs/storybook):
  ```bash
  npx opensrc fetch storybookjs/storybook   # clones the `next` branch into the global cache
  npx opensrc path storybookjs/storybook    # prints the local path to read from
  ```
  Code references below link to `github.com/storybookjs/storybook/tree/next/...`.
  When an area gets its own spec, do the **deep code study** then: read the linked
  files from the `opensrc` cache and write implementation notes into that sub-spec.

### Our relevant source (today)

| Concern | File |
|---------|------|
| App shell / layout | `apps/desktop/src/views/main-app.tsx` |
| Left sidebar (repos) | `apps/desktop/src/components/sidebar.tsx` |
| Top toolbar | `apps/desktop/src/components/toolbar.tsx` |
| Right panel (presets + controls) | `apps/desktop/src/components/right-panel.tsx` |
| Titlebar | `apps/desktop/src/components/titlebar.tsx` |
| Command palette | `apps/desktop/src/components/command-palette.tsx` |
| Design tokens / CSS | `apps/desktop/src/styles.css` |
| UI primitives | `apps/desktop/src/components/ui/` |
| Authoring API (`defineStories`) | `packages/config/` |
| Platform viewports | `packages/platforms/` |

---

## Decomposition & sequencing

Ordered by dependency — each later area leans on earlier ones. Each becomes its own
`spec → plan → build` cycle; this doc only tracks them.

1. **Theme first** — everything renders on tokens. Storybook is light-by-default with a
   toggle; we're dark-only. Get the token system + both themes right before restyling
   any surface.
2. **Sidebar + nav tree** — the structural backbone. A nested component→story tree
   replaces the flat "repositories" list and unlocks the docs/story distinction.
3. **View model / top nav** — formalize Canvas vs Docs and the addon-panel tabs. Needs
   the tree (2) to know what a "docs node" vs a "story node" is.
4. **Controls** — typed controls + args table. Independent of the canvas chrome; high
   user-visible payoff. Docs view (6) reuses this.
5. **Canvas toolbar / editor** — zoom/grid/measure/fullscreen/backgrounds/viewports.
6. **Docs view (autodocs)** — the biggest new surface. Composes the tree, the args
   table from (4), and the canvas from (5).

---

# Areas

Each section uses the same template:
**Storybook reference** · **Our current state** · **North state** · **Gap list** · **Sub-spec**.

---

## 1. Design tokens + light/dark theme

**Storybook reference**
- Light theme by default; dark theme via a toggle. Themes are a small typed object
  (color, background, typography, radii) consumed through a `ThemeProvider`.
- Source:
  - [`code/core/src/theming/create.ts`](https://github.com/storybookjs/storybook/tree/next/code/core/src/theming/create.ts) — `create()` theme factory
  - [`code/core/src/theming/themes/light.ts`](https://github.com/storybookjs/storybook/tree/next/code/core/src/theming/themes/light.ts)
  - [`code/core/src/theming/themes/dark.ts`](https://github.com/storybookjs/storybook/tree/next/code/core/src/theming/themes/dark.ts)
  - [`code/core/src/theming/base.ts`](https://github.com/storybookjs/storybook/tree/next/code/core/src/theming/base.ts) — token shape
  - [`code/core/src/theming/types.ts`](https://github.com/storybookjs/storybook/tree/next/code/core/src/theming/types.ts)

**Our current state**
- Dark-only. Tokens live as CSS variables in `apps/desktop/src/styles.css` (`bg-canvas`,
  `bg-elevated`, `border-line`, `text-neutral-*`). No theme switch. See
  `current-app-full.png`.

**North state**
- A single token contract with **two themes (light default, dark)**, switchable at
  runtime and persisted in app state. Light is the default to match Storybook's feel.
- Semantic tokens (`surface`, `surface-elevated`, `border`, `text`, `text-muted`,
  `accent`, …) so every surface restyles by swapping the theme, not editing components.
- Theme toggle lives in the titlebar/toolbar (decided in area 3).

**Gap list**
- [ ] Define semantic token set (audit current CSS vars → semantic names).
- [ ] Author light + dark token values.
- [ ] Wire a theme provider + runtime switch; persist choice in `AppStore`.
- [ ] Default to light.
- [ ] Migrate `ui/` primitives + shell surfaces off raw neutrals onto semantic tokens.

**Sub-spec:** _none yet_

---

## 2. Sidebar + navigation tree

**Storybook reference**
- A searchable, collapsible tree: top-level sections (e.g. `APPLICATION`,
  `DESIGN SYSTEM`) → components → a `Documentation` node + individual stories. Distinct
  icons per node kind (folder, component, docs page, story). Selected node highlighted.
- See `storybook-sidebar.png`, `storybook-stories-view.png`.
- Source:
  - [`sidebar/Sidebar.tsx`](https://github.com/storybookjs/storybook/tree/next/code/core/src/manager/components/sidebar/Sidebar.tsx)
  - [`sidebar/Tree.tsx`](https://github.com/storybookjs/storybook/tree/next/code/core/src/manager/components/sidebar/Tree.tsx)
  - [`sidebar/TreeNode.tsx`](https://github.com/storybookjs/storybook/tree/next/code/core/src/manager/components/sidebar/TreeNode.tsx)
  - [`sidebar/Explorer.tsx`](https://github.com/storybookjs/storybook/tree/next/code/core/src/manager/components/sidebar/Explorer.tsx) — search/filter
  - [`sidebar/Heading.tsx`](https://github.com/storybookjs/storybook/tree/next/code/core/src/manager/components/sidebar/Heading.tsx)
  - [`sidebar/IconSymbols.tsx`](https://github.com/storybookjs/storybook/tree/next/code/core/src/manager/components/sidebar/IconSymbols.tsx) — node-kind icons

**Our current state**
- Repositories render as an **accordion** under a `REPOSITORIES` heading; the active repo
  expands to a **nested group tree** already (`buildGroupTree` walks slash-delimited
  `group` paths, previews are leaves). So grouping/nesting exists.
- What's missing vs Storybook: **stories/variants are not tree nodes** — they're selected
  as preset buttons in the right panel, not as leaves under their component; there is **no
  per-component Docs node**; node kinds aren't visually differentiated by icon; search
  lives in the titlebar, separate from the sidebar. See `current-app-full.png`,
  `apps/desktop/src/components/sidebar.tsx`.

**North state**
- A nested tree: **group/section → component → (Docs node + stories)**, driven by the
  manifest. Kind icons. Collapsible groups. In-sidebar search/filter. Keyboard
  navigation. Selecting a story loads the canvas; selecting a Docs node opens the docs
  view (area 6).
- Manifest must carry the grouping + story hierarchy (ties to the existing
  `2026-06-02-general-storybook-grouping-presets` work).

**Gap list**
- [ ] Manifest model: groups → components → stories (+ implicit Docs node per component).
- [ ] Tree component with collapse state, selection, kind icons.
- [ ] In-sidebar search/filter.
- [ ] Keyboard nav (↑/↓/←/→, type-to-find).
- [ ] Decide fate of the "repositories" concept (workspace switcher vs. top-level group).

**Sub-spec:** _none yet_

---

## 3. View model / top nav (Canvas ↔ Docs, addon tabs)

**Storybook reference**
- A story node shows the **Canvas** (live render + toolbar) with an addon panel
  (`Controls`, `Interactions`, …) docked right/bottom. A Docs node shows the **Docs**
  page. The marketing chrome also frames modes (Development / Interaction testing /
  Visual testing / Documentation) — see `storybook-development-controls.png`.
- Source:
  - [`manager/components/preview/Preview.tsx`](https://github.com/storybookjs/storybook/tree/next/code/core/src/manager/components/preview/Preview.tsx)
  - [`manager/`](https://github.com/storybookjs/storybook/tree/next/code/core/src/manager) — layout, panel docking
  - [`core/src/controls/manager.tsx`](https://github.com/storybookjs/storybook/tree/next/code/core/src/controls/manager.tsx) — Controls registered as an addon panel

**Our current state**
- Top toolbar has viewport toggles + `Code` / `Inspect` / `Pop out`. The right panel is
  a single combined Presets+Controls surface toggled by `panelMode` ("inspect"). No
  Canvas/Docs split; no addon-tab model. See `apps/desktop/src/components/toolbar.tsx`,
  `right-panel.tsx`.

**North state**
- A clear **Canvas vs Docs** view, selected by node kind from the tree (area 2).
- Right (or bottom) **addon panel with tabs**: `Controls`, `Presets`, future
  `Interactions` / overlay/diff controls. Pluggable so the social-overlay tools become a
  tab, not the whole panel.
- Keep `Pop out` (detached preview) and the command palette.

**Gap list**
- [ ] Define the view-state model (selected node kind → Canvas | Docs).
- [ ] Tabbed addon panel container; migrate Presets + Controls into tabs.
- [ ] Slot the overlay/diff controls in as a tab.
- [ ] Reconcile with existing `toolbar.tsx` panel-mode logic.

**Sub-spec:** _none yet_

---

## 4. Controls panel (typed controls + args table)

**Storybook reference**
- An **args table**: row per arg with name (required marker), description, default, and a
  **typed control** — boolean toggle, color picker, radio, range slider, select, text,
  number, object/JSON editor. Reset-to-default. See `storybook-development-controls.png`.
- Source:
  - [`addons/docs/src/blocks/controls/`](https://github.com/storybookjs/storybook/tree/next/code/addons/docs/src/blocks/controls) — `Boolean.tsx`, `Color.tsx`, `Range.tsx`, `Text.tsx`, `Number.tsx`, `Object.tsx`, `options/` (radio/select/check)
  - [`addons/docs/src/blocks/components/ArgsTable/`](https://github.com/storybookjs/storybook/tree/next/code/addons/docs/src/blocks/components/ArgsTable) — the table
  - [`core/src/controls/`](https://github.com/storybookjs/storybook/tree/next/code/core/src/controls) — control registration/types

**Our current state**
- Controls in the right panel are **already typed** per control — `checkbox` (boolean),
  `number`, and `text` inputs, inferred from each control and two-way bound via
  `onSetControl` → `preview:setProps`. Presets (saved prop combos) sit above. See
  `right-panel.tsx`.
- Gaps vs Storybook: **thin coverage** (no color picker, radio, select, range slider, or
  object/JSON editor — so string enums like `size`/`theme` fall back to a text box, as in
  `current-app-full.png`); **no args-table layout** (no description / default / required
  columns); **no reset-to-default**.

**North state**
- A typed args table inferred from each story's prop schema: correct control per type,
  description + default columns, required markers, reset. Live two-way binding to
  `preview:setProps` (the existing `onSetControl` path).
- Requires the authoring API (`packages/config/`) to carry **argTypes** (type, control
  kind, description, default) — likely the largest dependency in this area.

**Gap list**
- [ ] Extend `defineStories`/manifest with `argTypes` (type + control + description + default).
- [ ] Add missing control kinds — color, radio, select, range, object (bool/number/text already exist).
- [ ] Args-table layout (name / description / default / control).
- [ ] Reset-to-default (per-arg + all).
- [ ] Wire to `onSetControl` / `preview:setProps`.

**Sub-spec:** _none yet_

---

## 5. Canvas toolbar / editor

**Storybook reference**
- Canvas toolbar: zoom in/out, reset zoom, reload/remount, grid, measure, outline,
  backgrounds, viewport sizes, fullscreen, open-in-new. See
  `storybook-development-controls.png`, `storybook-docs-view.png`.
- Source:
  - [`preview/Toolbar.tsx`](https://github.com/storybookjs/storybook/tree/next/code/core/src/manager/components/preview/Toolbar.tsx)
  - [`preview/tools/zoom.tsx`](https://github.com/storybookjs/storybook/tree/next/code/core/src/manager/components/preview/tools/zoom.tsx)
  - [`preview/tools/remount.tsx`](https://github.com/storybookjs/storybook/tree/next/code/core/src/manager/components/preview/tools/remount.tsx)
  - [`preview/Viewport.tsx`](https://github.com/storybookjs/storybook/tree/next/code/core/src/manager/components/preview/Viewport.tsx)

**Our current state**
- Toolbar has viewport toggles (`Desktop`/`Mobile`), a component chip, and
  `Code`/`Inspect`/`Pop out`. No zoom, grid, measure, outline, backgrounds, fullscreen,
  remount. See `toolbar.tsx`.

**North state**
- A real canvas editor toolbar: zoom (+/−/reset), remount/reload, grid + measure +
  outline, **backgrounds** (this is where the social-platform background becomes a
  background option), viewport sizing (our platform widths feed this), fullscreen,
  open-in-new (→ existing detached preview).

**Gap list**
- [ ] Zoom controls (canvas transform).
- [ ] Remount / reload-story.
- [ ] Grid / measure / outline overlays.
- [ ] Backgrounds menu (incl. platform chrome as a background).
- [ ] Viewport menu fed by `packages/platforms/`.
- [ ] Fullscreen; keep open-in-new → detached preview.

**Sub-spec:** _none yet_

---

## 6. Docs view (autodocs)

**Storybook reference**
- An autodocs page: **Title + Subtitle + Description** (from component/MDX), a **primary
  preview**, the **args table**, then a **Stories** section rendering each story with its
  **source**. See `storybook-docs-view.png`, `storybook-stories-view.png`.
- Source:
  - [`addons/docs/src/blocks/blocks/Docs.tsx`](https://github.com/storybookjs/storybook/tree/next/code/addons/docs/src/blocks/blocks/Docs.tsx) + [`DocsPage.tsx`](https://github.com/storybookjs/storybook/tree/next/code/addons/docs/src/blocks/blocks/DocsPage.tsx)
  - [`Title.tsx`](https://github.com/storybookjs/storybook/tree/next/code/addons/docs/src/blocks/blocks/Title.tsx) · [`Subtitle.tsx`](https://github.com/storybookjs/storybook/tree/next/code/addons/docs/src/blocks/blocks/Subtitle.tsx) · [`Description.tsx`](https://github.com/storybookjs/storybook/tree/next/code/addons/docs/src/blocks/blocks/Description.tsx)
  - [`Primary.tsx`](https://github.com/storybookjs/storybook/tree/next/code/addons/docs/src/blocks/blocks/Primary.tsx) · [`ArgTypes.tsx`](https://github.com/storybookjs/storybook/tree/next/code/addons/docs/src/blocks/blocks/ArgTypes.tsx) · [`Controls.tsx`](https://github.com/storybookjs/storybook/tree/next/code/addons/docs/src/blocks/blocks/Controls.tsx)
  - [`Stories.tsx`](https://github.com/storybookjs/storybook/tree/next/code/addons/docs/src/blocks/blocks/Stories.tsx) · [`Source.tsx`](https://github.com/storybookjs/storybook/tree/next/code/addons/docs/src/blocks/blocks/Source.tsx) · [`DocsStory.tsx`](https://github.com/storybookjs/storybook/tree/next/code/addons/docs/src/blocks/blocks/DocsStory.tsx)

**Our current state**
- **None.** OpenStory has no docs surface — only the live canvas. See
  `current-app-full.png`.

**North state**
- A Docs node per component (area 2) that renders: title + description (from config),
  primary preview, the args table (reusing area 4), and a Stories section listing each
  story with a live render + viewable source. Authored content (MDX-like or
  config-provided prose) supported.

**Gap list**
- [ ] Decide doc-content source (config field / co-located MDX / inferred).
- [ ] Title / Subtitle / Description blocks.
- [ ] Primary preview block.
- [ ] Args table block (reuse area 4).
- [ ] Stories section: render each story + show source.
- [ ] Route a Docs node from the tree to this view.

**Sub-spec:** _none yet_

---

## Appendix — capture note

Automated capture of the Electron window is blocked locally: macOS Screen Recording
permission must be granted to the launching terminal, and the Playwright MCP tool drives
a standalone browser, not the IPC-wired Electron renderer. Current-app screenshots are
added manually (e.g. `current-app-full.png`). To enable automated capture, grant Screen
Recording permission and use Playwright's `_electron` API.
