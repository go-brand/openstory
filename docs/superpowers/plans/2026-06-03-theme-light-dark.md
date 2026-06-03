# Light/Dark Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give OpenStory a semantic, theme-swappable token system with two themes (light default, dark), switchable from a base-ui settings menu in the titlebar, persisted in the electron store, and synced across both app windows.

**Architecture:** Port the sibling app's two-layer Tailwind v4 token system (raw vars under `:root`/`.dark` + an `@theme inline` mapping layer). Persist the chosen theme as a `theme` field on the electron-store-backed `AppStore`; broadcast it through the existing `buildAppState`/`state:update` IPC path so both the main and detached windows re-theme together. A renderer `ThemeProvider` toggles the `dark` class on `<html>`; a base-ui `Menu` with a `Theme ▸` submenu drives `setTheme` via a new `theme:set` IPC.

**Tech Stack:** Electron, React 19, Tailwind CSS v4 (`@tailwindcss/vite`), electron-store, `@base-ui/react`, Playwright (e2e).

> **Reference sources** (read-only, in `~/Desktop/tanstack-start`): token system `tooling/tailwind/src/style.css`; menu primitive `packages/ui/src/base-menu.tsx`; submenu usage `apps/app/src/components/account-menu.tsx`. Spec: `docs/superpowers/specs/2026-06-03-theme-light-dark-design.md`.

> **Testing note:** This app's only test runner is Playwright e2e (`pnpm --filter @gobrand/openstory-desktop test:e2e`, smoke tests in `apps/desktop/tests/smoke.test.ts`). There is no unit runner. Verification gates per task are `typecheck`, `build`, and (where UI is involved) e2e. All commands below assume cwd `apps/desktop` unless noted; the package name is `@gobrand/openstory-desktop` (confirm with `node -p "require('./apps/desktop/package.json').name"` if needed).

---

## Token vocabulary (decided)

Ported semantic names, **plus** OpenStory keeps its blue as a distinct `brand` token (the ported `accent` is a *neutral hover surface*, not the brand color — do not conflate them):

| Token | Role | Light | Dark (from current OpenStory palette) |
|-------|------|-------|----------------------------------------|
| `background` | app canvas | `oklch(1 0 0)` | `#09090b` (was `canvas`) |
| `background-1/2/3` | layered fills | `oklch(0.97/0.995/0.98 0 0)` | `#0c0c0e` / `#141417` / `#1b1b1f` |
| `foreground` | primary text | `oklch(0.145 0 0)` | `#f5f5f5` |
| `card` / `card-foreground` | elevated surface | `oklch(1 0 0)` / `oklch(0.145 0 0)` | `#141417` (was `elevated`) / `#f5f5f5` |
| `popover` / `popover-foreground` | menus, popovers | `oklch(1 0 0)` / `oklch(0.145 0 0)` | `#1b1b1f` (was `elevated-2`) / `#f5f5f5` |
| `muted` / `muted-foreground` | recessed fill / dim text | `oklch(0.97 0 0)` / `oklch(0.556 0 0)` | `#1b1b1f` / `oklch(0.708 0 0)` |
| `accent` / `accent-foreground` | **neutral** hover/active surface | `oklch(0.95 0 0)` / `oklch(0.205 0 0)` | `#1b1b1f` / `#f5f5f5` |
| `primary` / `primary-foreground` | high-contrast button | `oklch(0.205 0 0)` / `oklch(0.985 0 0)` | `#f5f5f5` / `#141417` |
| `secondary` / `secondary-foreground` | low-contrast button | `oklch(0.97 0 0)` / `oklch(0.205 0 0)` | `#141417` / `#f5f5f5` |
| `border` | hairline border | `oklch(0.922 0 0)` | `oklch(1 0 0 / 0.06)` (was `line`) |
| `input` | stronger border | `oklch(0.922 0 0)` | `oklch(1 0 0 / 0.1)` (was `line-strong`) |
| `ring` | focus ring | `oklch(0.708 0 0)` | `oklch(1 0 0 / 0.2)` |
| `sidebar` / `-foreground` / `-active` / `-active-foreground` / `-border` / `-ring` | left chrome | `0.985`/`0.145`/`0.93`/`0.205`/`0.922`/`0.708` (oklch n 0 0) | `#0c0c0e` (was `panel`) / `#f5f5f5` / `#1b1b1f` / `#f5f5f5` / `oklch(1 0 0 / 0.06)` / `oklch(1 0 0 / 0.2)` |
| `brand` / `brand-soft` | OpenStory blue accent | `#3b82f6` / `oklch(0.62 0.19 256 / 0.14)` | same |
| `success` / `success-soft` | positive | `oklch(0.55 0.15 145)` / `oklch(0.72 0.17 153 / 0.14)` | `#22c55e` / `oklch(0.72 0.17 153 / 0.14)` |
| `destructive` | error text/icon | `oklch(0.577 0.25 27.325)` | `oklch(0.7 0.24 23.51)` |
| `radius` | corner radius | `0.625rem` | `0.625rem` |

---

## File structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/desktop/package.json` | modify | add `@base-ui/react` dependency |
| `apps/desktop/src/styles.css` | rewrite | token contract: light `:root` + `.dark` raw vars, `@theme inline` mapping, `dark` variant, tokenized `body`/scrollbars |
| `apps/desktop/electron/store.ts` | modify | `theme` persisted field + `setTheme` + nested default |
| `apps/desktop/electron/types.ts` | modify | `Theme` type, `AppState.theme`, `IpcInvoke["theme:set"]` |
| `apps/desktop/electron/ipc.ts` | modify | surface `theme` in `buildAppState`, register `theme:set` handler |
| `apps/desktop/src/components/theme-provider.tsx` | create | apply `dark` class to root, expose `useTheme`, call `theme:set` |
| `apps/desktop/src/components/ui/menu.tsx` | create | base-ui `Menu` primitive (trimmed port) |
| `apps/desktop/src/components/settings-menu.tsx` | create | gear trigger + `Theme ▸` submenu wiring |
| `apps/desktop/src/lib/icons.ts` | modify | add gear + submenu/check icons |
| `apps/desktop/src/components/titlebar.tsx` | modify | mount `<SettingsMenu/>` on the right |
| `apps/desktop/src/App.tsx` | modify | `FALLBACK_STATE.theme`, wrap both views in `<ThemeProvider>` |
| shell + `ui/*` (sweep) | modify | migrate off-token utilities onto semantic tokens |
| `apps/desktop/tests/smoke.test.ts` | modify | default-light + toggle-persists + cross-window e2e |

---

## Task 1: Add the base-ui dependency

**Files:**
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Add the dependency**

In `apps/desktop/package.json`, add to `"dependencies"` (alphabetical, before `class-variance-authority`):

```json
    "@base-ui/react": "1.5.0",
```

- [ ] **Step 2: Install**

Run (from repo root): `pnpm install`
Expected: lockfile updates, `@base-ui/react@1.5.0` resolved, no errors.

- [ ] **Step 3: Verify import resolves**

Run (cwd `apps/desktop`): `node -e "require.resolve('@base-ui/react/menu')" && echo OK`
Expected: `OK` (path resolves).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/package.json pnpm-lock.yaml
git commit -m "build(desktop): add @base-ui/react for theme settings menu"
```

---

## Task 2: Rewrite the token system in styles.css

**Files:**
- Rewrite: `apps/desktop/src/styles.css`

- [ ] **Step 1: Replace the whole file**

Replace the entire contents of `apps/desktop/src/styles.css` with:

```css
@import 'tailwindcss';

@custom-variant dark (&:is(.dark *, .dark));

@theme {
  --radius: 0.625rem;
}

/* ── Raw value layer ───────────────────────────────────────────────────────
   Light is the default (:root); dark overrides under .dark. Every surface
   restyles by swapping the class — components never hardcode a theme. */
:root {
  --background: oklch(1 0 0);
  --background-1: oklch(0.97 0 0);
  --background-2: oklch(0.995 0 0);
  --background-3: oklch(0.98 0 0);
  --foreground: oklch(0.145 0 0);

  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.145 0 0);

  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.95 0 0);
  --accent-foreground: oklch(0.205 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);

  --border: oklch(0.922 0 0);
  --input: oklch(0.922 0 0);
  --ring: oklch(0.708 0 0);

  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0.145 0 0);
  --sidebar-active: oklch(0.93 0 0);
  --sidebar-active-foreground: oklch(0.205 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --sidebar-ring: oklch(0.708 0 0);

  --brand: #3b82f6;
  --brand-soft: oklch(0.62 0.19 256 / 0.14);
  --success: oklch(0.55 0.15 145);
  --success-soft: oklch(0.72 0.17 153 / 0.14);
  --destructive: oklch(0.577 0.25 27.325);
}

.dark {
  --background: #09090b;
  --background-1: #0c0c0e;
  --background-2: #141417;
  --background-3: #1b1b1f;
  --foreground: #f5f5f5;

  --card: #141417;
  --card-foreground: #f5f5f5;
  --popover: #1b1b1f;
  --popover-foreground: #f5f5f5;

  --muted: #1b1b1f;
  --muted-foreground: oklch(0.708 0 0);
  --accent: #1b1b1f;
  --accent-foreground: #f5f5f5;
  --primary: #f5f5f5;
  --primary-foreground: #141417;
  --secondary: #141417;
  --secondary-foreground: #f5f5f5;

  --border: oklch(1 0 0 / 0.06);
  --input: oklch(1 0 0 / 0.1);
  --ring: oklch(1 0 0 / 0.2);

  --sidebar: #0c0c0e;
  --sidebar-foreground: #f5f5f5;
  --sidebar-active: #1b1b1f;
  --sidebar-active-foreground: #f5f5f5;
  --sidebar-border: oklch(1 0 0 / 0.06);
  --sidebar-ring: oklch(1 0 0 / 0.2);

  --brand: #3b82f6;
  --brand-soft: oklch(0.62 0.19 256 / 0.14);
  --success: #22c55e;
  --success-soft: oklch(0.72 0.17 153 / 0.14);
  --destructive: oklch(0.7 0.24 23.51);

  color-scheme: dark;
}

/* ── Mapping layer ─────────────────────────────────────────────────────────
   `inline` makes Tailwind emit var(--…) directly, so a runtime class swap
   re-resolves every color utility. */
@theme inline {
  --color-background: var(--background);
  --color-background-1: var(--background-1);
  --color-background-2: var(--background-2);
  --color-background-3: var(--background-3);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-active: var(--sidebar-active);
  --color-sidebar-active-foreground: var(--sidebar-active-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-brand: var(--brand);
  --color-brand-soft: var(--brand-soft);
  --color-success: var(--success);
  --color-success-soft: var(--success-soft);
  --color-destructive: var(--destructive);
}

html,
body,
#root {
  height: 100%;
  margin: 0;
  background: transparent;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  background-color: var(--background);
  color: var(--foreground);
}

.drag {
  -webkit-app-region: drag;
}
.no-drag {
  -webkit-app-region: no-drag;
}

/* Calm, recessed scrollbars — tokenized so they read in both themes. */
*::-webkit-scrollbar {
  width: 9px;
  height: 9px;
}
*::-webkit-scrollbar-thumb {
  background: var(--muted-foreground);
  opacity: 0.4;
  border-radius: 9999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}
*::-webkit-scrollbar-thumb:hover {
  background: var(--foreground);
  background-clip: padding-box;
}
*::-webkit-scrollbar-track {
  background: transparent;
}
```

- [ ] **Step 2: Verify the build compiles the new CSS**

Run: `pnpm --filter @gobrand/openstory-desktop build`
Expected: build succeeds; no Tailwind "unknown utility" or CSS parse errors. (Components still reference old utility names like `bg-canvas` — those produce no class yet but don't fail the build; the sweep in Task 9 fixes them. The app will look partly unstyled until then, which is expected.)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/styles.css
git commit -m "feat(desktop): semantic two-theme token system (light default + dark)"
```

---

## Task 3: Add the persisted theme field to the store

**Files:**
- Modify: `apps/desktop/electron/store.ts`

- [ ] **Step 1: Add `theme` to `PersistedState` and defaults**

In `apps/desktop/electron/store.ts`, update the `PersistedState` type — add after `overlay`:

```ts
  theme: 'light' | 'dark';
```

And in the `defaults` object, add after the `overlay: { … }` block (before `hudBounds`):

```ts
  theme: 'light',
```

- [ ] **Step 2: Add nested-default safety + a `setTheme` method**

In the constructor, after the existing `this.store.set('overlay', …)` migration block, add:

```ts
    // Backfill theme for stores written before the field existed.
    if (this.store.get('theme') == null) {
      this.store.set('theme', defaults.theme);
    }
```

Then add this method to the `AppStore` class (next to `patchSelection`):

```ts
  setTheme(theme: PersistedState['theme']): void {
    this.store.set('theme', theme);
  }
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @gobrand/openstory-desktop typecheck`
Expected: PASS (note: `AppState`/IPC changes in Task 4 are still pending, but `store.ts` alone is internally consistent and compiles).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/electron/store.ts
git commit -m "feat(desktop): persist theme preference in AppStore (default light)"
```

---

## Task 4: Thread theme through types + IPC + fallback state

**Files:**
- Modify: `apps/desktop/electron/types.ts`
- Modify: `apps/desktop/electron/ipc.ts`
- Modify: `apps/desktop/src/App.tsx`

- [ ] **Step 1: Add the `Theme` type and `AppState.theme`**

In `apps/desktop/electron/types.ts`, add near the top (after `ProjectRecord`):

```ts
export type Theme = "light" | "dark";
```

In the `AppState` type, add after `overlay: OverlayState;`:

```ts
  theme: Theme;
```

In `IpcInvoke`, add after the `"window:setAlwaysOnTop"` line:

```ts
  "theme:set": (theme: Theme) => void;
```

- [ ] **Step 2: Surface `theme` in `buildAppState`**

In `apps/desktop/electron/ipc.ts`, in `buildAppState`, add `theme: s.theme,` to the returned object (after `overlay: s.overlay,`):

```ts
  return {
    projects: s.projects,
    selection: s.selection,
    overlay: s.overlay,
    theme: s.theme,
    manifest,
    iframeUrl,
    detachedOpen,
    vite: status,
  };
```

- [ ] **Step 3: Register the `theme:set` handler**

In `apps/desktop/electron/ipc.ts`, after the `ipcMain.handle("window:setAlwaysOnTop", …)` handler, add:

```ts
  ipcMain.handle("theme:set", (_e, theme: "light" | "dark") => {
    deps.store.setTheme(theme);
    broadcastState();
  });
```

- [ ] **Step 4: Add `theme` to `FALLBACK_STATE`**

In `apps/desktop/src/App.tsx`, add to `FALLBACK_STATE` after the `overlay: { … }` block:

```ts
  theme: 'light',
```

- [ ] **Step 5: Verify typecheck**

Run: `pnpm --filter @gobrand/openstory-desktop typecheck`
Expected: PASS — `AppState`, store, IPC, and `FALLBACK_STATE` are now consistent.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/types.ts apps/desktop/electron/ipc.ts apps/desktop/src/App.tsx
git commit -m "feat(desktop): broadcast theme via AppState + theme:set IPC"
```

---

## Task 5: Theme provider (renderer)

**Files:**
- Create: `apps/desktop/src/components/theme-provider.tsx`

- [ ] **Step 1: Create the provider**

Create `apps/desktop/src/components/theme-provider.tsx`:

```tsx
import * as React from "react";
import type { Theme } from "../../electron/types";
import type { Api } from "../lib/api";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | undefined>(undefined);

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) return { theme: "light", setTheme: () => {} };
  return ctx;
}

// The store is the single source of truth for the theme. `theme` arrives as a
// prop from App.tsx (fed by AppState over IPC); setTheme writes through the
// `theme:set` IPC and the new value round-trips back via `state:update`, which
// keeps the main and detached windows in sync without local state.
export function ThemeProvider({
  theme,
  api,
  children,
}: {
  theme: Theme;
  api: Api;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const setTheme = React.useCallback(
    (next: Theme) => {
      api?.invoke("theme:set", next).catch(() => {});
    },
    [api],
  );

  const value = React.useMemo<ThemeContextValue>(
    () => ({ theme, setTheme }),
    [theme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @gobrand/openstory-desktop typecheck`
Expected: PASS. (`Api` is exported from `src/lib/api.ts` as `OpenStoryApi | undefined` — already imported the same way by `main-app.tsx` and `detached-preview.tsx`.)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/theme-provider.tsx
git commit -m "feat(desktop): ThemeProvider toggles dark class + writes theme:set"
```

---

## Task 6: base-ui menu primitive

**Files:**
- Create: `apps/desktop/src/components/ui/menu.tsx`

- [ ] **Step 1: Create the primitive**

Create `apps/desktop/src/components/ui/menu.tsx` (trimmed port of the sibling app's `base-menu.tsx`, styled on the new tokens, hugeicons instead of lucide):

```tsx
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import * as React from "react";
import { HugeiconsIcon, ArrowRight01Icon, Tick02Icon } from "../../lib/icons";
import { cn } from "../../lib/utils";

function Menu(props: React.ComponentProps<typeof MenuPrimitive.Root>) {
  return <MenuPrimitive.Root {...props} />;
}

function MenuTrigger(props: React.ComponentProps<typeof MenuPrimitive.Trigger>) {
  return <MenuPrimitive.Trigger {...props} />;
}

function MenuContent({
  className,
  children,
  align,
  side,
  sideOffset = 4,
  alignOffset = 0,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Popup> & {
  align?: MenuPrimitive.Positioner.Props["align"];
  side?: MenuPrimitive.Positioner.Props["side"];
  sideOffset?: MenuPrimitive.Positioner.Props["sideOffset"];
  alignOffset?: MenuPrimitive.Positioner.Props["alignOffset"];
}) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="z-50"
        align={align}
        side={side}
        sideOffset={sideOffset}
        alignOffset={alignOffset}
      >
        <MenuPrimitive.Popup
          {...props}
          className={cn(
            "z-50 min-w-[10rem] rounded-md border border-input bg-popover text-popover-foreground shadow-lg",
            "origin-[var(--transform-origin)] transition-[transform,scale,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
            className,
          )}
        >
          <div className="space-y-0.5 p-1">{children}</div>
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function MenuItem({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Item>) {
  return (
    <MenuPrimitive.Item
      {...props}
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-hidden transition-colors select-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
    />
  );
}

function MenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.Separator>) {
  return (
    <MenuPrimitive.Separator
      {...props}
      className={cn("-mx-1 my-1 h-px bg-border", className)}
    />
  );
}

function MenuGroup(props: React.ComponentProps<typeof MenuPrimitive.Group>) {
  return <MenuPrimitive.Group {...props} />;
}

function MenuSubmenuRoot(
  props: React.ComponentProps<typeof MenuPrimitive.SubmenuRoot>,
) {
  return <MenuPrimitive.SubmenuRoot {...props} />;
}

function MenuSubmenuTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof MenuPrimitive.SubmenuTrigger>) {
  return (
    <MenuPrimitive.SubmenuTrigger
      {...props}
      className={cn(
        "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-hidden select-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        "data-[popup-open]:bg-accent data-[popup-open]:text-accent-foreground",
        className,
      )}
    >
      {children}
      <HugeiconsIcon icon={ArrowRight01Icon} className="ms-auto size-3.5" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

// Convenience: a leading check slot for "currently selected" rows.
function MenuItemCheck({ checked }: { checked: boolean }) {
  return (
    <span className="flex size-4 items-center justify-center">
      {checked ? (
        <HugeiconsIcon icon={Tick02Icon} className="size-4 text-brand" />
      ) : null}
    </span>
  );
}

export {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuItemCheck,
  MenuSeparator,
  MenuGroup,
  MenuSubmenuRoot,
  MenuSubmenuTrigger,
};
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @gobrand/openstory-desktop typecheck`
Expected: PASS. (If `@base-ui/react/menu` subpath types differ in 1.5.0 — e.g. `Positioner.Props` namespace — adjust the prop-type references to match the installed package's exported types; the component structure stays identical.)

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/ui/menu.tsx
git commit -m "feat(desktop): base-ui Menu primitive (tokenized)"
```

---

## Task 7: Settings menu + icons + titlebar mount

**Files:**
- Modify: `apps/desktop/src/lib/icons.ts`
- Create: `apps/desktop/src/components/settings-menu.tsx`
- Modify: `apps/desktop/src/components/titlebar.tsx`

- [ ] **Step 1: Add the icons**

In `apps/desktop/src/lib/icons.ts`, add `Settings01Icon` to the `@hugeicons/core-free-icons` export list (alphabetical-ish, near the others). `ArrowRight01Icon` and `Tick02Icon` are already exported. The full export block becomes (only the additions matter):

```ts
export {
  FolderAddIcon,
  Folder01Icon,
  Layers01Icon,
  ComputerIcon,
  SmartPhone01Icon,
  LinkSquare02Icon,
  ArrowShrink02Icon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  SlidersHorizontalIcon,
  SourceCodeIcon,
  Search01Icon,
  Copy01Icon,
  Cancel01Icon,
  PackageIcon,
  Loading03Icon,
  Alert02Icon,
  Tick02Icon,
  Cursor02Icon,
  Pin02Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
export { HugeiconsIcon } from "@hugeicons/react";
```

- [ ] **Step 2: Create the settings menu**

Create `apps/desktop/src/components/settings-menu.tsx`:

```tsx
import { HugeiconsIcon, Settings01Icon } from "../lib/icons";
import {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuItemCheck,
  MenuGroup,
  MenuSubmenuRoot,
  MenuSubmenuTrigger,
} from "./ui/menu";
import { useTheme } from "./theme-provider";
import type { Theme } from "../../electron/types";

const THEME_OPTIONS: Array<{ value: Theme; label: string }> = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export function SettingsMenu() {
  const { theme, setTheme } = useTheme();
  return (
    <Menu>
      <MenuTrigger
        className="no-drag flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[popup-open]:bg-accent data-[popup-open]:text-foreground"
        aria-label="Settings"
      >
        <HugeiconsIcon icon={Settings01Icon} className="size-4" />
      </MenuTrigger>
      <MenuContent align="end" sideOffset={6} className="w-52">
        <MenuGroup>
          <MenuSubmenuRoot>
            <MenuSubmenuTrigger>
              <span className="flex-1">Theme</span>
              <span className="text-xs text-muted-foreground capitalize">{theme}</span>
            </MenuSubmenuTrigger>
            <MenuContent alignOffset={-4} className="w-40">
              {THEME_OPTIONS.map(({ value, label }) => (
                <MenuItem key={value} onClick={() => setTheme(value)}>
                  <MenuItemCheck checked={theme === value} />
                  <span>{label}</span>
                </MenuItem>
              ))}
            </MenuContent>
          </MenuSubmenuRoot>
        </MenuGroup>
      </MenuContent>
    </Menu>
  );
}
```

- [ ] **Step 3: Mount it in the titlebar**

In `apps/desktop/src/components/titlebar.tsx`, add the import at the top:

```tsx
import { SettingsMenu } from "./settings-menu";
```

Then add the settings menu at the right edge of the header. Replace the closing of the centered search block + `</header>` so the menu sits after it:

Find:
```tsx
      </div>
    </header>
```
Replace with:
```tsx
      </div>

      <div className="no-drag ml-auto flex items-center">
        <SettingsMenu />
      </div>
    </header>
```

(The header already has `pr-3`, giving the gear right-edge breathing room. `ml-auto` pushes it to the right past the absolutely-positioned centered search.)

- [ ] **Step 4: Verify typecheck + build**

Run: `pnpm --filter @gobrand/openstory-desktop typecheck && pnpm --filter @gobrand/openstory-desktop build`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/lib/icons.ts apps/desktop/src/components/settings-menu.tsx apps/desktop/src/components/titlebar.tsx
git commit -m "feat(desktop): settings menu with Theme submenu in titlebar"
```

---

## Task 8: Wire the provider into App.tsx

**Files:**
- Modify: `apps/desktop/src/App.tsx`

- [ ] **Step 1: Import the provider**

In `apps/desktop/src/App.tsx`, add after the existing view imports:

```tsx
import { ThemeProvider } from './components/theme-provider';
```

- [ ] **Step 2: Wrap both views**

Replace the final return block:

```tsx
  if (ROLE === 'detached') return <DetachedPreview state={state} api={api} />;
  return <MainApp state={state} api={api} />;
```

with:

```tsx
  return (
    <ThemeProvider theme={state.theme} api={api}>
      {ROLE === 'detached' ? (
        <DetachedPreview state={state} api={api} />
      ) : (
        <MainApp state={state} api={api} />
      )}
    </ThemeProvider>
  );
```

- [ ] **Step 3: Verify typecheck + build**

Run: `pnpm --filter @gobrand/openstory-desktop typecheck && pnpm --filter @gobrand/openstory-desktop build`
Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/App.tsx
git commit -m "feat(desktop): apply theme to both windows via ThemeProvider"
```

---

## Task 9: Token migration sweep

Migrate every off-token color utility onto the semantic tokens so light mode renders correctly. Apply the mapping table below across **all** these files:
`apps/desktop/src/components/titlebar.tsx`, `sidebar.tsx`, `toolbar.tsx`, `right-panel.tsx`, `command-palette.tsx`, `separator.tsx`, `apps/desktop/src/views/main-app.tsx`, `detached-preview.tsx`, and `apps/desktop/src/components/ui/{button,checkbox,select,badge,slider,separator}.tsx`.

**Mapping table (old utility → new utility). Replace the color part only; keep any state prefix (`hover:`, `data-[…]:`, `focus:`) and arbitrary opacity suffix.**

Surfaces:
| Old | New |
|-----|-----|
| `bg-canvas` | `bg-background` |
| `bg-panel`, `bg-panel/50` | `bg-sidebar`, `bg-sidebar/50` |
| `bg-elevated`, `bg-elevated/60` | `bg-card`, `bg-card/60` |
| `bg-neutral-950/85`, `bg-neutral-950/70` | `bg-background/85`, `bg-background/70` |
| `bg-neutral-900` | `bg-card` |
| `bg-neutral-800` | `bg-accent` |
| `bg-neutral-700/40` | `bg-accent/40` |
| `bg-neutral-100` | `bg-muted` |
| `bg-white/[0.03]` … `bg-white/[0.1]` | `bg-foreground/[0.03]` … `bg-foreground/[0.1]` (keep the exact opacity) |

Text:
| Old | New |
|-----|-----|
| `text-neutral-100`, `text-neutral-200`, `text-neutral-300` | `text-foreground` |
| `text-neutral-400`, `text-neutral-500`, `text-neutral-600` | `text-muted-foreground` |

Borders / ring:
| Old | New |
|-----|-----|
| `border-line`, `ring-line` | `border-border`, `ring-border` |
| `border-line-strong` | `border-input` |
| `border-neutral-700`, `border-neutral-300` | `border-border` |
| `border-neutral-600` | `border-input` |

Brand (OpenStory blue — was `accent`, now `brand`):
| Old | New |
|-----|-----|
| `bg-accent`, `bg-accent/90` | `bg-brand`, `bg-brand/90` |
| `bg-accent-soft` | `bg-brand-soft` |
| `text-accent` | `text-brand` |
| `ring-accent/30`, `/40`, `/50` | `ring-brand/30`, `/40`, `/50` |
| `shadow-accent/30`, `/40`, `/60` | `shadow-brand/30`, `/40`, `/60` |
| `border-accent/60` | `border-brand/60` |

**Case-by-case (open the line and pick by context — these are few):**
- `bg-white` (solid, no opacity) and `text-white`: if the element sits on `bg-brand` (e.g. a primary button label/swatch), use `text-primary-foreground` / leave `bg-white` only if it must stay literally white (a color swatch). Otherwise `text-white → text-foreground`, `bg-white → bg-card`.
- `bg-black/40`, `shadow-black/50`, `shadow-black/60`: **leave as-is** — these are scrims/shadows that read correctly in both themes.
- Inline hex in JSX/style: `#ff6b6b` → `var(--color-destructive)`; `#f4f4f5` → `var(--color-foreground)`; `#0f0f10` → `var(--color-background)`. (Grep `rg "#(ff6b6b|f4f4f5|0f0f10)" apps/desktop/src` to find the 3 sites.)

- [ ] **Step 1: Find every occurrence**

Run (cwd repo root):
```bash
rg -n "bg-canvas|bg-panel|bg-elevated|bg-neutral|bg-white|text-neutral|border-line|border-neutral|ring-line|bg-accent|text-accent|ring-accent|shadow-accent|border-accent|#ff6b6b|#f4f4f5|#0f0f10" apps/desktop/src
```
Expected: a list of all sites to edit (the sweep targets). Note the count.

- [ ] **Step 2: Apply the mapping table to each file**

Edit each listed file, replacing per the table above. Work one file at a time. Keep state prefixes and opacity suffixes intact (e.g. `hover:bg-white/[0.07]` → `hover:bg-foreground/[0.07]`).

- [ ] **Step 3: Verify zero off-token utilities remain (allowing the intentional exceptions)**

Run (cwd repo root):
```bash
rg -n "bg-canvas|bg-panel|bg-elevated|bg-neutral|text-neutral|border-line|border-neutral|ring-line|bg-accent\b|text-accent\b|ring-accent|shadow-accent|border-accent|#ff6b6b|#f4f4f5|#0f0f10|bg-white/" apps/desktop/src
```
Expected: **no matches.** (Intentionally excluded from this grep: `bg-black/40`, `shadow-black/*`, and any literal `bg-white`/`text-white` you deliberately kept — verify those by eye.)

- [ ] **Step 4: Verify build**

Run: `pnpm --filter @gobrand/openstory-desktop build`
Expected: PASS.

- [ ] **Step 5: Manual visual check (both themes, both windows)**

Run: `pnpm --filter @gobrand/openstory-desktop dev`
- App opens in **light** by default. Titlebar, sidebar, toolbar, right panel, command palette (⌘K) all render with readable contrast.
- Open the gear menu → Theme → **Dark**. Whole UI switches to the dark palette (matches today's look).
- Click **Pop out**; in the detached window switch the main window's theme — the detached window re-themes simultaneously.
- Switch back to Light; confirm no leftover dark-only hardcoded patches (look for unreadable text or invisible borders).

Fix any contrast misses by adjusting the specific utility (e.g. a `text-foreground` that should be `text-muted-foreground`). Re-run Step 3's grep after fixes.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src
git commit -m "refactor(desktop): migrate shell + ui primitives onto semantic tokens"
```

---

## Task 10: End-to-end theme tests

**Files:**
- Modify: `apps/desktop/tests/smoke.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `apps/desktop/tests/smoke.test.ts` (before the trailing TODO comment block):

```ts
test("app defaults to light theme (no dark class on <html>)", async () => {
  const { app, main } = await launchApp();
  try {
    await expect(main.locator("header").filter({ hasText: "OpenStory" })).toBeVisible();
    const hasDark = await main.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(hasDark).toBe(false);
  } finally {
    await app.close();
  }
});

test("settings menu toggles to dark theme and persists across reload", async () => {
  const { app, main } = await launchApp();
  try {
    await expect(main.locator("header").filter({ hasText: "OpenStory" })).toBeVisible();

    // Open settings → Theme → Dark.
    await main.getByRole("button", { name: "Settings" }).click();
    await main.locator("text=Theme").click();
    await main.locator("text=Dark").click();

    // <html> gains the `dark` class.
    await expect
      .poll(() =>
        main.evaluate(() => document.documentElement.classList.contains("dark")),
      )
      .toBe(true);

    // Persisted: reload the renderer and confirm it boots dark.
    await main.reload();
    await expect(main.locator("header").filter({ hasText: "OpenStory" })).toBeVisible();
    await expect
      .poll(() =>
        main.evaluate(() => document.documentElement.classList.contains("dark")),
      )
      .toBe(true);
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 2: Run the new tests**

Run: `pnpm --filter @gobrand/openstory-desktop test:e2e -- --grep "theme"`
Expected: both PASS. If "persists across reload" fails, the cause is the store not persisting between the launch and reload within one app process — confirm `theme:set` calls `broadcastState()` (Task 4) and `store.setTheme` writes synchronously (electron-store writes are sync).

> Note on test isolation: these tests mutate the persisted store (set theme to dark). The default-light test must run against a fresh store. If the suite shares an electron-store file across tests and ordering makes default-light flake, launch with an isolated `userData` dir — pass `args: [".", "--user-data-dir=<tmp>"]` in a test-local variant of `launchApp`, or reset the theme to light in a `finally`. Prefer the reset-in-finally fix if a flake appears.

- [ ] **Step 3: Run the full suite (no regressions)**

Run: `pnpm --filter @gobrand/openstory-desktop test:e2e`
Expected: all existing smoke tests + the two new ones PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/tests/smoke.test.ts
git commit -m "test(desktop): e2e for default-light + theme toggle persistence"
```

---

## Task 11: Update the north-star status board

**Files:**
- Modify: `docs/superpowers/specs/2026-06-03-storybook-parity-north-star.md`

- [ ] **Step 1: Flip area 1 status**

In the status-board table, change area 1's row from:
```
| 1 | Design tokens + light/dark theme | `not-started` | — |
```
to:
```
| 1 | Design tokens + light/dark theme | `done` | [theme sub-spec](../specs/2026-06-03-theme-light-dark-design.md) |
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-06-03-storybook-parity-north-star.md
git commit -m "docs: mark north-star area 1 (theme) done"
```

---

## Self-review notes (addressed)

- **Spec coverage:** §1 tokens → Task 2; §2 provider → Tasks 5/8; §3 persistence/sync → Tasks 3/4; §4 menu → Tasks 1/6/7; §5 migration → Task 9; testing → Task 10. All spec gap-list items mapped.
- **`accent` collision:** spec said "accent stays the OpenStory blue" but the *ported* `accent` is a neutral hover surface. Resolved by introducing a distinct `brand` token for the blue and remapping all existing `*-accent*` utilities to `*-brand*` (Task 9 table); the ported `accent` is used only for menu hover states.
- **Type consistency:** `Theme = "light" | "dark"` defined once in `electron/types.ts`, imported by provider + settings menu; store uses the structurally identical inline `'light' | 'dark'`. `theme:set` signature matches across `IpcInvoke`, the handler, and `setTheme`.
- **No unit runner:** verification leans on `typecheck` + `build` + Playwright e2e, per the repo's actual tooling.
