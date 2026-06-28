# Sidebar Mode Switch (Design System / Docs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the merged sidebar tree into two modes — Design System (`components[]`) and Docs (`docs[]`) — via a segmented pill under the project switcher; the active mode picks which array drives the tree.

**Architecture:** The manifest already ships `components[]` and `docs[]` separately. Add a `mode` field to selection state, an IPC setter, an auto-default-to-populated-mode helper, a per-mode `buildTree`, and a minimal `ModeTabs` pill. The preview surface, toolbar, and right panel stay shared and unchanged.

**Tech Stack:** TypeScript, Vitest, React 19, Electron (desktop). No new dependencies.

## Global Constraints

- **Two modes only:** `"design" | "docs"`. `design` → tree from `components[]`; `docs` → tree from `docs[]`.
- **Mode filters the tree ONLY.** Switching mode must NOT change the rendered preview or touch componentId/storyId/pageId/docsComponentId. It only re-roots the tree; re-selecting drives the preview.
- **Component auto-docs (`DocsLeaf`/`kind:"docs"`) stay in Design System mode** — they are part of the component tree, untouched.
- **Auto-default:** on manifest load, flip away from an EMPTY active mode to the populated one; never override a mode that has content.
- **Mode persists** in the selection store (global, like `viewport`).
- **Minimal chrome:** the pill matches the repo-switcher aesthetic (`rounded-lg border border-border bg-card`); active tab `bg-foreground/[0.06] text-foreground`, inactive `text-muted-foreground`.
- No new dependencies. Tests use Vitest: `pnpm --filter openstory-desktop test` (desktop package name is `openstory-desktop`, unscoped).

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/desktop/electron/types.ts` | `ActiveSelection.mode`; `IpcInvoke["preview:setMode"]` |
| `apps/desktop/electron/store.ts` | `mode: "design"` in default selection |
| `apps/desktop/electron/selection.ts` | `defaultMode(current, componentCount, docCount)` helper |
| `apps/desktop/electron/selection.test.ts` | tests for `defaultMode` |
| `apps/desktop/electron/ipc.ts` | `preview:setMode` handler; apply `defaultMode` in `fetchManifest` |
| `apps/desktop/src/components/sidebar/build-tree.ts` | `buildTree(manifest, docs, mode)` — per-mode projection |
| `apps/desktop/src/components/sidebar/build-tree.test.ts` | mode-scoped projection tests |
| `apps/desktop/src/components/sidebar/mode-tabs.tsx` (new) | the segmented pill |
| `apps/desktop/src/components/sidebar.tsx` | render `ModeTabs`; pass `mode` to `buildTree`; mode-aware empty state |

---

## Task 1: Selection `mode` — type, store default, IPC setter, auto-default helper

**Files:**
- Modify: `apps/desktop/electron/types.ts`
- Modify: `apps/desktop/electron/store.ts`
- Modify: `apps/desktop/electron/selection.ts`
- Modify: `apps/desktop/electron/ipc.ts`
- Test: `apps/desktop/electron/selection.test.ts`

**Interfaces:**
- Produces: `ActiveSelection.mode: "design" | "docs"`; `IpcInvoke["preview:setMode"]: (mode: "design" | "docs") => void`; `defaultMode(current, componentCount, docCount): "design" | "docs"`.

- [ ] **Step 1: Write the failing test**

Add to `apps/desktop/electron/selection.test.ts`:

```ts
import { defaultMode } from "./selection";

describe("defaultMode", () => {
  it("flips an empty docs mode to design when components exist", () => {
    expect(defaultMode("docs", 3, 0)).toBe("design");
  });
  it("flips an empty design mode to docs when docs exist", () => {
    expect(defaultMode("design", 0, 2)).toBe("docs");
  });
  it("keeps a populated mode", () => {
    expect(defaultMode("design", 3, 2)).toBe("design");
    expect(defaultMode("docs", 3, 2)).toBe("docs");
  });
  it("keeps the mode when both are empty", () => {
    expect(defaultMode("design", 0, 0)).toBe("design");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter openstory-desktop test -- selection.test`
Expected: FAIL — `defaultMode` not exported.

- [ ] **Step 3: Implement**

In `apps/desktop/electron/selection.ts`, add:

```ts
// Pick the mode to show after a manifest load: flip away from an EMPTY active
// mode to the populated one, but never override a mode that has content.
export function defaultMode(
  current: "design" | "docs",
  componentCount: number,
  docCount: number,
): "design" | "docs" {
  if (current === "docs" && docCount === 0 && componentCount > 0) return "design";
  if (current === "design" && componentCount === 0 && docCount > 0) return "docs";
  return current;
}
```

In `apps/desktop/electron/types.ts`:
- In `ActiveSelection`, add (after `viewport`):
  ```ts
  /** Which sidebar tree is active. Design System = components[]; Docs = docs[]. */
  mode: "design" | "docs";
  ```
- In `IpcInvoke`, add (near `preview:setPage`):
  ```ts
  "preview:setMode": (mode: "design" | "docs") => void;
  ```

In `apps/desktop/electron/store.ts`, add `mode: "design"` to the default `selection` object (sibling of `viewport: "desktop"`).

In `apps/desktop/electron/ipc.ts`:
- Add the handler (near `preview:setPage`):
  ```ts
  ipcMain.handle("preview:setMode", (_e, mode: "design" | "docs") => {
    deps.store.patchSelection({ mode });
    broadcastState();
  });
  ```
- In `fetchManifest`, AFTER the existing `reconcileSelection` patch, apply the mode default:
  ```ts
  const sel = deps.store.state.selection;
  const wantMode = defaultMode(sel.mode, manifest.length, docs.length);
  if (wantMode !== sel.mode) deps.store.patchSelection({ mode: wantMode });
  ```
  Add `defaultMode` to the existing `./selection` import.

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter openstory-desktop test -- selection.test`
Expected: PASS.
Run: `pnpm --filter openstory-desktop exec tsc --noEmit`
Expected: errors only at the `buildTree` call site (Task 2 adds the 3rd arg) and `sidebar.tsx`. Confirm none in types.ts/store.ts/ipc.ts/selection.ts. (If the build-tree call site error is noisy, it closes in Task 2.)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/types.ts apps/desktop/electron/store.ts apps/desktop/electron/selection.ts apps/desktop/electron/selection.test.ts apps/desktop/electron/ipc.ts
git commit -m "feat(desktop): selection mode (design/docs) + setMode + auto-default helper"
```

---

## Task 2: `buildTree` projects a single mode

**Files:**
- Modify: `apps/desktop/src/components/sidebar/build-tree.ts`
- Test: `apps/desktop/src/components/sidebar/build-tree.test.ts`

**Interfaces:**
- Consumes: `ManifestComponent[]`, `ManifestDoc[]`.
- Produces: `buildTree(manifest, docs, mode): TreeNode[]` — `mode:"design"` projects only components (existing behavior, no `page` leaves); `mode:"docs"` projects only docs (`page` leaves).

- [ ] **Step 1: Write the failing test**

In `build-tree.test.ts`, add (reuse the existing `doc(...)` helper from the prior feature's tests if present; otherwise define it):

```ts
it("design mode projects only components (no page leaves)", () => {
  const tree = buildTree(manifest /* existing component fixture */, [doc()], "design");
  const kinds = new Set<string>();
  const walk = (ns: TreeNode[]) => ns.forEach((n) => {
    kinds.add(n.kind);
    if (n.kind === "section" || n.kind === "folder" || n.kind === "component") walk(n.children);
  });
  walk(tree);
  expect(kinds.has("page")).toBe(false);
});

it("docs mode projects only docs (page leaves, grouped by frontmatter group)", () => {
  const tree = buildTree([], [doc({ group: "Features" })], "docs");
  const features = tree.find((n) => n.kind === "folder" && n.label === "Features");
  expect(features).toBeTruthy();
  const leaf = (features as { children: TreeNode[] }).children[0]!;
  expect(leaf.kind).toBe("page");
});

it("empty active mode returns []", () => {
  expect(buildTree([], [], "design")).toEqual([]);
  expect(buildTree([{ /* one component */ } as never], [], "docs")).toEqual([]);
});
```

Update the EXISTING build-tree tests that call `buildTree(manifest)` or `buildTree(manifest, docs)` to pass the mode: component-tree assertions become `buildTree(manifest, [], "design")`; the prior page-leaf tests become `buildTree([], docs, "docs")`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter openstory-desktop test -- build-tree`
Expected: FAIL — `buildTree` takes 2 args / merges both.

- [ ] **Step 3: Implement**

In `build-tree.ts`, change `buildTree` to select by mode and project a single entry kind. Replace the current merged `buildTree` body:

```ts
export function buildTree(
  manifest: ManifestComponent[],
  docs: ManifestDoc[],
  mode: "design" | "docs",
): TreeNode[] {
  // Each mode roots its own tree from a single array; they never interleave.
  const order: (string | null)[] = [];
  const bySection = new Map<string | null, Array<ManifestComponent | ManifestDoc>>();
  const push = (section: string | null, item: ManifestComponent | ManifestDoc) => {
    if (!bySection.has(section)) {
      bySection.set(section, []);
      order.push(section);
    }
    bySection.get(section)!.push(item);
  };
  const items = mode === "design" ? manifest : docs;
  for (const it of items) push(it.section ?? null, it);

  const makeNodes = (entries: Array<ManifestComponent | ManifestDoc>, idPrefix: string): TreeNode[] =>
    container(
      entries.map((e) => ({ entry: e, segs: segments(e.group) })),
      idPrefix,
      mode,
    );

  const roots: TreeNode[] = [];
  if (bySection.has(null)) roots.push(...makeNodes(bySection.get(null)!, "root"));
  for (const s of order) {
    if (s === null) continue;
    const id = `section:${s}`;
    roots.push({ kind: "section", id, label: s, children: makeNodes(bySection.get(s)!, id) });
  }
  return roots;
}
```

Update `Item`/`container` to carry the mode and dispatch per entry kind. Change the `Item` type to `{ entry: ManifestComponent | ManifestDoc; segs: string[] }`, and in `container`, when emitting a direct node: `mode === "docs"` → `pageLeaf(entry as ManifestDoc, idPrefix)`, else `componentNode(entry as ManifestComponent, idPrefix)`. Sort `direct` by `id` (components) / `id` (docs) — both have `id`, so the existing `localeCompare` on `.id` works uniformly. Keep `componentNode`, `pageLeaf`, `segments`, `isContainer`, and `flatten` unchanged.

- [ ] **Step 4: Update the call site**

In `apps/desktop/src/components/sidebar.tsx`, change `buildTree(state.manifest, state.docs)` → `buildTree(state.manifest, state.docs, state.selection.mode)` and add `state.selection.mode` to the `useMemo` dep array.

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter openstory-desktop test -- build-tree`
Expected: PASS (new + updated existing).
Run: `pnpm --filter openstory-desktop exec tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/sidebar/build-tree.ts apps/desktop/src/components/sidebar/build-tree.test.ts apps/desktop/src/components/sidebar.tsx
git commit -m "feat(desktop): buildTree projects a single mode (design/docs)"
```

---

## Task 3: `ModeTabs` pill + sidebar wiring + empty states

**Files:**
- Create: `apps/desktop/src/components/sidebar/mode-tabs.tsx`
- Modify: `apps/desktop/src/components/sidebar.tsx`

**Interfaces:**
- Consumes: `preview:setMode` IPC; `state.selection.mode`.
- Produces: `ModeTabs({ mode, onSelect })` rendered under `RepoSwitcher`.

- [ ] **Step 1: Implement `ModeTabs`**

Create `apps/desktop/src/components/sidebar/mode-tabs.tsx`. Mirror the repo-switcher's icon usage + class aesthetic:

```tsx
import { cn } from "../../lib/utils";
import { HugeiconsIcon, DashboardSquare01Icon, File01Icon } from "../../lib/icons";

type Mode = "design" | "docs";
const TABS: Array<{ mode: Mode; label: string; icon: typeof File01Icon }> = [
  { mode: "design", label: "Design System", icon: DashboardSquare01Icon },
  { mode: "docs", label: "Docs", icon: File01Icon },
];

export function ModeTabs({ mode, onSelect }: { mode: Mode; onSelect: (m: Mode) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Sidebar mode"
      className="no-drag mt-2 flex gap-1 rounded-lg border border-border bg-card p-1"
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const i = TABS.findIndex((t) => t.mode === mode);
        const next = e.key === "ArrowRight" ? TABS[(i + 1) % TABS.length] : TABS[(i + TABS.length - 1) % TABS.length];
        if (next) onSelect(next.mode);
      }}
    >
      {TABS.map((t) => {
        const active = t.mode === mode;
        return (
          <button
            key={t.mode}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(t.mode)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors",
              active
                ? "bg-foreground/[0.06] text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <HugeiconsIcon icon={t.icon} className="size-3.5 shrink-0" />
            <span className="truncate">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `sidebar.tsx`**

- Import `ModeTabs`.
- Render it inside the `px-3` header area directly under `<RepoSwitcher state={state} api={api} />`, only when there is at least one project:
  ```tsx
  {state.projects.length > 0 && (
    <div className="no-drag px-3">
      <ModeTabs
        mode={state.selection.mode}
        onSelect={(m) => api?.invoke("preview:setMode", m)}
      />
    </div>
  )}
  ```
- Make the empty-tree copy mode-aware. Replace the `nodes.length === 0` branch text:
  ```tsx
  ) : nodes.length === 0 ? (
    <p className="px-3 py-2 text-[11px] text-muted-foreground">
      {state.selection.mode === "docs"
        ? "Drop a *.stories.md to document a feature."
        : "No stories found in openstory.config.ts."}
    </p>
  ) : (
  ```

- [ ] **Step 3: Typecheck + tests**

Run: `pnpm --filter openstory-desktop exec tsc --noEmit`
Expected: clean.
Run: `pnpm --filter openstory-desktop test`
Expected: PASS (no regressions).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/components/sidebar/mode-tabs.tsx apps/desktop/src/components/sidebar.tsx
git commit -m "feat(desktop): mode-switch pill under project switcher + empty states"
```

---

## Task 4: End-to-end verification

- [ ] **Step 1: Build + launch the desktop app against the tanstack app**

Run the desktop app from the repo (`pnpm --filter openstory-desktop dev`), point it at `~/Desktop/tanstack-start/apps/app`, and confirm:
- Under the project switcher: a `Design System | Docs` pill.
- **Design System** active → the component tree (Social Media Previews, Badge, Button…), each component's "Documentation" leaf present. No "Features".
- **Docs** active → only the Notifications page under a Features folder. No components.
- Switching the pill swaps the tree without changing the rendered preview.
- A project with only docs opens in Docs mode; empty Docs shows the hint.
- Left/right arrow keys move between tabs; active tab has `aria-selected`.

- [ ] **Step 2: Commit any fixes, then report**

If the e2e surfaces issues, fix + re-verify. Otherwise no commit needed for this task.

---

## Self-Review notes (addressed)

- **Spec coverage:** mode field + IPC + default (Task 1), per-mode tree (Task 2), pill + wiring + empty states (Task 3), e2e (Task 4). Component auto-docs stay in design mode automatically (no code). Mode persistence via store (Task 1). Switch-does-not-re-render: `setMode` only patches `mode` (Task 1) — no selection fields touched.
- **No new entity confusion:** reuses the `page`-leaf machinery from feature-docs; only `buildTree` changes (stops merging).
- **Type consistency:** `mode: "design" | "docs"` identical across types.ts, store default, `defaultMode`, `buildTree`, `ModeTabs`, IPC. `buildTree(manifest, docs, mode)` arity matches the sidebar call site.
