# Context-first workbench shell

**Date:** 2026-07-10
**Status:** Approved design
**Scope:** Desktop manager shell navigation and panel ownership

## Problem

OpenStory currently presents the repository switcher and a two-tab
Design System/Docs control inside the left sidebar. The titlebar contains one
panel button, but that button controls the right inspector even though its state
is named `sidebarOpen`. The left sidebar itself cannot be collapsed.

That layout works for a small Storybook-style surface, but it does not establish
the durable workbench model OpenStory needs. As OpenStory gains viewports,
interactions, tests, accessibility checks, console output, and other developer
capabilities, those capabilities must not become unrelated top-level modes that
make the user leave the component or document they are working on.

The shell needs to keep the selected development context stable while tools act
as lenses around it.

## Product principle

OpenStory is context-first, not tool-first.

The primary user loop is:

1. Find a component, story, or document.
2. Render and edit it.
3. Inspect it through controls, source, viewports, tests, and accessibility.
4. Observe HMR and diagnostics.
5. Update the related documentation.

Selecting a tool must not discard or replace the selected component. Only
genuinely different content universes belong in the top-level mode switcher.

## Information architecture

The stable desktop layout is:

```text
┌──────────────┬──────────────────────────────────┬───────────────┐
│ Left sidebar │ Center                           │ Right sidebar │
│              │ ┌──────────────────────────────┐ │               │
│ Mode         │ │ Contextual header            │ │ Inspector     │
│ Repository   │ ├──────────────────────────────┤ │               │
│ Explorer     │ │                              │ │ Controls      │
│              │ │ Main work surface            │ │ Code          │
│              │ │                              │ │ Tests         │
│              │ │ Canvas / docs / multiview    │ │ Accessibility │
│              │ │                              │ │ Metadata      │
│              │ └──────────────────────────────┘ │               │
└──────────────┴──────────────────────────────────┴───────────────┘
```

The center owns both its contextual header and its main work surface. The left
and right sidebars are independent siblings around it.

## Decisions

### 1. The mode switcher replaces the current tabs

Replace the current `ModeTabs` segmented control with one menu-style mode
switcher at the top of the left sidebar.

Initial modes:

| Mode | Description | Existing state |
| --- | --- | --- |
| **Design System** | Browse components and stories | `selection.mode === "design"` |
| **Documentation** | Browse project documentation | `selection.mode === "docs"` |

The trigger shows the active mode's icon and label plus a downward chevron. The
menu shows both the label and description, and marks the selected entry with a
check. It uses the repository's existing Base UI-backed `Menu` primitive and
supports normal keyboard navigation.

The switcher is intentionally a local descriptor list, not a new public plugin
API. Its shape should be straightforward to extend later, but this change does
not introduce a tool registry.

### 2. Capabilities remain inside the selected context

The following do **not** become top-level modes:

- Viewports
- Controls
- Source/code
- Tests and interactions
- Accessibility
- Measurement, grid, and outline

These are capabilities of the selected component or story. Canvas-affecting
capabilities belong in the center header; inspection capabilities belong in the
right sidebar.

Console, network, HMR diagnostics, and test-run output may later use a bottom
panel because they are streams shared across contexts. A bottom panel is outside
this implementation.

### 3. The left and right sidebars have independent controls

The titlebar gains a dedicated left-sidebar toggle on its left side, immediately
after the macOS traffic-light safe area. It remains visible when the sidebar is
closed, so the sidebar can always be restored.

The existing top-right panel toggle remains and is explicitly treated as the
right-inspector toggle. Rename local state and accessibility labels so ownership
is unambiguous:

- `leftSidebarOpen` controls the repository/mode explorer.
- `inspectorOpen` controls the right `RightPanel`.

The two controls never change each other's state.

### 4. The left sidebar collapses without remounting the preview

The left sidebar is a layout sibling of the center, not an overlay. Closing it
transitions its reserved width from 268px to 0 and translates/fades the inner
sidebar surface. The center expands into the released width.

The preview iframe remains mounted throughout the transition. Sidebar state
must not change the iframe `src`, selection, HMR connection, content-size state,
zoom, addons, or right-inspector state.

Use a short, restrained transition (approximately 180-200ms) and disable the
transition under `prefers-reduced-motion`.

### 5. The sidebar hierarchy is mode, repository, explorer

When open, the left sidebar content order is:

1. Mode switcher
2. Repository switcher
3. Contextual tree

The mode switcher is the strongest control. The repository switcher is visually
secondary because it changes the workspace inside the current OpenStory mode.
The existing tree behavior, selection semantics, loading state, keyboard
navigation, and expansion persistence remain unchanged.

### 6. The center remains the work surface

The center retains the existing toolbar/header and canvas. This change does not
move viewport, zoom, layout, addon, reload, or pop-out controls.

Future center-header work may make those controls more contextual, but this
implementation only establishes correct shell ownership and independent panel
behavior.

### 7. The right sidebar remains contextual inspection

The right sidebar continues to show controls and code for a selected story and
to close for documentation where those controls do not apply. Its existing
animated/instant close behavior remains intact.

Future inspector tabs may include Tests, Accessibility, and Metadata. Those
future tabs must retain the same selected story and must not become top-level
application modes.

## Component changes

### `Titlebar`

Accept separate left-sidebar and inspector state/actions:

```ts
type TitlebarProps = {
  onOpenPalette: () => void;
  leftSidebarOpen: boolean;
  onToggleLeftSidebar: () => void;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
};
```

Placement:

- Left: macOS safe area, then left-sidebar toggle.
- Center: existing command/search trigger.
- Right: inspector toggle and settings.

Labels use explicit nouns: `Hide sidebar` / `Show sidebar` and
`Hide inspector` / `Show inspector`.

### `ModeSwitcher`

Replace `components/sidebar/mode-tabs.tsx` with a menu-based component. The file
may be renamed to `mode-switcher.tsx`; consumers must not retain both controls.

The component receives the existing mode and callback:

```ts
type Mode = "design" | "docs";

type ModeSwitcherProps = {
  mode: Mode;
  onSelect: (mode: Mode) => void;
};
```

Selecting the already-active mode closes the menu without producing redundant
state work.

### `Sidebar`

The sidebar receives `isOpen` or is wrapped by a focused `SidebarShell`. The
shell owns width, translation, opacity, overflow, and reduced-motion behavior;
the existing `Sidebar` continues to own repository and tree interactions.

Remove `ModeTabs`. Render `ModeSwitcher` above `RepoSwitcher`.

### `MainApp`

Replace the ambiguous `sidebarOpen` state with two independent states:

```ts
const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
const [inspectorOpen, setInspectorOpen] = useState(true);
```

`rightPanelOpen` continues to combine the user's inspector preference with the
current selection context:

```ts
const rightPanelOpen = Boolean(component) && inspectorOpen && !docsActive;
```

The left-sidebar state only affects the sidebar shell.

## Visual direction

The reference screenshot supplies interaction hierarchy, not a surface to copy.
OpenStory keeps its existing neutral developer-tool palette, semantic tokens,
compact type scale, rounded sidebar surface, and Base UI menus.

The signature element is the mode switcher: a compact, confident control whose
expanded menu explains the two working contexts in plain language. Surrounding
chrome stays quiet so the rendered project remains the visual focus.

## Accessibility

- Both panel toggles are native buttons with explicit labels and titles.
- The mode switcher uses the existing accessible menu primitives.
- The selected mode exposes a visual check and the menu's selected semantics.
- Keyboard users can open the menu, move between modes, select one, and dismiss
  with Escape.
- Focus must not be trapped in a sidebar as it closes. If focus is inside the
  sidebar when it closes, return focus to the left-sidebar toggle.
- Reduced-motion users receive an immediate layout change.

## Testing

Follow the repository's existing focused-test style.

1. Add a pure sidebar-shell state test proving open and closed widths/transforms.
2. Add a `MainApp` shell-state test proving left-sidebar and inspector state are
   independent.
3. Add a mode descriptor/switcher test proving the active label and descriptions
   map to `design` and `docs` correctly.
4. Preserve existing sidebar loading, tree, selection, right-panel, and harness
   bridge tests.
5. Run the full repository gates: `pnpm typecheck`, `pnpm test`, `pnpm lint`, and
   `pnpm build`.
6. Perform a desktop visual smoke check at both open and closed sidebar states,
   including narrow-window overlap around the centered command trigger.

## Non-goals

- A public tool/addon registry.
- New Tests or Accessibility implementations.
- A bottom diagnostics panel.
- Changing the manifest, runtime bridge, MCP tools, or Vite plugin.
- Persisting panel open/closed state across launches.
- Changing repository selection or tree information architecture.
- Redesigning the center toolbar or right-panel content.
- Implementing the browser manager in the same change.

## Rollout

1. Characterize independent left/right panel state with failing tests.
2. Split `MainApp` panel state and update `Titlebar` ownership.
3. Add the left-sidebar shell and transition.
4. Replace `ModeTabs` with `ModeSwitcher` and reposition the repository switcher.
5. Run focused tests, then full verification.
6. Visually verify open/closed sidebar, mode switching, inspector independence,
   keyboard behavior, and the stable preview iframe.
