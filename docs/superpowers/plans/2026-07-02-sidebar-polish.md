# Sidebar Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the OpenStory desktop sidebar into a hybrid product navigator and code-editor explorer without changing navigation behavior.

**Architecture:** Keep the existing sidebar component split intact: `RepoSwitcher` owns workspace selection, `ModeTabs` owns the segmented mode control, `Tree` owns row rendering, and `Sidebar` owns keyboard navigation/loading states. Apply the visual changes through Tailwind class updates and small CSS helpers for decorative branch guide rails.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Hugeicons, Vitest.

## Global Constraints

- Preserve existing IPC calls, selection behavior, keyboard navigation, loading behavior, and tree-building behavior.
- Preserve existing dirty performance/loading changes in `sidebar.tsx`, `repo-switcher.tsx`, and `styles.css`.
- Do not replace Hugeicons or introduce a new sidebar state model.
- Guide rails are decorative and must not add accessibility tree noise.
- Use focused verification: desktop sidebar tests, desktop typecheck, and visual smoke when feasible.

---

### Task 1: Top Sidebar Controls

**Files:**
- Modify: `apps/desktop/src/components/sidebar.tsx`
- Modify: `apps/desktop/src/components/sidebar/repo-switcher.tsx`
- Modify: `apps/desktop/src/components/sidebar/mode-tabs.tsx`

**Interfaces:**
- Consumes: existing `RepoSwitcher({ state, api })`, `ModeTabs({ mode, onSelect })`, and `Sidebar({ state, api, onSelectStory })`.
- Produces: same component interfaces with updated visual classes only.

- [ ] **Step 1: Preserve behavior baseline**

Run:

```bash
pnpm --filter openstory-desktop test -- sidebar
```

Expected: existing sidebar tests pass or show only pre-existing failures unrelated to visual class changes.

- [ ] **Step 2: Polish the sidebar container and empty/loading spacing**

In `apps/desktop/src/components/sidebar.tsx`, keep the existing callbacks and loading helper. Update only container and spacing classes:

```tsx
<aside className="flex w-[280px] flex-col border-r border-border bg-sidebar text-sidebar-foreground">
```

Use tree scroll padding that gives selected rows room to breathe:

```tsx
className="no-drag mt-2 flex-1 overflow-y-auto px-2 pb-4 focus:outline-none"
```

Keep the existing empty and loading branches intact.

- [ ] **Step 3: Polish the repo switcher**

In `apps/desktop/src/components/sidebar/repo-switcher.tsx`, keep `pickFolder`, project selection, and remove behavior unchanged. Update the trigger to:

```tsx
<MenuTrigger className="flex h-14 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-foreground transition-colors hover:bg-foreground/[0.045] data-[popup-open]:bg-foreground/[0.055]">
```

Use a stronger monogram:

```tsx
<span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-[13px] font-semibold uppercase text-brand shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_18%,transparent)]">
```

Keep the no-repo fallback icon, menu items, and performance markers.

- [ ] **Step 4: Polish mode tabs**

In `apps/desktop/src/components/sidebar/mode-tabs.tsx`, keep the roving keyboard behavior unchanged. Update tablist classes to:

```tsx
className="no-drag mt-3 flex gap-0.5 rounded-full border border-border bg-foreground/[0.035] p-0.5 shadow-[inset_0_1px_0_color-mix(in_oklab,var(--foreground)_7%,transparent)]"
```

Update active tab classes to:

```tsx
active
  ? "bg-card text-foreground shadow-[0_1px_10px_color-mix(in_oklab,var(--foreground)_8%,transparent),inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_6%,transparent)]"
  : "text-muted-foreground hover:bg-foreground/[0.035] hover:text-foreground"
```

Use `h-8` on each tab button so the pill feels more deliberate:

```tsx
"flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium transition-colors"
```

- [ ] **Step 5: Verify top controls**

Run:

```bash
pnpm --filter openstory-desktop typecheck
```

Expected: exit 0, or a clearly unrelated pre-existing typecheck failure.

### Task 2: Tree Rows And Branch Guide Rails

**Files:**
- Modify: `apps/desktop/src/components/sidebar/tree.tsx`
- Modify: `apps/desktop/src/styles.css`

**Interfaces:**
- Consumes: existing `TreeNode`, `TreeCallbacks`, `isContainer`, and `ActiveSelection`.
- Produces: same `Tree({ nodes, cb })` interface, with decorative guide rails and improved row classes.

- [ ] **Step 1: Add decorative tree CSS helpers**

In `apps/desktop/src/styles.css`, add after scrollbar styles:

```css
.sidebar-tree-branch {
  position: relative;
}

.sidebar-tree-branch::before {
  content: "";
  position: absolute;
  top: 0.125rem;
  bottom: 0.125rem;
  left: var(--sidebar-branch-left, 1rem);
  width: 1px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--foreground) 12%, transparent);
  pointer-events: none;
}

.sidebar-tree-branch[data-depth="0"]::before {
  background: transparent;
}
```

- [ ] **Step 2: Increase indentation rhythm**

In `apps/desktop/src/components/sidebar/tree.tsx`, change:

```ts
const INDENT = 16;
```

For non-section rows, calculate:

```tsx
const rowPadding = 10 + depth * INDENT;
const branchLeft = Math.max(16, rowPadding - 11);
```

Apply `style={{ paddingLeft: rowPadding }}` to row buttons.

- [ ] **Step 3: Polish section headers**

Keep section activation and children rendering unchanged. Update section row classes to:

```tsx
"mt-2 flex h-7 w-full items-center gap-2 rounded-md pr-2 text-[11px] font-semibold tracking-[0.16em] uppercase transition-colors"
```

Use:

```tsx
focused ? "text-foreground" : "text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground"
```

- [ ] **Step 4: Wrap expanded branches with decorative rails**

For section and non-section expandable children, render the child list inside:

```tsx
<div
  className="sidebar-tree-branch"
  data-depth={depth + 1}
  style={{ "--sidebar-branch-left": `${8 + (depth + 1) * INDENT}px` } as React.CSSProperties}
>
  {node.children.map((c) => (
    <Row key={c.id} node={c} depth={depth + 1} cb={cb} />
  ))}
</div>
```

This wrapper is a plain `div` with no ARIA attributes.

- [ ] **Step 5: Polish regular rows**

Update regular row classes to:

```tsx
"relative flex h-9 w-full items-center gap-2 rounded-xl pr-2.5 text-[13px] transition-colors outline-none"
```

Use state classes:

```tsx
selected
  ? "bg-brand text-white shadow-[0_5px_18px_color-mix(in_oklab,var(--brand)_26%,transparent)]"
  : focused
    ? "bg-foreground/[0.07] text-foreground ring-1 ring-inset ring-foreground/10"
    : "text-foreground/90 hover:bg-foreground/[0.045] hover:text-foreground"
```

Make status readable on selected rows:

```tsx
className={cn(
  "ml-auto shrink-0 rounded px-1 text-[11px]",
  selected ? "text-white/70" : "text-muted-foreground opacity-70",
)}
```

- [ ] **Step 6: Verify tree behavior and types**

Run:

```bash
pnpm --filter openstory-desktop test -- sidebar
pnpm --filter openstory-desktop typecheck
```

Expected: both commands exit 0, or failures are recorded with exact unrelated causes.

- [ ] **Step 7: Visual smoke**

Run the desktop dev server:

```bash
pnpm --filter openstory-desktop dev
```

Expected: the app starts. Inspect the sidebar in dark mode with nested folders and one selected row. Confirm:

- Top repo switcher has stronger identity.
- Mode tabs remain a segmented pill.
- Tree rows are compact and readable.
- Expanded nested content has subtle guide rails.
- Selected row is a blue pill and status text remains legible.
