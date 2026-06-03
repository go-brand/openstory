# Area 1 — Design tokens + light/dark theme

Sub-spec of [Storybook Parity — North Star](./2026-06-03-storybook-parity-north-star.md), area 1.

Date: 2026-06-03

---

## Goal

Replace OpenStory's dark-only, physically-named CSS tokens with a **semantic, theme-swappable
token system carrying two themes (light default, dark)**, switchable at runtime from a settings
menu, persisted across launches, and synced across both app windows (main + detached preview).

The token vocabulary and CSS architecture are **ported from the sibling app**
(`tanstack-start/tooling/tailwind/src/style.css`) so OpenStory matches that design system. The
settings menu reuses that app's base-ui `Menu` + `Theme` submenu pattern
(`tanstack-start/apps/app/src/components/account-menu.tsx`).

Scope is **light + dark only**. The ported architecture supports `dim` and a `system` preference
trivially later (see "Deferred"); we do not build them now (YAGNI).

---

## Current state

- **Tokens:** `apps/desktop/src/styles.css` defines physical dark values in a Tailwind v4
  `@theme` block (`--color-canvas`, `--color-panel`, `--color-elevated`, `--color-line`,
  `--color-accent`, …). No theme switch. `body { color: #f5f5f5 }` is hardcoded off-token.
- **Off-token utilities:** shell + primitives use raw Tailwind classes that cannot theme —
  `text-neutral-200/300/500`, `bg-white/[0.04]`, `bg-neutral-950/85`, hardcoded hex. These are
  the real blocker for light mode.
- **State/persistence:** `apps/desktop/electron/store.ts` (`AppStore`, electron-store backed) is
  the persistence layer. `buildAppState` pushes `AppState` to the renderer over IPC
  (`state:update`); `App.tsx` is the **shared root for both the main and detached windows** and
  subscribes to it. No global renderer store — view state is local `useState` in `main-app.tsx`.
- **Primitives:** `src/components/ui/` (button, checkbox, select, separator, slider, badge) are
  built on **radix**. `cn` lives at `src/lib/utils.ts`. Icons via `@hugeicons/react` +
  `@hugeicons/core-free-icons`, re-exported from `src/lib/icons.ts`.
- **No settings/gear button** exists in the titlebar today.

---

## Architecture

### 1. Token system (ported from sibling app)

Rewrite `apps/desktop/src/styles.css` to the **two-layer** pattern:

1. **Raw value layer** — semantic vars defined under `:root` (light, the default) and overridden
   under `.dark`. Names ported verbatim from the sibling app so the vocabulary matches:
   `--background`, `--background-1/2/3`, `--foreground`, `--card(-foreground)`,
   `--popover(-foreground)`, `--muted(-foreground)`, `--accent(-foreground)`, `--primary`,
   `--secondary`, `--border`, `--input`, `--ring`, `--sidebar(-foreground/-active/-border/-ring)`,
   plus a small **fixed palette** (`--fixed-light-*`, `--fixed-dark-*`) for theme swatches.
2. **Mapping layer** — `@theme inline { --color-background: var(--background); … }` maps each raw
   var to a Tailwind color utility. `inline` is required so Tailwind emits `var(--…)` (not a
   build-time constant), which is what makes the runtime class swap re-color everything.
3. **Variant** — `@custom-variant dark (&:is(.dark *))` so `dark:` utilities work where needed.
4. `body` color/background move onto tokens (`@apply bg-background text-foreground`).

**Dark values** are seeded from OpenStory's current palette (the existing near-black ramp and
blue accent) mapped onto the semantic names, so dark mode looks like today's app. **Light values**
come from the sibling app's `:root`. Accent stays the OpenStory blue in both themes.

The OpenStory-specific surfaces (`canvas`/`panel`/`elevated` ramp) map onto the ported names:
`canvas → background`, `panel → sidebar`/`background-1`, `elevated → card`/`popover`,
`line → border`. The migration sweep (step 5) is where call sites move to the new utility names.

### 2. Theme provider (renderer)

New `src/components/theme-provider.tsx`, a lean port of the sibling app's provider adapted for
Electron (no SSR, no cookies):

```ts
export type Theme = 'light' | 'dark';
export interface ThemeContextValue { theme: Theme; setTheme: (t: Theme) => void; }
```

- Reads the current theme from `state.theme` (see §3) — the provider is given `theme` as a prop by
  `App.tsx` and exposes it via context so any component can call `useTheme()`.
- `setTheme(t)` calls the IPC `theme:set` (it does **not** keep local state — the store is the
  single source of truth; the new value round-trips back via `state:update`). This keeps both
  windows in sync for free.
- An effect applies the class to the document root: `documentElement.classList` toggled to
  `'dark'` (light = no class), matching the CSS layer.

`useTheme()` returns a safe default (`light`) when no provider is mounted.

### 3. Persistence + cross-window sync

- Add `theme: Theme` to `PersistedState` in `electron/store.ts`, **default `'light'`**, with a
  `setTheme(theme)` method. Add nested-default migration (same pattern as `selection`/`overlay`).
- Add `theme` to `AppState` (`electron/types.ts`) and surface it in `buildAppState`
  (`electron/ipc.ts`). Add it to `FALLBACK_STATE` in `App.tsx` (`'light'`).
- New IPC handler `theme:set` → `store.setTheme(theme)` → re-push `state:update` to all windows
  (same broadcast path overlay/selection already use).
- `App.tsx` wraps both `MainApp` and `DetachedPreview` in `<ThemeProvider theme={state.theme}>`,
  so the detached window themes identically with no extra wiring.

Flash-of-wrong-theme on cold boot (state starts at `FALLBACK_STATE='light'` until `state:get`
resolves) is acceptable for v1 — default is light, so only a saved-dark user sees a brief light
flash. Noted as a possible follow-up (mirror to `localStorage` for an instant pre-paint read).

### 4. Settings menu (base-ui)

- Add dependency `@base-ui/react@1.5.0` (same version the sibling app uses). **Existing radix
  primitives stay** — they are only recolored by the token migration; only this new menu is
  base-ui, per the project rule "use base-ui, not radix" for new work.
- New primitive `src/components/ui/menu.tsx` — a trimmed port of the sibling app's `base-menu.tsx`
  exporting the parts we use: `Menu`, `MenuTrigger`, `MenuContent`, `MenuItem`, `MenuSeparator`,
  `MenuGroup`, `MenuSubmenuRoot`, `MenuSubmenuTrigger`. Styled on the new semantic tokens
  (`bg-popover`, `text-foreground`, `focus:bg-accent`, `border-input`, …). Submenu chevron + item
  check use hugeicons (`ArrowRight01Icon`, `Tick02Icon`) instead of lucide, to match app convention.
- New `src/components/settings-menu.tsx` — a gear `MenuTrigger` button, placed in the **titlebar
  right** (`no-drag`), opening a menu whose first group is a `Theme ▸` submenu (`MenuSubmenuRoot`
  + `MenuSubmenuTrigger`) listing **Light / Dark** `MenuItem`s. Active theme marked with a check.
  Each item calls `useTheme().setTheme(value)`.
- Add a gear icon (e.g. hugeicons `Settings01Icon`) and the submenu/check icons to
  `src/lib/icons.ts`.

### 5. Token migration sweep

Move every off-token call site onto the new semantic utilities so light mode renders correctly.
Files: `titlebar.tsx`, `sidebar.tsx`, `toolbar.tsx`, `right-panel.tsx`, `command-palette.tsx`,
`views/main-app.tsx`, `views/detached-preview.tsx`, and `components/ui/*`. Replace
`text-neutral-*` → `text-foreground`/`text-muted-foreground`, `bg-white/[α]` →
`bg-accent`/`hover:bg-accent`, surface backgrounds → `bg-background`/`bg-sidebar`/`bg-card`,
`border-line*` → `border-border`/`border-input`, etc. The detached preview's translucent
`bg-neutral-950/*` chrome maps to a token-based translucent surface.

---

## Components & boundaries

| Unit | Responsibility | Depends on |
|------|----------------|------------|
| `styles.css` | Token contract: raw light/dark values + `@theme inline` mapping + `dark` variant | — |
| `store.ts` (`theme` field) | Persist preference | electron-store |
| `ipc.ts` (`theme:set`, `buildAppState`) | Mutate + broadcast theme | store |
| `theme-provider.tsx` | Apply class to root, expose `useTheme`, call `theme:set` | IPC, `state.theme` |
| `ui/menu.tsx` | base-ui menu primitive (presentational) | `@base-ui/react`, tokens, `cn` |
| `settings-menu.tsx` | Gear trigger + Theme submenu wiring | `ui/menu`, `useTheme` |
| `App.tsx` | Provide theme to both windows | provider |

Data flow: **menu click → `setTheme` → IPC `theme:set` → `store.setTheme` → `state:update`
broadcast → `App.tsx` re-renders both windows → provider effect toggles `.dark` class → tokens
re-resolve.**

---

## Testing

- **Store unit test** (extend `tests/`): `setTheme` persists; nested default migration yields
  `theme: 'light'` for a store written before the field existed.
- **Smoke test** (`tests/smoke.test.ts` already exists): app boots with light theme by default;
  toggling to dark adds the `dark` class to the document root and persists across reload.
- **Manual:** open detached preview, switch theme in main window, confirm the detached window
  re-themes simultaneously.

---

## Deferred (architecture supports, not built now)

- **`dim` theme** — add a `.dim` block + value to the `Theme` union + a menu item.
- **`system` preference** — add `'system'` to a `ThemePreference` type, resolve via `matchMedia`
  in the provider; the sibling app's provider is the reference implementation.
- **FOWT mirror** to `localStorage` for instant pre-paint theme on cold boot.
- These are explicitly out of scope for area 1 to keep it tight; the north-star doc tracks them.

---

## Gap-list mapping (north-star area 1)

- [x] Define semantic token set → ported sibling-app vocabulary.
- [x] Author light + dark token values → light from sibling `:root`, dark from current palette.
- [x] Wire theme provider + runtime switch; persist in store → §2/§3.
- [x] Default to light → store default.
- [x] Migrate primitives + shell off raw neutrals → §5 sweep.
