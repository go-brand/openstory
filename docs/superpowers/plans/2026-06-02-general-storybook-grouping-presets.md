# General Workbench: `group` + `preset` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fixed social `platform` enum with a free-form nested `group` (sidebar hierarchy) plus an open `preset` registry (viewport + chrome background), so any component can be previewed with zero platform tax while social previews keep working as presets.

**Architecture:** `packages/config` becomes the single source of truth: it defines the `Preset` type, the built-in preset registry (8 social presets + a neutral `default`), and pure resolver functions. The vite-plugin resolves `preset`→`{viewport, background}` at manifest-build time so the renderer and Electron app consume already-resolved values. Authoring drops `platform`, gains optional `group`/`preset`. The sidebar renders a recursive tree from slash-delimited group paths.

**Tech Stack:** TypeScript, React 19, Vite, Electron, Vitest, pnpm workspaces, Turborepo.

**Spec:** [`docs/superpowers/specs/2026-06-02-general-storybook-grouping-presets-design.md`](../specs/2026-06-02-general-storybook-grouping-presets-design.md)
**North star:** [`docs/north-star.md`](../../north-star.md)

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `packages/config/src/presets.ts` | `Preset` type, `BUILTIN_PRESETS`, `DEFAULT_BACKGROUND`, `resolvePresets`, `resolveRender` | **create** |
| `packages/config/src/presets.test.ts` | Unit tests for preset merge + render resolution | **create** |
| `packages/config/src/define.ts` | Drop `Platform`/`platform`; add `group?`/`preset?`; add `presets?` on config | modify |
| `packages/config/src/index.ts` | Export preset API; drop `Platform` | modify |
| `packages/vite-plugin/src/plugin.ts` | `buildManifest` emits `group` + `background`, drops `platform` | modify |
| `packages/vite-plugin/src/plugin.test.ts` | Update manifest expectations | modify |
| `packages/runtime/src/bridge.ts` | `ManifestMessage` previews: `platform`→`group` | modify |
| `packages/runtime/src/preview-host.tsx` | Resolve width via presets, drop `DEFAULT_PLATFORM_WIDTHS`/`platform` | modify |
| `apps/desktop/electron/types.ts` | `ManifestPreview`: `platform`→`group`+`background` | modify |
| `apps/desktop/src/components/sidebar.tsx` | Recursive group tree (ungrouped-first) | modify |
| `apps/desktop/src/components/command-palette.tsx` | Search/meta by `group` | modify |
| `apps/desktop/src/views/detached-preview.tsx` | Background from manifest, drop `PLATFORM_BG` | modify |
| `packages/platforms/src/types.ts` | Drop `Platform` dep (`platform: Platform`→`name: string`) | modify |
| `packages/platforms/src/linkedin/index.ts` | `platform: 'linkedin'`→`name: 'linkedin'` | modify |
| `examples/linkedin-starter/src/previews/linkedin.stories.ts` | `platform`→`group`+`preset` | modify |

**Build order:** config (types + presets) → vite-plugin → runtime → electron types → desktop UI → platforms pkg → example. Each task is independently committable; the workspace will only fully typecheck after the config + downstream type swaps land, so tasks are ordered to keep each package's own tests green as you go.

---

## Task 1: Preset registry + resolvers (`packages/config`)

**Files:**
- Create: `packages/config/src/presets.ts`
- Test: `packages/config/src/presets.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/config/src/presets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  BUILTIN_PRESETS,
  DEFAULT_BACKGROUND,
  resolvePresets,
  resolveRender,
} from "./presets.js";

describe("resolvePresets", () => {
  it("returns the built-ins when no user presets given", () => {
    expect(resolvePresets()).toEqual(BUILTIN_PRESETS);
  });

  it("merges user presets over built-ins (user wins on name clash)", () => {
    const merged = resolvePresets({
      dashboard: { viewport: { desktop: { width: 1280 } } },
      linkedin: { viewport: { desktop: { width: 999 } } },
    });
    expect(merged.dashboard?.viewport.desktop.width).toBe(1280);
    expect(merged.linkedin?.viewport.desktop.width).toBe(999);
    expect(merged.x).toEqual(BUILTIN_PRESETS.x);
  });
});

describe("resolveRender", () => {
  const presets = resolvePresets();

  it("uses the default preset when no preset named", () => {
    const r = resolveRender({}, presets);
    expect(r.viewport.desktop.width).toBe(600);
    expect(r.viewport.mobile.width).toBe(360);
    expect(r.background).toBe(DEFAULT_BACKGROUND);
  });

  it("uses a named preset's viewport and background", () => {
    const r = resolveRender({ preset: "linkedin" }, presets);
    expect(r.viewport.desktop.width).toBe(552);
    expect(r.background).toBe("#f3f2ef");
  });

  it("explicit viewports override the preset", () => {
    const r = resolveRender(
      { preset: "linkedin", viewports: { desktop: { width: 700, dpr: 2 } } },
      presets,
    );
    expect(r.viewport.desktop).toEqual({ width: 700, dpr: 2 });
    expect(r.background).toBe("#f3f2ef"); // background still from preset
  });

  it("falls back to default mobile when preset has none", () => {
    const custom = resolvePresets({ tall: { viewport: { desktop: { width: 800 } } } });
    const r = resolveRender({ preset: "tall" }, custom);
    expect(r.viewport.mobile.width).toBe(360);
  });

  it("falls back to the default preset for an unknown preset name", () => {
    const r = resolveRender({ preset: "does-not-exist" }, presets);
    expect(r.viewport.desktop.width).toBe(600);
    expect(r.background).toBe(DEFAULT_BACKGROUND);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-config test -- presets`
Expected: FAIL — `Cannot find module './presets.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/config/src/presets.ts`:

```ts
import type { Viewport } from "./define.js";

/**
 * A named render preset: the canvas width(s) a preview renders at and the
 * chrome background painted behind it. Social platforms ship as built-in
 * presets; users add their own in `openstory.config.ts`.
 */
export type Preset = {
  viewport: { desktop: Viewport; mobile?: Viewport };
  chrome?: { background?: string };
};

/** Neutral canvas behind components with no preset — light enough that white
 *  components show a visible edge, dark enough to read as intentional. */
export const DEFAULT_BACKGROUND = "#f4f4f5";

/**
 * Built-in presets. `default` is used when a preview names no preset. The eight
 * social presets carry the canonical post widths and background colors that used
 * to live in `DEFAULT_PLATFORM_WIDTHS` (runtime) and `PLATFORM_BG` (desktop).
 */
export const BUILTIN_PRESETS: Record<string, Preset> = {
  default: { viewport: { desktop: { width: 600 }, mobile: { width: 360 } }, chrome: { background: DEFAULT_BACKGROUND } },
  linkedin: { viewport: { desktop: { width: 552 }, mobile: { width: 360 } }, chrome: { background: "#f3f2ef" } },
  x: { viewport: { desktop: { width: 600 }, mobile: { width: 360 } }, chrome: { background: "#000000" } },
  instagram: { viewport: { desktop: { width: 470 }, mobile: { width: 360 } }, chrome: { background: "#fafafa" } },
  tiktok: { viewport: { desktop: { width: 540 }, mobile: { width: 360 } }, chrome: { background: "#000000" } },
  threads: { viewport: { desktop: { width: 600 }, mobile: { width: 360 } }, chrome: { background: "#101010" } },
  facebook: { viewport: { desktop: { width: 524 }, mobile: { width: 360 } }, chrome: { background: "#f0f2f5" } },
  youtube: { viewport: { desktop: { width: 720 }, mobile: { width: 360 } }, chrome: { background: "#0f0f0f" } },
  bluesky: { viewport: { desktop: { width: 600 }, mobile: { width: 360 } }, chrome: { background: "#ffffff" } },
};

/** Merge user-defined presets over the built-ins (user wins on name clash). */
export function resolvePresets(userPresets?: Record<string, Preset>): Record<string, Preset> {
  return { ...BUILTIN_PRESETS, ...userPresets };
}

/** A fully-resolved render block: concrete widths per viewport + background. */
export type ResolvedRender = {
  viewport: { desktop: Viewport; mobile: Viewport };
  background: string;
};

/**
 * Resolve a preview's render block. Resolution order per viewport:
 * explicit `viewports` > named `preset` > `default` preset.
 */
export function resolveRender(
  preview: { preset?: string; viewports?: Partial<Record<"desktop" | "mobile", Viewport>> },
  presets: Record<string, Preset>,
): ResolvedRender {
  const fallback = presets.default ?? BUILTIN_PRESETS.default!;
  const preset = (preview.preset && presets[preview.preset]) || fallback;
  const desktop = preview.viewports?.desktop ?? preset.viewport.desktop;
  const mobile = preview.viewports?.mobile ?? preset.viewport.mobile ?? fallback.viewport.mobile!;
  const background = preset.chrome?.background ?? DEFAULT_BACKGROUND;
  return { viewport: { desktop, mobile }, background };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-config test -- presets`
Expected: PASS (all 7 assertions).

- [ ] **Step 5: Commit**

```bash
git add packages/config/src/presets.ts packages/config/src/presets.test.ts
git commit -m "feat(config): preset registry + render resolver"
```

---

## Task 2: Swap `platform` → `group`/`preset` in the authoring types

**Files:**
- Modify: `packages/config/src/define.ts`
- Modify: `packages/config/src/index.ts`

- [ ] **Step 1: Remove the `Platform` type**

In `packages/config/src/define.ts`, delete the entire `Platform` union (lines 9–17):

```ts
export type Platform =
  | "linkedin"
  | "x"
  | "instagram"
  | "tiktok"
  | "threads"
  | "facebook"
  | "youtube"
  | "bluesky";
```

- [ ] **Step 2: Update `PreviewDef`**

In `PreviewDef`, replace `platform: Platform;` with:

```ts
  /** Slash-delimited sidebar path, e.g. "Design System/Forms/Button". Omit to
   *  place the preview at the sidebar root, labeled by component name. */
  group?: string;
  /** Named render preset (viewport + chrome). Omit for the neutral default. */
  preset?: string;
```

- [ ] **Step 3: Update `RegisteredPreview`**

In `RegisteredPreview`, replace `platform: Platform;` with:

```ts
  group?: string;
  preset?: string;
```

- [ ] **Step 4: Update `OpenStoryConfig`**

Add `presets` to `OpenStoryConfig` and import the `Preset` type. At the top of the file, after the existing import block, add:

```ts
import type { Preset } from "./presets.js";
```

In `OpenStoryConfig`, add after `styles?: string[];`:

```ts
  /** User-defined render presets, merged over the built-ins. */
  presets?: Record<string, Preset>;
```

- [ ] **Step 5: Update `StoriesDef`**

In `StoriesDef`, replace `platform: Platform;` (and its doc comment `/** Which social platform this maps to. */`) with:

```ts
  /** Slash-delimited sidebar path. Omit to place at the sidebar root. */
  group?: string;
  /** Named render preset (viewport + chrome). Omit for the neutral default. */
  preset?: string;
```

- [ ] **Step 6: Update `defineStories` to copy the new fields**

In `defineStories`, find the `result` construction (currently sets `platform: def.platform`). Replace:

```ts
  const result: RegisteredPreview = {
    id: def.id ?? autoId,
    platform: def.platform,
    component: def.component as unknown as ComponentType<never>,
    fixtures,
  };
```

with:

```ts
  const result: RegisteredPreview = {
    id: def.id ?? autoId,
    component: def.component as unknown as ComponentType<never>,
    fixtures,
  };
  if (def.group !== undefined) result.group = def.group;
  if (def.preset !== undefined) result.preset = def.preset;
```

- [ ] **Step 7: Update the barrel exports**

In `packages/config/src/index.ts`, remove the `type Platform,` line and add preset exports. The file becomes:

```ts
export {
  defineOpenStoryConfig,
  defineStories,
  deriveControls,
  type Fixture,
  type ManifestControl,
  type PreviewDef,
  type OpenStoryConfig,
  type RegisteredPreview,
  type StoriesDef,
  type Story,
  type Viewport,
} from './define.js';
export {
  BUILTIN_PRESETS,
  DEFAULT_BACKGROUND,
  resolvePresets,
  resolveRender,
  type Preset,
  type ResolvedRender,
} from './presets.js';
```

- [ ] **Step 8: Typecheck the config package**

Run: `pnpm --filter @gobrand/openstory-config build`
Expected: PASS (tsc emits, no errors). If it reports an unused `Platform` import anywhere in the package, that's a downstream file — leave it for its task.

- [ ] **Step 9: Commit**

```bash
git add packages/config/src/define.ts packages/config/src/index.ts
git commit -m "feat(config): replace platform enum with group + preset fields"
```

---

## Task 3: `buildManifest` emits `group` + `background`

**Files:**
- Modify: `packages/vite-plugin/src/plugin.ts:72-88`
- Modify: `packages/vite-plugin/src/plugin.test.ts`

- [ ] **Step 1: Update the failing tests first**

In `packages/vite-plugin/src/plugin.test.ts`, every fixture uses `platform: "linkedin"`. Rewrite the `buildManifest` describe block so fixtures use `group`/`preset` and expectations carry `group` + `background`. Replace the first test (`"emits variants with props and inferred controls"`) body:

```ts
  it("emits variants with props and inferred controls", () => {
    const config = defineOpenStoryConfig({
      previews: [
        {
          id: "linkedin",
          group: "LinkedIn",
          preset: "linkedin",
          component: () => null,
          fixtures: [
            { id: "a", label: "A", props: { text: "hi", dark: true } },
            { id: "b", label: "B", props: { text: "yo" } },
          ],
        },
      ],
    });
    const manifest = buildManifest(config);
    expect(manifest.previews[0]).toEqual({
      id: "linkedin",
      group: "LinkedIn",
      background: "#f3f2ef",
      variants: [
        { id: "a", label: "A", props: { text: "hi", dark: true } },
        { id: "b", label: "B", props: { text: "yo" } },
      ],
      controls: deriveControls(config.previews[0].fixtures),
      sourcePath: null,
    });
  });
```

In the remaining four `buildManifest` tests, delete every `platform: "linkedin",` line. For the two tests that assert a full preview object via `toEqual` — `"emits empty variants and controls for a preview with zero fixtures"` — update the expected object to include `group` + `background` and drop `platform`:

```ts
    expect(buildManifest(config).previews[0]).toEqual({
      id: "linkedin",
      group: "",
      background: "#f4f4f5",
      variants: [],
      controls: [],
      sourcePath: null,
    });
```

(The two `sourcePath` tests assert only `.sourcePath`, so removing their `platform:` fixture line is enough. The empty-config test is unchanged.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @gobrand/openstory-vite test -- plugin`
Expected: FAIL — manifest objects still contain `platform`, missing `group`/`background`.

- [ ] **Step 3: Update `buildManifest`**

In `packages/vite-plugin/src/plugin.ts`, add `resolvePresets, resolveRender` to the config import:

```ts
import { deriveControls, resolvePresets, resolveRender } from "@gobrand/openstory-config";
```

Replace the `buildManifest` function body:

```ts
export function buildManifest(config: OpenStoryConfig, projectRoot?: string) {
  const presets = resolvePresets(config.presets);
  return {
    previews: config.previews.map((p) => {
      const render = resolveRender(p, presets);
      return {
        id: p.id,
        group: p.group ?? "",
        background: render.background,
        variants: p.fixtures.map((f) => ({
          id: f.id,
          label: f.label,
          props: f.props,
        })),
        controls: deriveControls(p.fixtures),
        // Project-root-relative `sourcePath` resolved to an absolute path so the
        // desktop app can fs-read it for the Code panel. null when unset.
        sourcePath: p.sourcePath && projectRoot ? resolve(projectRoot, p.sourcePath) : null,
      };
    }),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @gobrand/openstory-vite test -- plugin`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vite-plugin/src/plugin.ts packages/vite-plugin/src/plugin.test.ts
git commit -m "feat(vite-plugin): manifest emits group + resolved background"
```

---

## Task 4: Bridge `ManifestMessage` carries `group`

**Files:**
- Modify: `packages/runtime/src/bridge.ts:13-20`

- [ ] **Step 1: Update the type**

In `packages/runtime/src/bridge.ts`, replace the `ManifestMessage` previews item shape:

```ts
export type ManifestMessage = {
  type: 'pl:manifest';
  previews: Array<{
    id: string;
    group: string;
    variants: Array<{ id: string; label: string }>;
  }>;
};
```

- [ ] **Step 2: Typecheck the runtime package**

Run: `pnpm --filter @gobrand/openstory-runtime build`
Expected: FAIL — `preview-host.tsx` still sets `platform: p.platform`. Fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add packages/runtime/src/bridge.ts
git commit -m "feat(runtime): manifest message carries group instead of platform"
```

---

## Task 5: Preview host resolves width via presets

**Files:**
- Modify: `packages/runtime/src/preview-host.tsx`

- [ ] **Step 1: Update imports**

In `packages/runtime/src/preview-host.tsx`, extend the config import to pull in the resolver:

```ts
import {
  resolvePresets,
  resolveRender,
  type OpenStoryConfig,
  type PreviewDef,
  type Fixture,
} from '@gobrand/openstory-config';
```

- [ ] **Step 2: Delete `DEFAULT_PLATFORM_WIDTHS`**

Remove the entire `DEFAULT_PLATFORM_WIDTHS` const (lines 36–48).

- [ ] **Step 3: Resolve width from presets in `PreviewStage`**

Replace the viewport/width resolution block:

```ts
  const viewportOverride = preview.viewports?.[selection.viewport];
  const defaultWidth =
    DEFAULT_PLATFORM_WIDTHS[preview.platform]?.[selection.viewport] ?? 600;
  const width = viewportOverride?.width ?? defaultWidth;
```

with:

```ts
  const presets = resolvePresets(config.presets);
  const render = resolveRender(preview, presets);
  const width = render.viewport[selection.viewport].width;
```

(`width` preserves the existing computed value; it stays available for the stage to apply as before.)

- [ ] **Step 4: Drop `platform` from the posted manifest**

In the manifest `useEffect`, replace the `previews` map:

```ts
      previews: config.previews.map((p) => ({
        id: p.id,
        group: p.group ?? '',
        variants: p.fixtures.map((f) => ({ id: f.id, label: f.label })),
      })),
```

- [ ] **Step 5: Typecheck the runtime package**

Run: `pnpm --filter @gobrand/openstory-runtime build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/runtime/src/preview-host.tsx
git commit -m "feat(runtime): resolve preview width via preset registry"
```

---

## Task 6: Electron manifest type — `group` + `background`

**Files:**
- Modify: `apps/desktop/electron/types.ts:29-41`

- [ ] **Step 1: Update `ManifestPreview`**

Replace `platform: string;` in `ManifestPreview` with:

```ts
  /** Slash-delimited sidebar path. "" means the sidebar root. */
  group: string;
  /** Resolved chrome background for this preview's preset. */
  background: string;
```

- [ ] **Step 2: Typecheck the desktop app**

Run: `pnpm --filter @gobrand/openstory-desktop exec tsc --noEmit`
Expected: FAIL — `sidebar.tsx`, `command-palette.tsx`, `detached-preview.tsx` still read `.platform`. Fixed in Tasks 7–9.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/electron/types.ts
git commit -m "feat(desktop): manifest preview carries group + background"
```

---

## Task 7: Sidebar — recursive group tree (ungrouped-first)

**Files:**
- Modify: `apps/desktop/src/components/sidebar.tsx`

- [ ] **Step 1: Replace `groupByPlatform` with a tree builder**

At the bottom of `apps/desktop/src/components/sidebar.tsx`, delete `groupByPlatform` and add a tree model + builder:

```ts
type GroupNode = {
  name: string;
  path: string;
  children: GroupNode[];
  previews: AppState["manifest"];
};

// Build a nested tree from slash-delimited `group` paths. Previews with an
// empty group are returned separately as root-level leaves (rendered first).
function buildGroupTree(manifest: AppState["manifest"]): {
  ungrouped: AppState["manifest"];
  roots: GroupNode[];
} {
  const ungrouped: AppState["manifest"] = [];
  const roots: GroupNode[] = [];

  function childByName(list: GroupNode[], name: string, path: string): GroupNode {
    let node = list.find((n) => n.name === name);
    if (!node) {
      node = { name, path, children: [], previews: [] };
      list.push(node);
    }
    return node;
  }

  for (const p of manifest) {
    const segments = (p.group ?? "").split("/").map((s) => s.trim()).filter(Boolean);
    if (segments.length === 0) {
      ungrouped.push(p);
      continue;
    }
    let level = roots;
    let acc = "";
    let node: GroupNode | null = null;
    for (const seg of segments) {
      acc = acc ? `${acc}/${seg}` : seg;
      node = childByName(level, seg, acc);
      level = node.children;
    }
    node!.previews.push(p);
  }

  return { ungrouped, roots };
}
```

- [ ] **Step 2: Add a recursive group renderer**

Above the `Sidebar` export, add a recursive component that renders a node and its descendants. It reuses the existing preview-button markup:

```ts
function GroupTree({
  nodes,
  depth,
  activePreviewId,
  onSelectPreview,
}: {
  nodes: GroupNode[];
  depth: number;
  activePreviewId: string | undefined;
  onSelectPreview: (previewId: string, variantId: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.path} className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-1" style={{ paddingLeft: depth * 8 }}>
            <span className="text-[10px] font-medium tracking-[0.14em] text-neutral-500 uppercase">
              {node.name}
            </span>
            {node.previews.length > 0 && (
              <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-medium text-neutral-500 tabular-nums">
                {node.previews.length}
              </span>
            )}
          </div>
          {node.previews.map((p) => (
            <PreviewButton
              key={p.id}
              preview={p}
              selected={p.id === activePreviewId}
              onSelectPreview={onSelectPreview}
            />
          ))}
          {node.children.length > 0 && (
            <GroupTree
              nodes={node.children}
              depth={depth + 1}
              activePreviewId={activePreviewId}
              onSelectPreview={onSelectPreview}
            />
          )}
        </div>
      ))}
    </>
  );
}

function PreviewButton({
  preview,
  selected,
  onSelectPreview,
}: {
  preview: AppState["manifest"][number];
  selected: boolean;
  onSelectPreview: (previewId: string, variantId: string) => void;
}) {
  return (
    <Button
      variant={selected ? "active" : "ghost"}
      size="sm"
      className="relative h-8 w-full justify-start pl-3"
      onClick={() => onSelectPreview(preview.id, preview.variants[0]?.id ?? "")}
    >
      {selected && (
        <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-accent" />
      )}
      {preview.id}
    </Button>
  );
}
```

- [ ] **Step 3: Use the tree in `Sidebar`**

Replace `const groups = groupByPlatform(state.manifest);` with:

```ts
  const tree = buildGroupTree(state.manifest);
```

Then replace the previews render block (the `groups.map(...)` inside the `isActive &&` section, currently lines ~96–126) with ungrouped-first rendering:

```ts
                    ) : (
                      <>
                        {tree.ungrouped.map((p) => (
                          <PreviewButton
                            key={p.id}
                            preview={p}
                            selected={p.id === activePreviewId}
                            onSelectPreview={onSelectPreview}
                          />
                        ))}
                        <GroupTree
                          nodes={tree.roots}
                          depth={0}
                          activePreviewId={activePreviewId}
                          onSelectPreview={onSelectPreview}
                        />
                      </>
                    )}
```

- [ ] **Step 4: Update the stale comment**

Change the file-top comment "its platform-grouped previews render beneath it" to "its grouped previews render beneath it (ungrouped first, then the group tree)".

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @gobrand/openstory-desktop exec tsc --noEmit`
Expected: `sidebar.tsx` clean (palette + detached still error — next tasks).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/sidebar.tsx
git commit -m "feat(desktop): recursive group tree sidebar, ungrouped first"
```

---

## Task 8: Command palette — search/meta by `group`

**Files:**
- Modify: `apps/desktop/src/components/command-palette.tsx:39-47`

- [ ] **Step 1: Update the previews mapping**

In `command-palette.tsx`, replace the `previews` builder so it searches and labels by `group` (falling back to a dash when ungrouped):

```ts
    const previews: Item[] = state.manifest
      .filter((p) => fuzzy(query, `${p.id} ${p.group}`))
      .map((p) => ({
        kind: "preview",
        id: p.id,
        label: p.id,
        meta: p.group || "—",
      }));
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @gobrand/openstory-desktop exec tsc --noEmit`
Expected: `command-palette.tsx` clean (detached still errors — next task).

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/command-palette.tsx
git commit -m "feat(desktop): command palette searches by group"
```

---

## Task 9: Detached preview — background from manifest

**Files:**
- Modify: `apps/desktop/src/views/detached-preview.tsx:9-32`

- [ ] **Step 1: Delete `PLATFORM_BG` and read from the manifest**

Remove the `PLATFORM_BG` const (lines 9–18). Replace the background lookup:

```ts
  const preview =
    state.manifest.find((p) => p.id === state.selection.previewId) ?? state.manifest[0];
  const platformBg = (preview && PLATFORM_BG[preview.platform]) ?? "#f3f2ef";
```

with:

```ts
  const preview =
    state.manifest.find((p) => p.id === state.selection.previewId) ?? state.manifest[0];
  const canvasBg = preview?.background ?? "#f4f4f5";
```

- [ ] **Step 2: Use the renamed variable**

In `canvasStyle`, change `background: platformBg,` to `background: canvasBg,`.

- [ ] **Step 3: Typecheck the whole desktop app**

Run: `pnpm --filter @gobrand/openstory-desktop exec tsc --noEmit`
Expected: PASS (no remaining `platform` references).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/views/detached-preview.tsx
git commit -m "feat(desktop): detached preview background from resolved preset"
```

---

## Task 10: Drop `Platform` from the platforms package

**Files:**
- Modify: `packages/platforms/src/types.ts:1,15`
- Modify: `packages/platforms/src/linkedin/index.ts:7`

- [ ] **Step 1: Remove the `Platform` import + field**

In `packages/platforms/src/types.ts`, change the import line:

```ts
import type { Viewport } from '@gobrand/openstory-config';
```

and in `PlatformMetadata`, change `platform: Platform;` to:

```ts
  name: string;
```

- [ ] **Step 2: Update the linkedin metadata**

In `packages/platforms/src/linkedin/index.ts`, change `platform: 'linkedin',` to `name: 'linkedin',`.

- [ ] **Step 3: Build the platforms package**

Run: `pnpm --filter @gobrand/openstory-platforms build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/platforms/src/types.ts packages/platforms/src/linkedin/index.ts
git commit -m "refactor(platforms): drop removed Platform type"
```

---

## Task 11: Migrate the example to `group` + `preset`

**Files:**
- Modify: `examples/linkedin-starter/src/previews/linkedin.stories.ts:22`

- [ ] **Step 1: Replace `platform` with `group` + `preset`**

In `examples/linkedin-starter/src/previews/linkedin.stories.ts`, change:

```ts
  component: LinkedinPreview,
  platform: "linkedin",
  sourcePath: "./src/previews/linkedin.tsx",
```

to:

```ts
  component: LinkedinPreview,
  group: "LinkedIn",
  preset: "linkedin",
  sourcePath: "./src/previews/linkedin.tsx",
```

(The explicit `viewports: { desktop: { width: 552, dpr: 2 }, mobile: { width: 360, dpr: 3 } }` stays — it overrides the preset to keep the existing dpr.)

- [ ] **Step 2: Verify the example typechecks**

Run: `pnpm --filter linkedin-starter exec tsc --noEmit` (or the example's typecheck script if it differs — check `examples/linkedin-starter/package.json`).
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add examples/linkedin-starter/src/previews/linkedin.stories.ts
git commit -m "feat(example): migrate linkedin starter to group + preset"
```

---

## Task 12: Full workspace verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck + build the whole workspace**

Run: `pnpm -r build`
Expected: PASS for every package.

- [ ] **Step 2: Run all tests**

Run: `pnpm -r test`
Expected: PASS — config (presets), vite-plugin (manifest), and the desktop smoke test (`apps/desktop/tests/smoke.test.ts`) all green. The smoke test does not reference `platform`, so it should need no change; if it fails, read the failure and fix the assertion to the new manifest shape.

- [ ] **Step 3: Manual sanity check (optional but recommended)**

Launch the desktop app against `examples/linkedin-starter` and confirm: the LinkedIn preview appears under a "LinkedIn" group in the sidebar, renders at 552px with the `#f3f2ef` background, and a second component authored with no `group`/`preset` would appear at the sidebar root on a `#f4f4f5` canvas.

- [ ] **Step 4: Commit any test fixups**

```bash
git add -A
git commit -m "test: align workspace tests with group/preset manifest"
```

---

## Self-Review Notes

- **Spec coverage:** authoring API (Task 2), preset registry + resolution order (Task 1), manifest data flow (Tasks 3–6), sidebar nested tree ungrouped-first (Task 7), palette (Task 8), detached chrome `#f4f4f5`/preset bg (Tasks 1, 9), example rewrite (Task 11), platforms cleanup (Task 10). The optional `controls` escape hatch is explicitly non-MVP in the spec — no task, by design.
- **Type consistency:** `resolveRender`/`resolvePresets`/`Preset`/`ResolvedRender`/`DEFAULT_BACKGROUND`/`BUILTIN_PRESETS` names are used identically across config, vite-plugin, and runtime. Manifest field names `group`/`background` match across `buildManifest`, `ManifestPreview`, sidebar, palette, detached.
- **No placeholders:** every code step shows full code; every run step states the command + expected result.
