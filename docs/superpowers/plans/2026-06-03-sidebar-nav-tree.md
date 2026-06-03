# Sidebar + Navigation Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the repo-accordion sidebar with a Storybook-style nav tree —
repo switcher → auto-derived section → folder → component → (Documentation stub +
story leaves) — with in-sidebar search, kind icons, and keyboard navigation.

**Architecture:** The vite-plugin (Node) derives a `section` per preview from its
workspace location and emits it on the manifest. The renderer projects the flat
manifest into a typed tree (pure `build-tree.ts`), filters it (pure `search.ts`),
and renders it with collapse state in `localStorage`. Story selection flows through
the existing `preview:set` IPC; a Docs node routes through a new `preview:setDocs`
IPC to a placeholder. Right-panel "Presets" list is removed (superseded by the tree).

**Tech Stack:** TypeScript, React, Electron, Vite, vitest (unit), Playwright
(`_electron`, e2e), Hugeicons, Tailwind + semantic tokens.

**Spec:** `docs/superpowers/specs/2026-06-03-sidebar-nav-tree-design.md`

---

## File structure

| File | Responsibility |
|------|----------------|
| `packages/vite-plugin/src/derive-section.ts` (new) | Pure: abs sourcePath → workspace-package section (or null) |
| `packages/vite-plugin/src/plugin.ts` (mod) | Emit `section` in `buildManifest` |
| `apps/desktop/electron/types.ts` (mod) | `ManifestPreview.section`; `ActiveSelection.docsComponentId`; `preview:setDocs` |
| `apps/desktop/electron/store.ts` (mod) | Default `docsComponentId: null` |
| `apps/desktop/electron/ipc.ts` (mod) | `preview:setDocs` handler; clear docs on `preview:set` |
| `apps/desktop/vitest.config.ts` (new) | vitest for renderer pure modules |
| `apps/desktop/src/components/sidebar/build-tree.ts` (new) | Pure: manifest → `TreeNode[]`; `flatten` |
| `apps/desktop/src/components/sidebar/search.ts` (new) | Pure: `rank`, `filterTree` |
| `apps/desktop/src/components/sidebar/use-expanded.ts` (new) | Collapse state hook (localStorage per repo) |
| `apps/desktop/src/components/sidebar/repo-switcher.tsx` (new) | Repo dropdown + add/remove |
| `apps/desktop/src/components/sidebar/tree.tsx` (new) | Renders `TreeNode[]` rows + icons + selection |
| `apps/desktop/src/components/sidebar.tsx` (rewrite) | Container: switcher + search + tree + keyboard |
| `apps/desktop/src/components/docs-stub.tsx` (new) | Placeholder for a Docs node (until area 6) |
| `apps/desktop/src/lib/icons.ts` (mod) | Add component / docs / bookmark glyphs |
| `apps/desktop/src/views/main-app.tsx` (mod) | Wire Sidebar/selection; docs overlay |
| `apps/desktop/src/components/right-panel.tsx` (mod) | Drop Presets block |
| `apps/desktop/src/components/command-palette.tsx` (mod) | Add story-leaf results |
| `apps/desktop/package.json` (mod) | `test` script + vitest devDep |
| tests | unit + e2e per task |

---

## Task 1: Section derivation (pure, vite-plugin)

**Files:**
- Create: `packages/vite-plugin/src/derive-section.ts`
- Test: `packages/vite-plugin/src/derive-section.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/vite-plugin/src/derive-section.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveSection } from "./derive-section";

let root: string;

beforeAll(() => {
  // Build a temp pnpm monorepo:
  //   <root>/pnpm-workspace.yaml
  //   <root>/package.json
  //   <root>/apps/app/package.json + src/Card.tsx
  //   <root>/packages/ui/package.json + src/Button.tsx
  root = mkdtempSync(join(tmpdir(), "os-ws-"));
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n  - packages/*\n");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "root", private: true }));
  for (const [dir, file] of [
    ["apps/app", "Card.tsx"],
    ["packages/ui", "Button.tsx"],
  ] as const) {
    mkdirSync(join(root, dir, "src"), { recursive: true });
    writeFileSync(join(root, dir, "package.json"), JSON.stringify({ name: dir }));
    writeFileSync(join(root, dir, "src", file), "export default null;");
  }
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("deriveSection", () => {
  it("returns the workspace package basename for a monorepo member", () => {
    expect(deriveSection(join(root, "apps/app/src/Card.tsx"))).toBe("app");
    expect(deriveSection(join(root, "packages/ui/src/Button.tsx"))).toBe("ui");
  });

  it("returns null when sourcePath is null", () => {
    expect(deriveSection(null)).toBeNull();
  });

  it("returns null for a single-package repo (no workspace markers)", () => {
    const solo = mkdtempSync(join(tmpdir(), "os-solo-"));
    mkdirSync(join(solo, "src"), { recursive: true });
    writeFileSync(join(solo, "package.json"), JSON.stringify({ name: "solo" }));
    writeFileSync(join(solo, "src", "App.tsx"), "export default null;");
    try {
      expect(deriveSection(join(solo, "src/App.tsx"))).toBeNull();
    } finally {
      rmSync(solo, { recursive: true, force: true });
    }
  });

  it("returns null for a component in the workspace root package itself", () => {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "Root.tsx"), "export default null;");
    expect(deriveSection(join(root, "src/Root.tsx"))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-vite test -- derive-section`
Expected: FAIL — "Cannot find module './derive-section'".

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/vite-plugin/src/derive-section.ts
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, parse } from "node:path";

// Walk up from `startDir` to the filesystem root, returning the first directory
// for which `predicate(dir)` is true, or null.
function findUp(startDir: string, predicate: (dir: string) => boolean): string | null {
  let dir = startDir;
  const { root } = parse(dir);
  for (;;) {
    if (predicate(dir)) return dir;
    if (dir === root) return null;
    dir = dirname(dir);
  }
}

function hasPackageJson(dir: string): boolean {
  return existsSync(join(dir, "package.json"));
}

// A workspace root declares members: pnpm-workspace.yaml, or a package.json with
// a "workspaces" field (npm/yarn/bun). Member packages declare neither, so the
// walk passes them and stops at the real root.
function isWorkspaceRoot(dir: string): boolean {
  if (existsSync(join(dir, "pnpm-workspace.yaml"))) return true;
  const pkg = join(dir, "package.json");
  if (!existsSync(pkg)) return false;
  try {
    const json = JSON.parse(readFileSync(pkg, "utf8")) as { workspaces?: unknown };
    return json.workspaces !== undefined;
  } catch {
    return false;
  }
}

/**
 * Derive a sidebar SECTION from a component's absolute source path: the basename
 * of the workspace package the file belongs to (apps/app → "app", packages/ui →
 * "ui"). Returns null when there is no monorepo workspace, or when the file's
 * package IS the workspace root — those render flat at the tree root. On any
 * ambiguity we return null (flat) rather than guess a wrong section.
 */
export function deriveSection(sourcePath: string | null): string | null {
  if (!sourcePath) return null;
  const startDir = dirname(sourcePath);
  const pkgDir = findUp(startDir, hasPackageJson);
  if (!pkgDir) return null;
  const wsRoot = findUp(startDir, isWorkspaceRoot);
  if (!wsRoot) return null; // not a monorepo → flat
  if (pkgDir === wsRoot) return null; // root package itself → flat
  return basename(pkgDir);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-vite test -- derive-section`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/vite-plugin/src/derive-section.ts packages/vite-plugin/src/derive-section.test.ts
git commit -m "feat(vite-plugin): derive sidebar section from workspace location"
```

---

## Task 2: Emit `section` in the manifest

**Files:**
- Modify: `packages/vite-plugin/src/plugin.ts:72-93`
- Test: `packages/vite-plugin/src/plugin.test.ts` (update 3 `toEqual` blocks + add 1)

- [ ] **Step 1: Update the existing failing test expectations**

In `packages/vite-plugin/src/plugin.test.ts`, add `section: null` to each
`buildManifest` `toEqual` object (the existing fixtures have no real
on-disk workspace, so they derive null). Edit the two full-object assertions:

```ts
// in "emits variants with props and inferred controls"
    expect(manifest.previews[0]).toEqual({
      id: "linkedin",
      group: "LinkedIn",
      section: null,
      background: "#f3f2ef",
      variants: [
        { id: "a", label: "A", props: { text: "hi", dark: true } },
        { id: "b", label: "B", props: { text: "yo" } },
      ],
      controls: deriveControls(config.previews[0].fixtures),
      sourcePath: null,
    });
```

```ts
// in "emits empty variants and controls for a preview with zero fixtures"
    expect(buildManifest(config).previews[0]).toEqual({
      id: "linkedin",
      group: "",
      section: null,
      background: "#f4f4f5",
      variants: [],
      controls: [],
      sourcePath: null,
    });
```

Add a new test at the end of the `describe("buildManifest")` block:

```ts
  it("derives a section from a monorepo sourcePath", () => {
    // This repo IS a pnpm monorepo; resolve a real file under apps/desktop.
    const config = defineOpenStoryConfig({
      previews: [
        { id: "x", component: () => null, fixtures: [], sourcePath: "./electron/types.ts" },
      ],
    });
    // projectRoot = apps/desktop → workspace member basename "desktop".
    const root = new URL("../../../apps/desktop", import.meta.url).pathname;
    expect(buildManifest(config, root).previews[0]?.section).toBe("desktop");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-vite test -- plugin`
Expected: FAIL — objects miss `section`; new test gets `undefined`.

- [ ] **Step 3: Implement — emit section**

In `packages/vite-plugin/src/plugin.ts`, import and use `deriveSection`:

```ts
// add to imports near the top
import { deriveSection } from "./derive-section.js";
```

Replace the `buildManifest` `previews.map` body so `sourcePath` is computed once
and reused for `section`:

```ts
export function buildManifest(config: OpenStoryConfig, projectRoot?: string) {
  const presets = resolvePresets(config.presets);
  return {
    previews: config.previews.map((p) => {
      const render = resolveRender(p, presets);
      const sourcePath =
        p.sourcePath && projectRoot ? resolve(projectRoot, p.sourcePath) : null;
      return {
        id: p.id,
        group: p.group ?? "",
        section: deriveSection(sourcePath),
        background: render.background,
        variants: p.fixtures.map((f) => ({
          id: f.id,
          label: f.label,
          props: f.props,
        })),
        controls: deriveControls(p.fixtures),
        sourcePath,
      };
    }),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-vite test -- plugin`
Expected: PASS (all buildManifest tests incl. the new section test).

- [ ] **Step 5: Commit**

```bash
git add packages/vite-plugin/src/plugin.ts packages/vite-plugin/src/plugin.test.ts
git commit -m "feat(vite-plugin): emit derived section on the manifest"
```

---

## Task 3: Types + store default for section / docs selection

**Files:**
- Modify: `apps/desktop/electron/types.ts`
- Modify: `apps/desktop/electron/store.ts:14-20`

- [ ] **Step 1: Add `section` to `ManifestPreview`**

In `apps/desktop/electron/types.ts`, add the field to `ManifestPreview` (after `group`):

```ts
export type ManifestPreview = {
  id: string;
  /** Slash-delimited sidebar path. "" means the sidebar root. */
  group: string;
  /** Auto-derived workspace section (package basename) or null. Rendered uppercase. */
  section: string | null;
  /** Resolved chrome background for this preview's preset. */
  background: string;
  variants: Array<{
    id: string;
    label: string;
    props: Record<string, unknown>;
  }>;
  controls: ManifestControl[];
  sourcePath: string | null;
};
```

- [ ] **Step 2: Add `docsComponentId` to `ActiveSelection`**

```ts
export type ActiveSelection = {
  projectId: string | null;
  previewId: string | null;
  variantId: string | null;
  /** Component id whose Docs node is the active selection, else null. */
  docsComponentId: string | null;
  viewport: "desktop" | "mobile";
  propOverrides: Record<string, unknown>;
};
```

- [ ] **Step 3: Add the `preview:setDocs` channel**

In the `IpcInvoke` type, add after `preview:setProps`:

```ts
  "preview:setDocs": (componentId: string | null) => void;
```

- [ ] **Step 4: Default the store field**

In `apps/desktop/electron/store.ts`, add `docsComponentId: null` to
`defaults.selection`:

```ts
  selection: {
    projectId: null,
    previewId: null,
    variantId: null,
    docsComponentId: null,
    viewport: "desktop",
    propOverrides: {},
  },
```

(The constructor already merges persisted selection over defaults, so older
stores backfill `docsComponentId` automatically.)

- [ ] **Step 5: Verify typecheck + commit**

Run: `pnpm --filter openstory-desktop typecheck`
Expected: FAIL — `ipc.ts`/`right-panel.tsx`/`sidebar.tsx` not yet updated for the
new required `docsComponentId` in selection literals. That's expected; the next
tasks fix call sites. Commit the type/store changes now so later tasks build on them:

```bash
git add apps/desktop/electron/types.ts apps/desktop/electron/store.ts
git commit -m "feat(desktop): manifest section + docs selection types"
```

---

## Task 4: `preview:setDocs` IPC + clear docs on story select

**Files:**
- Modify: `apps/desktop/electron/ipc.ts:84-89,140-159`

- [ ] **Step 1: Clear docs selection when a story/variant is chosen**

In the `preview:set` handler, add `docsComponentId: null` to the patch:

```ts
  ipcMain.handle(
    "preview:set",
    (
      _e,
      input: {
        previewId: string;
        variantId: string;
        viewport: "desktop" | "mobile";
      },
    ) => {
      // Selecting a story is a clean start: clear overrides and exit any docs view.
      deps.store.patchSelection({ ...input, propOverrides: {}, docsComponentId: null });
      broadcastState();
    },
  );
```

- [ ] **Step 2: Add the `preview:setDocs` handler**

Immediately after the `preview:setProps` handler:

```ts
  ipcMain.handle("preview:setDocs", (_e, componentId: string | null) => {
    deps.store.patchSelection({ docsComponentId: componentId });
    broadcastState();
  });
```

- [ ] **Step 3: Clear docs on manifest reset**

In `fetchManifest`, the invalid-selection reset already clears overrides; add
`docsComponentId: null` there too:

```ts
        if (first && first.variants[0]) {
          deps.store.patchSelection({
            previewId: first.id,
            variantId: first.variants[0].id,
            propOverrides: {},
            docsComponentId: null,
          });
        }
```

- [ ] **Step 4: Verify + commit**

Run: `pnpm --filter openstory-desktop typecheck`
Expected: still FAIL only in renderer files (sidebar/right-panel) — electron side
now clean. Commit:

```bash
git add apps/desktop/electron/ipc.ts
git commit -m "feat(desktop): preview:setDocs IPC; clear docs on story select"
```

---

## Task 5: vitest for the desktop renderer

**Files:**
- Create: `apps/desktop/vitest.config.ts`
- Modify: `apps/desktop/package.json`

- [ ] **Step 1: Add the vitest config**

```ts
// apps/desktop/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure logic modules only (build-tree, search) — no DOM needed.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Add the dev dependency**

Run: `pnpm --filter openstory-desktop add -D vitest`
Expected: vitest added to `apps/desktop/package.json` devDependencies.

- [ ] **Step 3: Add the `test` script**

In `apps/desktop/package.json` `scripts`, add (keep `test:e2e` as-is):

```json
    "test": "vitest run",
```

- [ ] **Step 4: Verify the runner starts (no tests yet)**

Run: `pnpm --filter openstory-desktop test`
Expected: vitest runs and reports "No test files found" (exit 0 is fine) — runner wired.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/vitest.config.ts apps/desktop/package.json pnpm-lock.yaml
git commit -m "chore(desktop): add vitest for renderer unit tests"
```

---

## Task 6: `build-tree` (pure tree projection)

**Files:**
- Create: `apps/desktop/src/components/sidebar/build-tree.ts`
- Test: `apps/desktop/src/components/sidebar/build-tree.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/src/components/sidebar/build-tree.test.ts
import { describe, it, expect } from "vitest";
import type { ManifestPreview } from "../../../electron/types";
import { buildTree, flatten, type TreeNode } from "./build-tree";

function preview(over: Partial<ManifestPreview> & { id: string }): ManifestPreview {
  return {
    id: over.id,
    group: over.group ?? "",
    section: over.section ?? null,
    background: "#fff",
    variants: over.variants ?? [{ id: "default", label: "Default", props: {} }],
    controls: [],
    sourcePath: null,
  };
}

describe("buildTree", () => {
  it("hoists a single-variant component to a story leaf (no component wrapper, no docs)", () => {
    const tree = buildTree([preview({ id: "button" })]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      kind: "story",
      componentId: "button",
      variantId: "default",
      label: "Button",
    });
  });

  it("expands a multi-variant component to docs + story leaves", () => {
    const tree = buildTree([
      preview({
        id: "button",
        variants: [
          { id: "primary", label: "Primary", props: {} },
          { id: "disabled", label: "Disabled", props: {} },
        ],
      }),
    ]);
    expect(tree[0]).toMatchObject({ kind: "component", componentId: "button" });
    const comp = tree[0] as Extract<TreeNode, { kind: "component" }>;
    expect(comp.children.map((c) => c.kind)).toEqual(["docs", "story", "story"]);
    expect(comp.children[0]).toMatchObject({ kind: "docs", label: "Documentation" });
    expect(comp.children[1]).toMatchObject({ kind: "story", variantId: "primary" });
  });

  it("nests group segments into folders", () => {
    const tree = buildTree([preview({ id: "input", group: "Forms/Text" })]);
    expect(tree[0]).toMatchObject({ kind: "folder", label: "Forms" });
    const forms = tree[0] as Extract<TreeNode, { kind: "folder" }>;
    expect(forms.children[0]).toMatchObject({ kind: "folder", label: "Text" });
  });

  it("buckets by section, sectionless first, sections first-seen", () => {
    const tree = buildTree([
      preview({ id: "loose" }),
      preview({ id: "card", section: "app" }),
      preview({ id: "button", section: "ui" }),
    ]);
    expect(tree.map((n) => n.kind)).toEqual(["story", "section", "section"]);
    expect(tree[1]).toMatchObject({ kind: "section", label: "app" });
    expect(tree[2]).toMatchObject({ kind: "section", label: "ui" });
  });

  it("orders direct components alpha, before folders (first-seen)", () => {
    const tree = buildTree([
      preview({ id: "zeta" }),
      preview({ id: "alpha" }),
      preview({ id: "x", group: "Forms" }),
    ]);
    expect(tree.map((n) => ("label" in n ? n.label : n.kind))).toEqual([
      "Alpha",
      "Zeta",
      "Forms",
    ]);
  });

  it("gives every node a stable unique id", () => {
    const tree = buildTree([
      preview({ id: "button", section: "ui", group: "Forms" }),
    ]);
    const ids: string[] = [];
    const walk = (ns: TreeNode[]) =>
      ns.forEach((n) => {
        ids.push(n.id);
        if ("children" in n) walk(n.children);
      });
    walk(tree);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("flatten", () => {
  it("includes children only for expanded containers", () => {
    const tree = buildTree([
      preview({
        id: "button",
        variants: [
          { id: "a", label: "A", props: {} },
          { id: "b", label: "B", props: {} },
        ],
      }),
    ]);
    const collapsed = flatten(tree, () => false).map((n) => n.kind);
    expect(collapsed).toEqual(["component"]);
    const expanded = flatten(tree, () => true).map((n) => n.kind);
    expect(expanded).toEqual(["component", "docs", "story", "story"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter openstory-desktop test -- build-tree`
Expected: FAIL — "Cannot find module './build-tree'".

- [ ] **Step 3: Implement**

```ts
// apps/desktop/src/components/sidebar/build-tree.ts
import type { ManifestPreview } from "../../../electron/types";

export type StoryLeaf = {
  kind: "story";
  id: string;
  label: string;
  componentId: string;
  variantId: string;
};
export type DocsLeaf = {
  kind: "docs";
  id: string;
  label: string;
  componentId: string;
};
export type ComponentNode = {
  kind: "component";
  id: string;
  label: string;
  componentId: string;
  children: Array<DocsLeaf | StoryLeaf>;
};
export type FolderNode = {
  kind: "folder";
  id: string;
  label: string;
  children: TreeNode[];
};
export type SectionNode = {
  kind: "section";
  id: string;
  label: string;
  children: TreeNode[];
};
export type TreeNode = SectionNode | FolderNode | ComponentNode | StoryLeaf | DocsLeaf;

// Containers can be collapsed; leaves cannot.
export function isContainer(
  node: TreeNode,
): node is SectionNode | FolderNode | ComponentNode {
  return node.kind === "section" || node.kind === "folder" || node.kind === "component";
}

function humanize(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function segments(group: string): string[] {
  return group
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

function componentNode(p: ManifestPreview): ComponentNode | StoryLeaf {
  // Single-variant hoist: the component IS its only story (no wrapper, no docs).
  if (p.variants.length <= 1) {
    const v = p.variants[0];
    return {
      kind: "story",
      id: `story:${p.id}:${v?.id ?? ""}`,
      label: humanize(p.id),
      componentId: p.id,
      variantId: v?.id ?? "",
    };
  }
  const docs: DocsLeaf = {
    kind: "docs",
    id: `docs:${p.id}`,
    label: "Documentation",
    componentId: p.id,
  };
  const stories: StoryLeaf[] = p.variants.map((v) => ({
    kind: "story",
    id: `story:${p.id}:${v.id}`,
    label: v.label,
    componentId: p.id,
    variantId: v.id,
  }));
  return {
    kind: "component",
    id: `component:${p.id}`,
    label: humanize(p.id),
    componentId: p.id,
    children: [docs, ...stories],
  };
}

type Item = { preview: ManifestPreview; segs: string[] };

// Build folders + components for one container, recursing on remaining segments.
// Direct (no-more-segments) components render first, alpha; folders follow, first-seen.
function container(items: Item[], idPrefix: string): TreeNode[] {
  const direct: ManifestPreview[] = [];
  const folderOrder: string[] = [];
  const folders = new Map<string, Item[]>();
  for (const { preview, segs } of items) {
    if (segs.length === 0) {
      direct.push(preview);
    } else {
      const head = segs[0]!;
      if (!folders.has(head)) {
        folders.set(head, []);
        folderOrder.push(head);
      }
      folders.get(head)!.push({ preview, segs: segs.slice(1) });
    }
  }
  const nodes: TreeNode[] = [];
  for (const p of [...direct].sort((a, b) => a.id.localeCompare(b.id))) {
    nodes.push(componentNode(p));
  }
  for (const name of folderOrder) {
    const fid = `${idPrefix}/folder:${name}`;
    nodes.push({
      kind: "folder",
      id: fid,
      label: name,
      children: container(folders.get(name)!, fid),
    });
  }
  return nodes;
}

/** Project the flat manifest into the sidebar tree. */
export function buildTree(manifest: ManifestPreview[]): TreeNode[] {
  const order: (string | null)[] = [];
  const bySection = new Map<string | null, ManifestPreview[]>();
  for (const p of manifest) {
    const s = p.section ?? null;
    if (!bySection.has(s)) {
      bySection.set(s, []);
      order.push(s);
    }
    bySection.get(s)!.push(p);
  }
  const roots: TreeNode[] = [];
  const toItems = (ps: ManifestPreview[]): Item[] =>
    ps.map((p) => ({ preview: p, segs: segments(p.group) }));
  // Sectionless bucket renders flat at the root, first.
  if (bySection.has(null)) {
    roots.push(...container(toItems(bySection.get(null)!), "root"));
  }
  for (const s of order) {
    if (s === null) continue;
    const id = `section:${s}`;
    roots.push({
      kind: "section",
      id,
      label: s,
      children: container(toItems(bySection.get(s)!), id),
    });
  }
  return roots;
}

/** Ordered list of currently-visible nodes (children shown only when expanded). */
export function flatten(nodes: TreeNode[], isExpanded: (id: string) => boolean): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      out.push(n);
      if (isContainer(n) && isExpanded(n.id)) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter openstory-desktop test -- build-tree`
Expected: PASS (build-tree + flatten suites).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/sidebar/build-tree.ts apps/desktop/src/components/sidebar/build-tree.test.ts
git commit -m "feat(desktop): pure build-tree projection with single-variant hoist"
```

---

## Task 7: `search` (exact-first ranking + tree filter)

**Files:**
- Create: `apps/desktop/src/components/sidebar/search.ts`
- Test: `apps/desktop/src/components/sidebar/search.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/desktop/src/components/sidebar/search.test.ts
import { describe, it, expect } from "vitest";
import { rank, filterTree } from "./search";
import { buildTree } from "./build-tree";
import type { ManifestPreview } from "../../../electron/types";

function preview(over: Partial<ManifestPreview> & { id: string }): ManifestPreview {
  return {
    id: over.id,
    group: over.group ?? "",
    section: over.section ?? null,
    background: "#fff",
    variants: over.variants ?? [{ id: "default", label: "Default", props: {} }],
    controls: [],
    sourcePath: null,
  };
}

describe("rank", () => {
  it("orders exact < prefix < substring < subsequence, null for no match", () => {
    expect(rank("button", "Button")).toBe(0); // exact (case-insensitive)
    expect(rank("but", "Button")).toBe(1); // prefix
    expect(rank("tto", "Button")).toBe(2); // substring
    expect(rank("bn", "Button")).toBe(3); // subsequence
    expect(rank("xyz", "Button")).toBeNull();
  });

  it("never buries an exact label below a fuzzy one", () => {
    const labels = ["ButtonGroup", "Button"];
    const sorted = labels
      .map((l) => ({ l, r: rank("button", l)! }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.l);
    expect(sorted[0]).toBe("Button");
  });
});

describe("filterTree", () => {
  it("keeps matched nodes + ancestors and marks ancestors to expand", () => {
    const tree = buildTree([
      preview({ id: "button", section: "ui", group: "Forms" }),
      preview({ id: "avatar", section: "ui" }),
    ]);
    const { nodes, expand } = filterTree(tree, "button");
    // Only the "ui" section survives, with Forms → Button; avatar pruned.
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ kind: "section", label: "ui" });
    expect(expand.has("section:ui")).toBe(true);
    expect(expand.has("section:ui/folder:Forms")).toBe(true);
  });

  it("returns the tree unchanged and empty expand set for an empty query", () => {
    const tree = buildTree([preview({ id: "button" })]);
    const { nodes, expand } = filterTree(tree, "");
    expect(nodes).toBe(tree);
    expect(expand.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter openstory-desktop test -- search`
Expected: FAIL — "Cannot find module './search'".

- [ ] **Step 3: Implement**

```ts
// apps/desktop/src/components/sidebar/search.ts
import { isContainer, type TreeNode } from "./build-tree";

function subsequence(q: string, t: string): boolean {
  let i = 0;
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] === q[i]) i++;
  }
  return i === q.length;
}

/**
 * Match rank for a label against a query: 0 exact, 1 prefix, 2 substring,
 * 3 subsequence, null no match. Lower is better — exact labels never get buried
 * under fuzzy ones (the Storybook #10757 fix).
 */
export function rank(query: string, label: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = label.toLowerCase();
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  if (t.includes(q)) return 2;
  if (subsequence(q, t)) return 3;
  return null;
}

/**
 * Prune the tree to nodes that match `query` (by label) or have a matching
 * descendant. Ancestors of matches are kept and returned in `expand` so the UI
 * auto-opens the path to every hit. Empty query → original tree, empty set.
 */
export function filterTree(
  nodes: TreeNode[],
  query: string,
): { nodes: TreeNode[]; expand: Set<string> } {
  if (!query) return { nodes, expand: new Set() };
  const expand = new Set<string>();

  function visit(node: TreeNode): TreeNode | null {
    const selfMatch = rank(query, node.label) !== null;
    if (!isContainer(node)) return selfMatch ? node : null;
    const kept = node.children
      .map(visit)
      .filter((c): c is TreeNode => c !== null);
    if (kept.length > 0) {
      expand.add(node.id);
      return { ...node, children: kept } as TreeNode;
    }
    return selfMatch ? node : null;
  }

  const out = nodes.map(visit).filter((n): n is TreeNode => n !== null);
  return { nodes: out, expand };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter openstory-desktop test -- search`
Expected: PASS (rank + filterTree suites).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/components/sidebar/search.ts apps/desktop/src/components/sidebar/search.test.ts
git commit -m "feat(desktop): exact-first sidebar search ranking + tree filter"
```

---

## Task 8: Add tree icons

**Files:**
- Modify: `apps/desktop/src/lib/icons.ts`

- [ ] **Step 1: Add component / docs / story glyphs**

Add these names to the existing re-export block in
`apps/desktop/src/lib/icons.ts` (alphabetical-ish, keep one per line):

```ts
  DashboardSquare01Icon,
  File01Icon,
  Bookmark02Icon,
```

(`DashboardSquare01Icon` = component grid, `File01Icon` = Documentation,
`Bookmark02Icon` = story — matching the Storybook reference glyphs.)

- [ ] **Step 2: Verify the icons resolve**

Run: `pnpm --filter openstory-desktop typecheck`
Expected: no NEW errors about these icon names (existing sidebar/right-panel
errors from earlier tasks may remain until Tasks 9–12).

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/lib/icons.ts
git commit -m "feat(desktop): add component/docs/story tree icons"
```

---

## Task 9: Collapse-state hook

**Files:**
- Create: `apps/desktop/src/components/sidebar/use-expanded.ts`

- [ ] **Step 1: Implement the hook**

```ts
// apps/desktop/src/components/sidebar/use-expanded.ts
import { useCallback, useEffect, useState } from "react";

// Collapse state is a pure UI concern — persisted in localStorage per repo so it
// survives reloads without IPC chatter. Default: everything expanded (a fresh
// tree reads as open, matching Storybook).
function storageKey(projectId: string | null): string {
  return `openstory:sidebar:collapsed:${projectId ?? "none"}`;
}

export function useExpanded(projectId: string | null) {
  // We store the COLLAPSED set (so unknown/new nodes default to expanded).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(projectId));
      setCollapsed(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setCollapsed(new Set());
    }
  }, [projectId]);

  const persist = useCallback(
    (next: Set<string>) => {
      setCollapsed(next);
      try {
        localStorage.setItem(storageKey(projectId), JSON.stringify([...next]));
      } catch {
        // Non-fatal: collapse state just won't persist this session.
      }
    },
    [projectId],
  );

  const isExpanded = useCallback((id: string) => !collapsed.has(id), [collapsed]);

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(collapsed);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist(next);
    },
    [collapsed, persist],
  );

  const setExpanded = useCallback(
    (id: string, expanded: boolean) => {
      const next = new Set(collapsed);
      if (expanded) next.delete(id);
      else next.add(id);
      persist(next);
    },
    [collapsed, persist],
  );

  return { isExpanded, toggle, setExpanded };
}
```

- [ ] **Step 2: Verify typecheck (renderer errors from later tasks may remain)**

Run: `pnpm --filter openstory-desktop typecheck`
Expected: no errors originating in `use-expanded.ts`.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/sidebar/use-expanded.ts
git commit -m "feat(desktop): per-repo collapse-state hook (localStorage)"
```

---

## Task 10: Repo switcher

**Files:**
- Create: `apps/desktop/src/components/sidebar/repo-switcher.tsx`

- [ ] **Step 1: Implement the switcher**

```tsx
// apps/desktop/src/components/sidebar/repo-switcher.tsx
import { useEffect, useRef, useState } from "react";
import type { AppState } from "../../../electron/types";
import type { Api } from "../../lib/api";
import { cn } from "../../lib/utils";
import {
  HugeiconsIcon,
  Folder01Icon,
  ArrowDown01Icon,
  FolderAddIcon,
  Cancel01Icon,
} from "../../lib/icons";

export function RepoSwitcher({ state, api }: { state: AppState; api: Api }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = state.projects.find((p) => p.id === state.selection.projectId);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  async function pickFolder() {
    setOpen(false);
    if (!api) return;
    const path = await api.invoke("project:pickFolder");
    if (path) {
      const record = await api.invoke("project:add", path);
      await api.invoke("project:select", record.id);
    }
  }

  return (
    <div ref={ref} className="no-drag relative px-3 pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-foreground/[0.04]"
      >
        <HugeiconsIcon icon={Folder01Icon} className="size-3.5 shrink-0 text-brand" />
        <span className="truncate">{active?.name ?? "No repository"}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute top-full right-3 left-3 z-20 mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-xl shadow-black/30">
          {state.projects.map((proj) => (
            <div key={proj.id} className="group relative flex items-center">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (proj.id !== state.selection.projectId) api?.invoke("project:select", proj.id);
                }}
                className={cn(
                  "flex h-8 flex-1 items-center gap-2 px-2.5 text-left text-[12px] transition-colors hover:bg-foreground/[0.05]",
                  proj.id === state.selection.projectId ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <HugeiconsIcon icon={Folder01Icon} className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{proj.name}</span>
              </button>
              <button
                type="button"
                title="Remove repository"
                onClick={() => api?.invoke("project:remove", proj.id)}
                className="absolute right-1 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/[0.08] hover:text-foreground group-hover:opacity-100"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={pickFolder}
            disabled={!api}
            className="flex h-8 w-full items-center gap-2 border-t border-border px-2.5 text-left text-[12px] text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <HugeiconsIcon icon={FolderAddIcon} className="size-3.5 shrink-0" />
            Add repository…
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck (sidebar.tsx errors remain until Task 12)**

Run: `pnpm --filter openstory-desktop typecheck`
Expected: no errors in `repo-switcher.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/sidebar/repo-switcher.tsx
git commit -m "feat(desktop): repo switcher dropdown"
```

---

## Task 11: Tree renderer

**Files:**
- Create: `apps/desktop/src/components/sidebar/tree.tsx`

- [ ] **Step 1: Implement the row renderer**

```tsx
// apps/desktop/src/components/sidebar/tree.tsx
import type { ActiveSelection } from "../../../electron/types";
import { cn } from "../../lib/utils";
import {
  HugeiconsIcon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  Folder01Icon,
  DashboardSquare01Icon,
  File01Icon,
  Bookmark02Icon,
} from "../../lib/icons";
import { isContainer, type TreeNode } from "./build-tree";

export type TreeCallbacks = {
  selection: ActiveSelection;
  focusedId: string | null;
  isExpanded: (id: string) => boolean;
  onToggle: (id: string) => void;
  onSelectStory: (componentId: string, variantId: string) => void;
  onSelectDocs: (componentId: string) => void;
  setFocusedId: (id: string) => void;
};

const INDENT = 12;

function isSelected(node: TreeNode, sel: ActiveSelection): boolean {
  if (node.kind === "story") {
    return (
      sel.docsComponentId === null &&
      sel.previewId === node.componentId &&
      sel.variantId === node.variantId
    );
  }
  if (node.kind === "docs") return sel.docsComponentId === node.componentId;
  return false;
}

function Row({ node, depth, cb }: { node: TreeNode; depth: number; cb: TreeCallbacks }) {
  const selected = isSelected(node, cb.selection);
  const focused = cb.focusedId === node.id;
  const expandable = isContainer(node);
  const open = expandable && cb.isExpanded(node.id);

  function activate() {
    cb.setFocusedId(node.id);
    if (node.kind === "story") cb.onSelectStory(node.componentId, node.variantId);
    else if (node.kind === "docs") cb.onSelectDocs(node.componentId);
    else cb.onToggle(node.id);
  }

  // Section headers are styled distinctly (uppercase, no icon).
  if (node.kind === "section") {
    return (
      <>
        <button
          type="button"
          onClick={activate}
          style={{ paddingLeft: 8 + depth * INDENT }}
          className={cn(
            "flex h-7 w-full items-center gap-1.5 pr-2 text-[10px] font-semibold tracking-[0.13em] uppercase transition-colors",
            focused ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <HugeiconsIcon
            icon={open ? ArrowDown01Icon : ArrowRight01Icon}
            className="size-3 shrink-0 opacity-60"
          />
          <span className="truncate">{node.label}</span>
        </button>
        {open && node.children.map((c) => <Row key={c.id} node={c} depth={depth + 1} cb={cb} />)}
      </>
    );
  }

  const icon =
    node.kind === "folder"
      ? Folder01Icon
      : node.kind === "component"
        ? DashboardSquare01Icon
        : node.kind === "docs"
          ? File01Icon
          : Bookmark02Icon;
  const iconColor =
    node.kind === "folder"
      ? "text-violet-500"
      : node.kind === "component"
        ? "text-brand"
        : node.kind === "docs"
          ? "text-amber-500"
          : "text-teal-500";

  return (
    <>
      <button
        type="button"
        onClick={activate}
        style={{ paddingLeft: 8 + depth * INDENT }}
        className={cn(
          "relative flex h-8 w-full items-center gap-1.5 rounded-lg pr-2 text-[12.5px] transition-colors",
          selected
            ? "bg-brand text-white"
            : focused
              ? "bg-foreground/[0.06] text-foreground"
              : "text-foreground/90 hover:bg-foreground/[0.04]",
        )}
      >
        {expandable ? (
          <HugeiconsIcon
            icon={open ? ArrowDown01Icon : ArrowRight01Icon}
            className={cn("size-3 shrink-0 opacity-60", selected && "opacity-90")}
          />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <HugeiconsIcon
          icon={icon}
          className={cn("size-3.5 shrink-0", selected ? "text-white" : iconColor)}
        />
        <span className="truncate">{node.label}</span>
      </button>
      {expandable &&
        open &&
        node.children.map((c) => <Row key={c.id} node={c} depth={depth + 1} cb={cb} />)}
    </>
  );
}

export function Tree({ nodes, cb }: { nodes: TreeNode[]; cb: TreeCallbacks }) {
  return (
    <div className="flex flex-col gap-0.5">
      {nodes.map((n) => (
        <Row key={n.id} node={n} depth={0} cb={cb} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck (sidebar.tsx still errors until Task 12)**

Run: `pnpm --filter openstory-desktop typecheck`
Expected: no errors in `tree.tsx`.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/sidebar/tree.tsx
git commit -m "feat(desktop): tree row renderer with kind icons + selection"
```

---

## Task 12: Sidebar container (switcher + search + tree + keyboard)

**Files:**
- Rewrite: `apps/desktop/src/components/sidebar.tsx`

- [ ] **Step 1: Replace the file contents**

```tsx
// apps/desktop/src/components/sidebar.tsx
import { useMemo, useState } from "react";
import type { AppState } from "../../electron/types";
import type { Api } from "../lib/api";
import { HugeiconsIcon, Search01Icon } from "../lib/icons";
import { RepoSwitcher } from "./sidebar/repo-switcher";
import { Tree, type TreeCallbacks } from "./sidebar/tree";
import { buildTree, flatten, isContainer } from "./sidebar/build-tree";
import { filterTree } from "./sidebar/search";
import { useExpanded } from "./sidebar/use-expanded";

export function Sidebar({
  state,
  api,
  onSelectPreview,
}: {
  state: AppState;
  api: Api;
  onSelectPreview: (previewId: string, variantId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const { isExpanded, toggle, setExpanded } = useExpanded(state.selection.projectId);

  const fullTree = useMemo(() => buildTree(state.manifest), [state.manifest]);
  const { nodes, expand } = useMemo(() => filterTree(fullTree, query), [fullTree, query]);

  // When searching, force-expand ancestors of matches; otherwise honor stored state.
  const expanded = (id: string) => (query ? expand.has(id) || isExpanded(id) : isExpanded(id));

  const cb: TreeCallbacks = {
    selection: state.selection,
    focusedId,
    isExpanded: expanded,
    onToggle: toggle,
    onSelectStory: (componentId, variantId) => onSelectPreview(componentId, variantId),
    onSelectDocs: (componentId) => api?.invoke("preview:setDocs", componentId),
    setFocusedId,
  };

  // Keyboard nav over the flattened visible list (the Storybook #13040 fix:
  // cursor walks visible nodes; expand/collapse never resets focus).
  function onKeyDown(e: React.KeyboardEvent) {
    const visible = flatten(nodes, expanded);
    if (visible.length === 0) return;
    const idx = visible.findIndex((n) => n.id === focusedId);
    const cur = idx >= 0 ? visible[idx]! : null;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = visible[Math.min(idx + 1, visible.length - 1)] ?? visible[0]!;
      setFocusedId(next.id);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = visible[Math.max(idx - 1, 0)] ?? visible[0]!;
      setFocusedId(prev.id);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (cur && isContainer(cur)) {
        if (!expanded(cur.id)) setExpanded(cur.id, true);
        else if (cur.children[0]) setFocusedId(cur.children[0].id);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (cur && isContainer(cur) && expanded(cur.id)) setExpanded(cur.id, false);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!cur) return;
      if (cur.kind === "story") onSelectPreview(cur.componentId, cur.variantId);
      else if (cur.kind === "docs") api?.invoke("preview:setDocs", cur.componentId);
      else toggle(cur.id);
    }
  }

  return (
    <aside className="flex w-[260px] flex-col border-r border-border bg-sidebar">
      <RepoSwitcher state={state} api={api} />

      <div className="no-drag px-3 pt-2.5 pb-2">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5">
          <HugeiconsIcon icon={Search01Icon} className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find components…"
            className="h-8 flex-1 bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="no-drag flex-1 overflow-y-auto px-1.5 pb-3 focus:outline-none"
      >
        {state.projects.length === 0 ? (
          <p className="px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Add a repository to load its OpenStory previews.
          </p>
        ) : nodes.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-muted-foreground">
            {query ? "No matches." : "No previews found in openstory.config.ts."}
          </p>
        ) : (
          <Tree nodes={nodes} cb={cb} />
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Update the call site in main-app**

In `apps/desktop/src/views/main-app.tsx`, change the `<Sidebar>` usage to drop
`activePreviewId` (selection is read from `state` now):

```tsx
        <Sidebar state={state} api={api} onSelectPreview={selectPreview} />
```

- [ ] **Step 3: Verify typecheck + build**

Run: `pnpm --filter openstory-desktop typecheck`
Expected: PASS for sidebar/main-app (right-panel may still error if its
`onSelectPreview` prop is unused — fixed in Task 14). If right-panel errors,
proceed; it is addressed next. Then:

Run: `pnpm --filter openstory-desktop build`
Expected: bundles without error (or only the right-panel prop error, fixed in Task 14).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/components/sidebar.tsx apps/desktop/src/views/main-app.tsx
git commit -m "feat(desktop): storybook-style sidebar tree, switcher, search, keyboard"
```

---

## Task 13: Docs stub view + canvas overlay

**Files:**
- Create: `apps/desktop/src/components/docs-stub.tsx`
- Modify: `apps/desktop/src/views/main-app.tsx`

- [ ] **Step 1: Create the stub**

```tsx
// apps/desktop/src/components/docs-stub.tsx
import { HugeiconsIcon, File01Icon } from "../lib/icons";

export function DocsStub({ componentName }: { componentName: string }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background p-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-card text-amber-500">
          <HugeiconsIcon icon={File01Icon} className="size-5" />
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-medium text-foreground">{componentName} · Documentation</p>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            The docs view arrives in area 6. For now, pick a story in the sidebar to render it on the canvas.
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Overlay it on the canvas when a Docs node is active**

In `apps/desktop/src/views/main-app.tsx`, import the stub and derive the active
docs component, then render the overlay inside the canvas `<div>` (keeps the
iframe mounted underneath, no reload):

```tsx
// add import
import { DocsStub } from "../components/docs-stub";
```

Compute near the existing `preview`/`variant` derivation:

```tsx
  const docsPreview = state.selection.docsComponentId
    ? state.manifest.find((p) => p.id === state.selection.docsComponentId)
    : undefined;
```

Wrap the canvas content `<div>` so the stub overlays it:

```tsx
          <div className="relative flex flex-1 items-center justify-center overflow-auto p-6">
            {state.iframeUrl ? (
              <div className="h-full w-full overflow-hidden rounded-xl border border-input bg-muted shadow-2xl shadow-black/50">
                <iframe
                  ref={iframeRef}
                  src={state.iframeUrl}
                  className="h-full w-full border-0 bg-transparent"
                />
              </div>
            ) : (
              <CanvasEmpty vite={state.vite} />
            )}
            {docsPreview && <DocsStub componentName={docsPreview.id} />}
          </div>
```

- [ ] **Step 3: Verify build**

Run: `pnpm --filter openstory-desktop build`
Expected: bundles (right-panel prop error may remain — Task 14).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/components/docs-stub.tsx apps/desktop/src/views/main-app.tsx
git commit -m "feat(desktop): docs-node stub overlay on the canvas"
```

---

## Task 14: Remove the right-panel Presets block

**Files:**
- Modify: `apps/desktop/src/components/right-panel.tsx:5,10-128`
- Modify: `apps/desktop/src/views/main-app.tsx` (`RightPanel` call)

- [ ] **Step 1: Drop the Presets section and its now-unused wiring**

In `apps/desktop/src/components/right-panel.tsx`:

- Remove `Layers01Icon` from the icon import (keep `SlidersHorizontalIcon`, `Copy01Icon`, `HugeiconsIcon`):

```tsx
import { HugeiconsIcon, SlidersHorizontalIcon, Copy01Icon } from "../lib/icons";
```

- In `RightPanel`, remove the `onSelectPreview` prop from the type and the call to
  `InspectPanel`:

```tsx
export function RightPanel({
  mode,
  state,
  api,
  preview,
  variant,
  onSetControl,
}: {
  mode: Exclude<PanelMode, null>;
  state: AppState;
  api: Api;
  preview: ManifestPreview;
  variant: Variant;
  onSetControl: (name: string, value: unknown) => void;
}) {
  return (
    <aside className="flex w-[320px] flex-col overflow-hidden border-l border-border bg-sidebar">
      {mode === "code" ? (
        <CodePanel state={state} api={api} preview={preview} variant={variant} />
      ) : (
        <InspectPanel
          state={state}
          preview={preview}
          variant={variant}
          onSetControl={onSetControl}
        />
      )}
    </aside>
  );
}
```

- Replace `InspectPanel` with a Controls-only version (delete the `Presets`
  `<section>` and the `onSelectPreview` param):

```tsx
function InspectPanel({
  state,
  preview,
  variant,
  onSetControl,
}: {
  state: AppState;
  preview: ManifestPreview;
  variant: Variant;
  onSetControl: (name: string, value: unknown) => void;
}) {
  return (
    <div className="flex flex-col gap-7 overflow-y-auto px-5 py-5">
      {preview.controls.length > 0 && variant ? (
        <section className="flex flex-col gap-3">
          <SectionHeader
            icon={<HugeiconsIcon icon={SlidersHorizontalIcon} className="size-3" />}
            title="Controls"
            subtitle="Tweak props live"
          />
          <div className="flex flex-col gap-4">
            {preview.controls.map((c) => {
              const value = state.selection.propOverrides[c.name] ?? variant.props[c.name];
              return (
                <label key={c.name} className="flex flex-col gap-1.5 text-[11px]">
                  <span className="font-medium text-muted-foreground">{c.name}</span>
                  {c.kind === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(e) => onSetControl(c.name, e.target.checked)}
                      className="size-4 accent-[var(--color-brand)]"
                    />
                  ) : c.kind === "number" ? (
                    <input
                      type="number"
                      value={typeof value === "number" ? value : ""}
                      onChange={(e) => {
                        const n = e.target.valueAsNumber;
                        if (!Number.isNaN(n)) onSetControl(c.name, n);
                      }}
                      className="h-8 rounded-lg border border-border bg-card px-2.5 text-[12px] text-foreground transition-colors focus-visible:border-brand/60 focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
                    />
                  ) : (
                    <input
                      type="text"
                      value={typeof value === "string" ? value : ""}
                      onChange={(e) => onSetControl(c.name, e.target.value)}
                      className="h-8 rounded-lg border border-border bg-card px-2.5 text-[12px] text-foreground transition-colors focus-visible:border-brand/60 focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
                    />
                  )}
                </label>
              );
            })}
          </div>
        </section>
      ) : (
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
          No editable controls for this story.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update the `RightPanel` call in main-app**

In `apps/desktop/src/views/main-app.tsx`, drop `onSelectPreview` from the
`<RightPanel>` props:

```tsx
        {preview && panelMode && (
          <RightPanel
            mode={panelMode}
            state={state}
            api={api}
            preview={preview}
            variant={variant}
            onSetControl={setControl}
          />
        )}
```

- [ ] **Step 3: Verify typecheck + build**

Run: `pnpm --filter openstory-desktop typecheck && pnpm --filter openstory-desktop build`
Expected: PASS (whole desktop app now type-clean and bundles).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/components/right-panel.tsx apps/desktop/src/views/main-app.tsx
git commit -m "refactor(desktop): drop right-panel presets (superseded by tree)"
```

---

## Task 15: Story leaves in the command palette

**Files:**
- Modify: `apps/desktop/src/components/command-palette.tsx:7-54,67-79`

- [ ] **Step 1: Extend items with per-story entries**

Replace the `Item` type and the `items` memo so each variant is a jumpable
result (matched on component id, group, section, and variant label), keeping the
repo-switch entries:

```tsx
type Item =
  | { kind: "story"; previewId: string; variantId: string; label: string; meta: string }
  | { kind: "repo"; id: string; label: string };
```

```tsx
  const items = useMemo<Item[]>(() => {
    const stories: Item[] = state.manifest.flatMap((p) =>
      p.variants
        .filter((v) =>
          fuzzy(query, `${p.id} ${v.label} ${p.group} ${p.section ?? ""}`),
        )
        .map((v) => ({
          kind: "story",
          previewId: p.id,
          variantId: v.id,
          label: `${p.id} · ${v.label}`,
          meta: p.section || p.group || "—",
        })),
    );
    const repos: Item[] = state.projects
      .filter((p) => p.id !== state.selection.projectId && fuzzy(query, p.name))
      .map((p) => ({ kind: "repo", id: p.id, label: p.name }));
    return [...stories, ...repos];
  }, [query, state.manifest, state.projects, state.selection.projectId]);
```

- [ ] **Step 2: Update `choose` and the row key/label**

```tsx
  function choose(item: Item) {
    if (item.kind === "story") {
      api?.invoke("preview:set", {
        previewId: item.previewId,
        variantId: item.variantId,
        viewport: state.selection.viewport,
      });
    } else {
      api?.invoke("project:select", item.id);
    }
    onClose();
  }
```

In the list render, update the `key` and the trailing meta/label to the new shape:

```tsx
              <button
                key={it.kind === "story" ? `s:${it.previewId}:${it.variantId}` : `r:${it.id}`}
                type="button"
                onMouseMove={() => setActive(i)}
                onClick={() => choose(it)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] transition-colors",
                  i === active ? "bg-brand-soft text-brand" : "text-foreground",
                )}
              >
                <HugeiconsIcon
                  icon={it.kind === "story" ? PackageIcon : Folder01Icon}
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="truncate">{it.label}</span>
                <span className="ml-auto shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">
                  {it.kind === "story" ? it.meta : "Switch repo"}
                </span>
              </button>
```

- [ ] **Step 3: Verify typecheck + build**

Run: `pnpm --filter openstory-desktop typecheck && pnpm --filter openstory-desktop build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/components/command-palette.tsx
git commit -m "feat(desktop): command palette lists story leaves"
```

---

## Task 16: Update e2e smoke for the new sidebar

**Files:**
- Modify: `apps/desktop/tests/smoke.test.ts:91-103`

- [ ] **Step 1: Replace the "Add repository…" test (it moved into the switcher dropdown)**

The repo accordion is gone; `Add repository…` now lives inside the switcher
dropdown, and a `Find components…` search input is always rendered. Replace the
existing `sidebar always offers "Add repository…"` test with two stable checks:

```ts
test("sidebar renders the repo switcher and component search", async () => {
  const { app, main } = await launchApp();
  try {
    // The search input is always rendered in the sidebar regardless of project state.
    await expect(main.getByPlaceholder("Find components…")).toBeVisible({ timeout: 8_000 });
  } finally {
    await app.close();
  }
});

test('repo switcher dropdown offers "Add repository…"', async () => {
  const { app, main } = await launchApp();
  try {
    // Open the switcher (first button in the <aside>), then assert the add action.
    await main.locator("aside button").first().click();
    await expect(main.locator("text=Add repository")).toBeVisible({ timeout: 8_000 });
  } finally {
    await app.close();
  }
});
```

- [ ] **Step 2: Run the full e2e suite**

Run: `pnpm --filter openstory-desktop test:e2e`
Expected: PASS — all smoke tests green (title, sidebar `<aside>`, `<main>`,
viewport toggles, ⌘K palette, pop-out, default-light theme, + the two new sidebar
tests).

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/tests/smoke.test.ts
git commit -m "test(desktop): smoke coverage for repo switcher + sidebar search"
```

---

## Task 17: Full verification + north-star update

**Files:**
- Modify: `docs/superpowers/specs/2026-06-03-storybook-parity-north-star.md` (status board)

- [ ] **Step 1: Run every check across the monorepo**

Run: `pnpm -w typecheck && pnpm -w test`
Expected: PASS — vite-plugin (derive-section, plugin), config, runtime, and the
new desktop unit suites (build-tree, search) all green.

Run: `pnpm --filter openstory-desktop test:e2e`
Expected: PASS.

- [ ] **Step 2: Manual smoke (real app)**

Run: `pnpm --filter openstory-desktop dev`
Verify by hand against `examples/linkedin-starter`:
- Repo switcher shows the active repo; dropdown lists repos + Add repository….
- Tree shows section(s) → component → Documentation + story leaves; single-variant
  components appear as a single hoisted leaf (no expand arrow).
- Selecting a story renders it on the canvas; selecting Documentation shows the stub.
- `Find components…` filters; exact label ranks first; ancestors auto-expand.
- ↑/↓ move the cursor, →/← expand/collapse, Enter selects; no scroll jump.
- Reload the app (Cmd-R) — collapse state persists.

- [ ] **Step 3: Flip the status board to done**

In `docs/superpowers/specs/2026-06-03-storybook-parity-north-star.md`, change the
area-2 row status from `in-progress` to `done`.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-06-03-storybook-parity-north-star.md
git commit -m "docs: mark storybook-parity area 2 (sidebar + nav tree) done"
```

---

## Notes for the implementer

- **Run order matters:** Tasks 3–4 (types/IPC) intentionally leave the renderer
  type-broken until Tasks 12/14 fix call sites. Don't "fix" intermediate type
  errors outside the task that owns them.
- **Semantic tokens:** new UI uses existing token classes (`bg-card`, `border-border`,
  `text-muted-foreground`, `bg-brand`, `text-foreground`) from area 1. The icon
  accent colors (`text-violet-500`, `text-amber-500`, `text-teal-500`, `text-brand`)
  mirror the Storybook reference; if a token equivalent exists, prefer it.
- **No new manifest entity for components/docs:** a component is a `ManifestPreview`;
  the Docs node is synthetic. Don't add manifest fields for them.
- **pnpm filters:** `openstory-desktop` (app), `@gobrand/openstory-vite` (plugin).
  `pnpm -w` runs at the workspace root via turbo.
- **Verify icon exports (Task 8):** before using `DashboardSquare01Icon`,
  `File01Icon`, `Bookmark02Icon`, confirm those exact names exist in
  `@hugeicons/core-free-icons` (e.g. `node -e "console.log(Object.keys(require('@hugeicons/core-free-icons')).filter(n=>/Dashboard|File0|Bookmark/.test(n)))"`).
  If an export differs (e.g. `Bookmark01Icon`), use the nearest matching glyph and
  keep the same role (component grid / document / bookmark).
