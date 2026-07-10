# Titlebar Repository Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a titlebar breadcrumb of repository and working mode while keeping the inspector toggle as the outermost right-side control.

**Architecture:** `Titlebar` receives the existing `AppState` and `Api`, renders `RepoSwitcher / ModeSwitcher` beside the left-sidebar toggle, and keeps Settings before the Inspector control. `Sidebar` retains only the contextual tree. Both pickers reuse the existing Base UI menu behavior and progressively collapse visible labels without changing accessible names or popup widths.

**Tech Stack:** React 19, TypeScript 5.9, Tailwind CSS 4, Base UI Menu, Vitest 4, Electron Playwright smoke verification.

## Global Constraints

- Preserve all repository add, remove, select, loading-marker, and menu behavior.
- Keep the centered 340px command trigger clear of both titlebar control groups at the 720px Electron minimum width.
- Left control order is sidebar toggle, then repository picker.
- Repository and mode are separated by a muted literal `/` breadcrumb marker.
- Mode follows repository and moves out of the sidebar.
- Right control order is settings, then inspector toggle.
- The repository trigger collapses to its monogram/icon below 960px while retaining an explicit accessible label and title.
- The repository popup uses a stable fixed width rather than the compact trigger width.
- The mode trigger collapses to its active icon at 1280px and below; its explanatory popup remains fixed-width.
- Remove both context pickers from the sidebar; preserve tree behavior unchanged.
- Work in the current dirty `staging` checkout without staging or committing unrelated changes.

---

### Task 1: Re-home repository context in the titlebar

**Files:**

- Create: `apps/desktop/src/components/titlebar.test.ts`
- Create: `apps/desktop/src/components/repo-switcher.tsx`
- Delete: `apps/desktop/src/components/sidebar/repo-switcher.tsx`
- Modify: `apps/desktop/src/components/titlebar.tsx`
- Modify: `apps/desktop/src/components/sidebar.tsx`
- Modify: `apps/desktop/src/views/main-app.tsx`

**Interfaces:**

- `TitlebarProps` consumes `state: AppState` and `api: Api` in addition to the existing panel state/actions.
- `RepoSwitcher({ state, api })` preserves the existing menu actions and produces a responsive titlebar trigger.

- [ ] **Step 1: Add a failing titlebar rendering test**

  Render `Titlebar` to static markup with one active repository and assert the DOM order `Hide sidebar` before `Switch repository: app`, and `Settings` before `Hide inspector`.

- [ ] **Step 2: Run the focused test and verify RED**

  Run: `pnpm -F openstory-desktop exec vitest run src/components/titlebar.test.ts`

  Expected: failure because the titlebar has no repository control and Settings currently follows Inspector.

- [ ] **Step 3: Move and adapt `RepoSwitcher`**

  Move it to `components/repo-switcher.tsx`, preserve its Base UI actions, add the explicit accessible name/title, hide visible name and chevron below 960px, and give its popup a fixed `w-64` width.

- [ ] **Step 4: Update shell ownership and ordering**

  Pass `state` and `api` from `MainApp` to `Titlebar`, render the repository picker after the left toggle, remove it from `Sidebar`, and order the right cluster as Settings then Inspector.

- [ ] **Step 5: Run focused verification**

  Run: `pnpm -F openstory-desktop exec vitest run src/components/titlebar.test.ts src/components/sidebar.test.ts src/views/main-app.test.ts && pnpm -F openstory-desktop typecheck`

  Expected: all focused tests pass and TypeScript reports no errors.

- [ ] **Step 6: Run full gates and Electron smoke verification**

  Run: `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build`. Then verify wide and 720px titlebar ordering, responsive picker visibility, menu behavior, and lack of overlap in the built Electron renderer.

### Task 2: Promote working mode into the titlebar breadcrumb

This task starts from the completed context-first shell slice, where
`sidebar/mode-tabs.tsx` has already been replaced by
`sidebar/mode-switcher.tsx` and its focused test.

**Files:**

- Move: `apps/desktop/src/components/sidebar/mode-switcher.tsx` → `apps/desktop/src/components/mode-switcher.tsx`
- Move: `apps/desktop/src/components/sidebar/mode-switcher.test.ts` → `apps/desktop/src/components/mode-switcher.test.ts`
- Modify: `apps/desktop/src/components/titlebar.tsx`
- Modify: `apps/desktop/src/components/titlebar.test.ts`
- Modify: `apps/desktop/src/components/sidebar.tsx`

**Interfaces:**

- `ModeSwitcher({ mode, onSelect })` preserves the existing descriptor and radio-menu contract while exposing a responsive titlebar trigger.
- `Titlebar` derives the controlled mode from `state.selection.mode` and writes through the existing `preview:setMode` IPC.

- [ ] **Step 1: Extend the titlebar ordering test and verify RED**

  Assert that `Switch mode: Design System` follows the repository picker and precedes Settings. Run `pnpm -F openstory-desktop exec vitest run src/components/titlebar.test.ts`; expect failure because mode is still sidebar-owned.

- [ ] **Step 2: Move and adapt `ModeSwitcher`**

  Move it to the shared component root, add the explicit label/title, use a fixed `w-64` popup, and hide only its visible label/chevron at 1280px and below.

- [ ] **Step 3: Compose the titlebar breadcrumb**

  Render a muted `/` between repository and mode, wire `preview:setMode`, remove the mode switcher from `Sidebar`, and retain existing mode selection behavior.

- [ ] **Step 4: Run verification**

  Run focused tests and desktop typecheck, then the four repository gates. Smoke-test full breadcrumb presentation above 1280px, progressive collapse at 1100px, both-icon layout at 720px, both menus, and search/control-group non-overlap.
