# Context-first Workbench Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the desktop manager context-first by giving its left explorer and right inspector independent ownership, adding a collapsible left shell, and replacing sidebar tabs with an explanatory mode menu.

**Architecture:** `MainApp` owns independent `leftSidebarOpen` and `inspectorOpen` preferences. A focused `SidebarShell` keeps the explorer mounted while reserving either 268px or 0px, and `ModeSwitcher` maps the existing `design`/`docs` selection to local menu descriptors without introducing a registry.

**Tech Stack:** React 19, TypeScript 5.9, Tailwind CSS 4, Base UI Menu, Vitest 4, Electron Vite.

## Global Constraints

- Keep the selected component, story, or document stable while panel controls change.
- `leftSidebarOpen` controls only the repository/mode explorer; `inspectorOpen` controls only `RightPanel`.
- Keep the preview iframe mounted and do not change its `src`, selection, HMR connection, content-size state, zoom, addons, or inspector preference when the left sidebar changes.
- Use the existing Base UI-backed `Menu` primitive; do not add a public tool or addon registry.
- Preserve existing tree loading, selection, keyboard navigation, expansion persistence, toolbar controls, and right-panel behavior.
- The sidebar reserves 268px when open and 0px when closed; its surface translates and fades while remaining mounted.
- Use a 190ms `ease-in-out` transition and disable it under `prefers-reduced-motion`.
- Use explicit labels: `Hide sidebar` / `Show sidebar` and `Hide inspector` / `Show inspector`.
- If focus is inside the sidebar when it closes, return focus to the left-sidebar toggle.
- Work in the current dirty `staging` checkout without resetting, staging, or committing unrelated existing changes.

---

### Task 1: Independent panel ownership and collapsible sidebar shell

**Files:**
- Modify: `apps/desktop/src/views/main-app.test.ts`
- Modify: `apps/desktop/src/views/main-app.tsx`
- Modify: `apps/desktop/src/components/sidebar.test.ts`
- Modify: `apps/desktop/src/components/sidebar.tsx`
- Modify: `apps/desktop/src/components/titlebar.tsx`
- Modify: `apps/desktop/src/components/icons/animated-panel.tsx`
- Modify: `apps/desktop/src/styles.css`

**Interfaces:**
- Produces: `sidebarShellSnapshot(isOpen)` with `{ width, transform, opacity }`.
- Produces: `mainAppShellSnapshot({ hasComponent, docsActive, leftSidebarOpen, inspectorOpen })` with independent `leftSidebarOpen` and derived `rightPanelOpen`.
- Produces: `TitlebarProps` with `leftSidebarOpen`, `onToggleLeftSidebar`, `inspectorOpen`, and `onToggleInspector`.

- [ ] **Step 1: Add failing pure state tests**

  Extend the existing focused tests to assert 268px/0px sidebar widths, open/closed transforms and opacity, and all combinations that prove toggling either panel leaves the other panel's state unchanged.

- [ ] **Step 2: Run the focused tests and verify RED**

  Run: `pnpm -F openstory-desktop exec vitest run src/components/sidebar.test.ts src/views/main-app.test.ts`

  Expected: failure because the new snapshots and independent state do not exist.

- [ ] **Step 3: Implement the minimal shell ownership split**

  Add the two independent `useState(true)` preferences in `MainApp`, derive `rightPanelOpen` only from component context, docs context, and `inspectorOpen`, wire separate titlebar controls, and wrap `Sidebar` in a permanently mounted `SidebarShell` whose layout width and surface transform/opacity come from `sidebarShellSnapshot`.

- [ ] **Step 4: Implement focus restoration and motion styling**

  Give the left toggle a stable focus target, return focus to it when a close occurs while focus is inside the sidebar, use a 190ms ease-in-out shell transition, and add a `prefers-reduced-motion: reduce` rule that removes the transition.

- [ ] **Step 5: Run focused tests and typecheck**

  Run: `pnpm -F openstory-desktop exec vitest run src/components/sidebar.test.ts src/views/main-app.test.ts && pnpm -F openstory-desktop typecheck`

  Expected: all focused tests pass and TypeScript reports no errors.

### Task 2: Explanatory Base UI mode switcher and sidebar hierarchy

**Files:**
- Delete: `apps/desktop/src/components/sidebar/mode-tabs.tsx`
- Create: `apps/desktop/src/components/sidebar/mode-switcher.tsx`
- Create: `apps/desktop/src/components/sidebar/mode-switcher.test.ts`
- Modify: `apps/desktop/src/components/sidebar.tsx`

**Interfaces:**
- Consumes: existing `Menu`, `MenuTrigger`, `MenuContent`, `MenuItem`, and `MenuItemCheck` primitives.
- Produces: `ModeSwitcher({ mode, onSelect })` and immutable descriptors for `design` (`Design System`, `Browse components and stories`) and `docs` (`Documentation`, `Browse project documentation`).

- [ ] **Step 1: Add a failing descriptor test**

  Assert that `design` and `docs` resolve to the exact active labels, descriptions, and icons, and that the descriptor order is Design System then Documentation.

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `pnpm -F openstory-desktop exec vitest run src/components/sidebar/mode-switcher.test.ts`

  Expected: failure because `mode-switcher.tsx` does not exist.

- [ ] **Step 3: Implement `ModeSwitcher`**

  Use the existing Base UI menu primitives. The trigger shows active icon, full label, and down chevron. Each item shows icon, label, description, and selected check semantics; clicking the active item only closes the menu and does not call `onSelect`.

- [ ] **Step 4: Reorder sidebar content and remove tabs**

  Render `ModeSwitcher` above `RepoSwitcher`, retain the current contextual tree behavior, delete `mode-tabs.tsx`, and ensure no consumer still references `ModeTabs`.

- [ ] **Step 5: Run focused tests and typecheck**

  Run: `pnpm -F openstory-desktop exec vitest run src/components/sidebar/mode-switcher.test.ts src/components/sidebar.test.ts && pnpm -F openstory-desktop typecheck`

  Expected: focused tests and TypeScript pass.

### Task 3: Integration, regression, and visual verification

**Files:**
- Modify only if verification exposes a spec-scoped defect in the files above.

**Interfaces:**
- Consumes: completed independent shell, titlebar ownership, and mode switcher.
- Produces: verification evidence for the approved design and unchanged preview lifecycle.

- [ ] **Step 1: Review the integrated source against every spec requirement**

  Confirm explicit labels, independent state, mode/repository/tree order, selected semantics, focus handling, reduced motion, and a single stable iframe element.

- [ ] **Step 2: Run desktop-focused regression tests**

  Run: `pnpm -F openstory-desktop test`

  Expected: all desktop tests pass with no warnings or failures.

- [ ] **Step 3: Run full repository gates**

  Run separately and inspect each exit code: `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build`.

  Expected: all four commands exit 0.

- [ ] **Step 4: Perform desktop visual smoke checks**

  Verify open and closed left-sidebar states, mode switching, inspector independence, keyboard menu behavior, focus restoration, stable iframe mounting, and narrow-window behavior around the centered command trigger. Capture any environment limitation explicitly rather than treating an unperformed check as passing.
