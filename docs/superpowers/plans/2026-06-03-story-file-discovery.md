# Story-file Auto-Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-discover co-located `*.stories.tsx` files by glob so components render with zero central config; keep `openstory.config.ts` + `components: [...]` as an optional escape hatch.

**Architecture:** One set of glob patterns drives both sides — a zero-dependency Node `fs` walk builds the authoritative manifest (sidebar), Vite's compile-time `import.meta.glob` supplies the renderable components (harness). Shared validate/dedupe logic lives in the pure `@gobrand/openstory-config` package so the two sides can't disagree.

**Tech Stack:** TypeScript, Vite plugin, `node:fs` (no glob dependency — supply-chain hygiene), `import.meta.glob`, vitest, React/Electron.

**Spec:** `docs/superpowers/specs/2026-06-03-story-file-discovery-design.md`

---

## File structure

| File | Responsibility |
|------|----------------|
| `packages/config/src/define.ts` (mod) | `OpenStoryConfig.stories?`; `RegisteredComponent.name`; `defineStories` sets `name` |
| `packages/config/src/discover.ts` (new) | Pure shared `isRegisteredComponent`, `mergeComponents` |
| `packages/config/src/index.ts` (mod) | Export the two helpers |
| `packages/vite-plugin/src/discover.ts` (new) | `resolvePatterns`, `globToRegExp`, `discoverComponents` (zero-dep `fs` walk + load) |
| `packages/vite-plugin/src/plugin.ts` (mod) | Manifest route + `buildManifest` discover/merge; optional config; pass patterns to entry |
| `packages/vite-plugin/src/harness-loader.ts` (mod) | Generate `import.meta.glob` entry; config optional |
| `apps/desktop/electron/types.ts` (mod) | `ManifestComponent.name`; `preview:refreshManifest` channel |
| `apps/desktop/electron/ipc.ts` (mod) | `preview:refreshManifest` handler |
| `apps/desktop/src/lib/use-harness-bridge.ts` (mod) | On `pl:manifest`, invoke refresh |
| `apps/desktop/src/components/sidebar/build-tree.ts` (mod) | Label by `name` |
| `examples/linkedin-starter/openstory.config.ts` (mod) | Rely on discovery |

---

## Task 1: `name` field + `stories` config field (config)

**Files:**
- Modify: `packages/config/src/define.ts`
- Test: `packages/config/src/define.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/config/src/define.test.ts` (inside the existing top-level `describe` or as new `describe`s — append at end of file):

```ts
import { defineOpenStoryConfig, defineStories } from "./define";

describe("defineStories name", () => {
  it("derives name from the component, stripping a Preview suffix and humanizing", () => {
    function LinkedinPreview() {
      return null;
    }
    const reg = defineStories({ component: LinkedinPreview, stories: { A: {} } });
    expect(reg.name).toBe("Linkedin");
    expect(reg.id).toBe("linkedin");
  });

  it("uses the component name verbatim (humanized) when there is no Preview suffix", () => {
    function Button() {
      return null;
    }
    const reg = defineStories({ component: Button, stories: { A: {} } });
    expect(reg.name).toBe("Button");
    expect(reg.id).toBe("button");
  });
});

describe("OpenStoryConfig.stories", () => {
  it("accepts a stories glob-patterns array", () => {
    const config = defineOpenStoryConfig({ stories: ["src/**/*.stories.tsx"], components: [] });
    expect(config.stories).toEqual(["src/**/*.stories.tsx"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-config test -- define`
Expected: FAIL — `reg.name` is undefined; `stories` not on the config type (TS) — the runtime asserts fail.

- [ ] **Step 3: Implement**

In `packages/config/src/define.ts`:

Add `name` to `RegisteredComponent` (after `id`). It is **optional** so raw
`RegisteredComponent` literals (e.g. in `plugin.test.ts`) don't need it;
`defineStories` always sets it and `buildManifest` falls back to the id:
```ts
export type RegisteredComponent = {
  id: string;
  /** Human display label for the sidebar (decoupled from the unique id).
   *  Always set by defineStories; optional for raw literals. */
  name?: string;
  group?: string;
  preset?: string;
  component: ComponentType<never>;
  fixtures: Fixture<unknown>[];
  viewports?: Partial<Record<"desktop" | "mobile", Viewport>>;
  /** Project-root-relative source file for the "Code" panel. See ComponentDef. */
  sourcePath?: string;
};
```

Add `stories?` to `OpenStoryConfig` (after `components`):
```ts
export type OpenStoryConfig = {
  components?: RegisteredComponent[];
  /** Glob patterns (relative to project root) for auto-discovered story files.
   *  Omit for the default ["**\/*.stories.{ts,tsx}"]. */
  stories?: string[];
  providers?: ComponentType<{ children: ReactNode }>;
  styles?: string[];
  presets?: Record<string, Preset>;
};
```
(Note: `components` becomes optional — change `components: RegisteredComponent[]` to `components?: RegisteredComponent[]`.)

In `defineStories`, replace the id derivation block:
```ts
  const componentName = def.component.displayName ?? def.component.name ?? "Component";
  // Strip a trailing "Preview" (legacy social-preview components like
  // `LinkedinPreview` → "Linkedin"); harmless for normally-named components.
  const base = componentName.replace(/Preview$/, "");
  const name = humanize(base) || "Component";
  const autoId = kebabCase(base) || "component";

  const result: RegisteredComponent = {
    id: def.id ?? autoId,
    name,
    component: def.component as unknown as ComponentType<never>,
    fixtures,
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-config test -- define`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/config/src/define.ts packages/config/src/define.test.ts
git commit -m "feat(config): add component name + stories glob-patterns field"
```

---

## Task 2: Shared `isRegisteredComponent` + `mergeComponents` (config)

**Files:**
- Create: `packages/config/src/discover.ts`
- Modify: `packages/config/src/index.ts`
- Test: `packages/config/src/discover.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/config/src/discover.test.ts
import { describe, it, expect, vi } from "vitest";
import { isRegisteredComponent, mergeComponents } from "./discover";
import type { RegisteredComponent } from "./define";

function reg(id: string, name = id): RegisteredComponent {
  return { id, name, component: (() => null) as never, fixtures: [] };
}

describe("isRegisteredComponent", () => {
  it("accepts a defineStories-shaped object", () => {
    expect(isRegisteredComponent(reg("button"))).toBe(true);
  });

  it("rejects a Storybook Meta-like object (has component+title, no fixtures)", () => {
    expect(isRegisteredComponent({ component: () => null, title: "Button" })).toBe(false);
  });

  it("rejects non-objects and null", () => {
    expect(isRegisteredComponent(null)).toBe(false);
    expect(isRegisteredComponent(42)).toBe(false);
    expect(isRegisteredComponent(undefined)).toBe(false);
  });
});

describe("mergeComponents", () => {
  it("merges discovered + explicit, de-duped by id, explicit wins", () => {
    const discovered = [reg("a"), reg("b")];
    const explicit = [reg("b", "B-explicit"), reg("c")];
    const merged = mergeComponents(discovered, explicit);
    expect(merged.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(merged.find((c) => c.id === "b")?.name).toBe("B-explicit");
  });

  it("warns and keeps the first on a duplicate discovered id", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const merged = mergeComponents([reg("a", "first"), reg("a", "second")], []);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.name).toBe("first");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-config test -- discover`
Expected: FAIL — "Cannot find module './discover'".

- [ ] **Step 3: Implement**

```ts
// packages/config/src/discover.ts
import type { RegisteredComponent } from "./define.js";

// A discovered/registered component is distinguished from a Storybook CSF `Meta`
// (which has `component` + `title` but no `fixtures`) by its `fixtures` array.
export function isRegisteredComponent(value: unknown): value is RegisteredComponent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    "component" in v &&
    v.component != null &&
    Array.isArray(v.fixtures)
  );
}

// Merge discovered + explicitly-registered components, de-duped by id. Explicit
// components win a collision (escape hatch overrides discovery). A duplicate among
// the discovered set keeps the first and warns (ids must be unique — set an
// explicit `id` on same-named components).
export function mergeComponents(
  discovered: RegisteredComponent[],
  explicit: RegisteredComponent[],
): RegisteredComponent[] {
  const byId = new Map<string, RegisteredComponent>();
  for (const c of discovered) {
    if (byId.has(c.id)) {
      console.warn(
        `[openstory] two discovered components resolve to id "${c.id}"; keeping the first. Set an explicit \`id\` to disambiguate.`,
      );
      continue;
    }
    byId.set(c.id, c);
  }
  for (const c of explicit) byId.set(c.id, c);
  return [...byId.values()];
}
```

Add to `packages/config/src/index.ts` (after the `./define.js` export block):
```ts
export { isRegisteredComponent, mergeComponents } from "./discover.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-config test -- discover`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/config/src/discover.ts packages/config/src/index.ts packages/config/src/discover.test.ts
git commit -m "feat(config): shared isRegisteredComponent + mergeComponents"
```

---

## Task 3: Node discovery — zero-dependency `fs` walk + `discover.ts` (vite-plugin)

No third-party glob dependency (supply-chain hygiene). A small `fs` walk + a tiny
glob→RegExp converter covers our need (`**`, `*`, `?`, `{a,b}`).

**Files:**
- Create: `packages/vite-plugin/src/discover.ts`
- Test: `packages/vite-plugin/src/discover.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/vite-plugin/src/discover.test.ts
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePatterns, globToRegExp, discoverComponents } from "./discover";

describe("resolvePatterns", () => {
  it("defaults to **/*.stories.{ts,tsx} when no config or no stories field", () => {
    expect(resolvePatterns(null)).toEqual(["**/*.stories.{ts,tsx}"]);
    expect(resolvePatterns({ components: [] })).toEqual(["**/*.stories.{ts,tsx}"]);
  });

  it("uses the config's stories patterns when provided", () => {
    expect(resolvePatterns({ stories: ["src/**/*.stories.tsx"] })).toEqual([
      "src/**/*.stories.tsx",
    ]);
  });
});

describe("globToRegExp", () => {
  it("matches **, *, and {a,b} against POSIX-relative paths", () => {
    const re = globToRegExp("**/*.stories.{ts,tsx}");
    expect(re.test("button.stories.tsx")).toBe(true);
    expect(re.test("src/ui/button.stories.ts")).toBe(true);
    expect(re.test("src/ui/button.tsx")).toBe(false);
    expect(re.test("src/ui/button.stories.jsx")).toBe(false);
  });

  it("respects a leading path segment", () => {
    const re = globToRegExp("src/**/*.stories.tsx");
    expect(re.test("src/a/b/x.stories.tsx")).toBe(true);
    expect(re.test("test/x.stories.tsx")).toBe(false);
  });
});

describe("discoverComponents", () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "os-disc-"));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "button.stories.tsx"), "//");
    writeFileSync(join(root, "src", "meta.stories.tsx"), "//"); // a Storybook-like file
    writeFileSync(join(root, "src", "plain.tsx"), "//"); // not a story file
    mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(root, "node_modules", "pkg", "x.stories.tsx"), "//"); // must be ignored
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("walks, matches, loads, keeps valid defineStories, skips invalid, defaults sourcePath", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const load = async (abs: string) => {
      if (abs.endsWith("button.stories.tsx")) {
        return { default: { id: "button", name: "Button", component: () => null, fixtures: [] } };
      }
      return { default: { component: () => null, title: "Meta" } }; // not a defineStories
    };
    const found = await discoverComponents(root, ["**/*.stories.{ts,tsx}"], load);
    expect(found.map((c) => c.id)).toEqual(["button"]);
    expect(found[0]?.sourcePath).toBe(join(root, "src", "button.stories.tsx"));
    expect(warn).toHaveBeenCalled(); // skipped meta.stories.tsx
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-vite test -- discover`
Expected: FAIL — "Cannot find module './discover'".

- [ ] **Step 3: Implement (zero dependencies)**

```ts
// packages/vite-plugin/src/discover.ts
import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { isRegisteredComponent } from "@gobrand/openstory-config";
import type { OpenStoryConfig, RegisteredComponent } from "@gobrand/openstory-config";

const DEFAULT_PATTERNS = ["**/*.stories.{ts,tsx}"];
// Directory names never descended into (build output / vcs / deps).
const IGNORE_DIRS = new Set(["node_modules", "dist", "build", "out", ".git"]);

// Effective glob patterns: the config's `stories` field, or the zero-config default.
export function resolvePatterns(config: OpenStoryConfig | null): string[] {
  return config?.stories && config.stories.length > 0 ? config.stories : DEFAULT_PATTERNS;
}

function escapeRe(s: string): string {
  return s.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

// Convert a glob to a RegExp matching a POSIX (forward-slash) relative path.
// Supported subset: `**` (any path segments), `*` (within a segment), `?` (one
// char), `{a,b,c}` (alternation). Enough for story-file patterns.
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:[^/]+/)*"; // `**/` → zero or more whole segments
        } else {
          re += ".*"; // trailing `**`
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end === -1) {
        re += "\\{";
      } else {
        re += "(?:" + glob.slice(i + 1, end).split(",").map(escapeRe).join("|") + ")";
        i = end;
      }
    } else {
      re += escapeRe(c);
    }
  }
  return new RegExp("^" + re + "$");
}

// Recursively collect absolute file paths under `dir`, skipping IGNORE_DIRS.
function walk(dir: string, acc: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // unreadable dir (perms/race) — skip
  }
  for (const ent of entries) {
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!IGNORE_DIRS.has(ent.name)) walk(abs, acc);
    } else if (ent.isFile()) {
      acc.push(abs);
    }
  }
}

// Walk projectRoot, keep files whose root-relative POSIX path matches any pattern,
// load each via the injected loader, keep valid `defineStories` results (skip the
// rest with a warning), and default sourcePath to the file. `load` is injected
// (the plugin passes Vite's ssrLoadModule) so this is unit-testable with a fake.
export async function discoverComponents(
  projectRoot: string,
  patterns: string[],
  load: (absPath: string) => Promise<unknown>,
): Promise<RegisteredComponent[]> {
  const matchers = patterns.map(globToRegExp);
  const all: string[] = [];
  walk(projectRoot, all);
  const files = all.filter((abs) => {
    const rel = relative(projectRoot, abs).split(sep).join("/");
    return matchers.some((re) => re.test(rel));
  });

  const out: RegisteredComponent[] = [];
  for (const file of files) {
    let mod: unknown;
    try {
      mod = await load(file);
    } catch (err) {
      console.warn(`[openstory] failed to load ${file}: ${String(err)}`);
      continue;
    }
    const def = (mod as { default?: unknown })?.default;
    if (!isRegisteredComponent(def)) {
      console.warn(`[openstory] skipped ${file}: default export is not defineStories(...)`);
      continue;
    }
    out.push(def.sourcePath ? def : { ...def, sourcePath: file });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-vite test -- discover`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vite-plugin/src/discover.ts packages/vite-plugin/src/discover.test.ts
git commit -m "feat(vite-plugin): zero-dep story-file discovery (fs walk + glob matcher)"
```

---

## Task 4: `buildManifest` emits `name`; manifest route discovers + merges

**Files:**
- Modify: `packages/vite-plugin/src/plugin.ts`
- Test: `packages/vite-plugin/src/plugin.test.ts`

- [ ] **Step 1: Update buildManifest tests for `name`**

In `packages/vite-plugin/src/plugin.test.ts`, the `buildManifest` `toEqual` objects need a `name`. The raw test fixtures have no `name`, so `buildManifest` falls back to the id. Add `name: "linkedin"` to the two full-object expectations:

```ts
// "emits variants with props and inferred controls"
    expect(manifest.components[0]).toEqual({
      id: "linkedin",
      name: "linkedin",
      group: "LinkedIn",
      section: null,
      background: "#f3f2ef",
      stories: [
        { id: "a", label: "A", props: { text: "hi", dark: true } },
        { id: "b", label: "B", props: { text: "yo" } },
      ],
      controls: deriveControls(config.components[0].fixtures),
      sourcePath: null,
    });
```
```ts
// "emits empty variants and controls for a component with zero fixtures"
    expect(buildManifest(config).components[0]).toEqual({
      id: "linkedin",
      name: "linkedin",
      group: "",
      section: null,
      background: "#f4f4f5",
      stories: [],
      controls: [],
      sourcePath: null,
    });
```
(Note: after the vocab rename these objects already use `components`/`stories`; only `name` is being added. If the test fixtures pass `component: () => null` literals without `name`, the fallback covers them.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-vite test -- plugin`
Expected: FAIL — emitted object missing `name`.

- [ ] **Step 3: Emit `name` in buildManifest**

In `packages/vite-plugin/src/plugin.ts` `buildManifest`, add `name` right after `id`:
```ts
      return {
        id: p.id,
        name: p.name ?? p.id,
        group: p.group ?? "",
        section: deriveSection(sourcePath),
        background: render.background,
        stories: p.fixtures.map((f) => ({
          id: f.id,
          label: f.label,
          props: f.props,
        })),
        controls: deriveControls(p.fixtures),
        sourcePath,
      };
```
(`p.name ?? p.id` so raw literals without `name` still build.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-vite test -- plugin`
Expected: PASS.

- [ ] **Step 5: Wire discovery into the manifest route + make config optional**

In `packages/vite-plugin/src/plugin.ts`:

Add imports near the top:
```ts
import { resolvePatterns, discoverComponents } from "./discover.js";
import { mergeComponents } from "@gobrand/openstory-config";
```

Replace the `MANIFEST_ROUTE` handler body in `configureServer` (the `if (url === "/manifest.json" ...)` block) so it discovers + merges, and no longer 404s when there's no config:
```ts
        if (url === "/manifest.json" || req.url === MANIFEST_ROUTE) {
          try {
            const config = resolvedConfigPath
              ? (((await server.ssrLoadModule(resolvedConfigPath)).default ??
                  {}) as OpenStoryConfig)
              : null;
            const patterns = resolvePatterns(config);
            const discovered = await discoverComponents(projectRoot, patterns, (p) =>
              server.ssrLoadModule(p),
            );
            const components = mergeComponents(discovered, config?.components ?? []);
            const manifest = buildManifest({ ...(config ?? {}), components }, projectRoot);
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(manifest));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }
```

- [ ] **Step 6: Verify the package still builds + tests pass**

Run: `pnpm --filter @gobrand/openstory-vite test && pnpm --filter @gobrand/openstory-vite typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/vite-plugin/src/plugin.ts packages/vite-plugin/src/plugin.test.ts
git commit -m "feat(vite-plugin): manifest route discovers + merges; emit name; optional config"
```

---

## Task 5: Harness entry uses `import.meta.glob`; config optional

**Files:**
- Modify: `packages/vite-plugin/src/harness-loader.ts`
- Modify: `packages/vite-plugin/src/plugin.ts` (`load()` + `resolveStyles`→add patterns)
- Test: `packages/vite-plugin/src/plugin.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/vite-plugin/src/plugin.test.ts` in the `describe("buildHarnessEntry")` block:

```ts
  it("emits an import.meta.glob over the resolved patterns and merges discovered + config", () => {
    const code = buildHarnessEntry("/abs/openstory.config.ts", [], ["**/*.stories.{ts,tsx}"]);
    expect(code).toContain("import.meta.glob");
    expect(code).toContain("/**/*.stories.{ts,tsx}"); // root-relative form for Vite
    expect(code).toContain("mergeComponents");
    expect(code).toContain("isRegisteredComponent");
    expect(code).toContain("from '/abs/openstory.config.ts'");
  });

  it("works with no config file (zero-config discovery)", () => {
    const code = buildHarnessEntry(null, [], ["**/*.stories.{ts,tsx}"]);
    expect(code).toContain("const userConfig = {}");
    expect(code).toContain("import.meta.glob");
    expect(code).not.toContain("openstory.config");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-vite test -- plugin`
Expected: FAIL — `buildHarnessEntry` takes 2 args / doesn't emit `import.meta.glob`.

- [ ] **Step 3: Rewrite `buildHarnessEntry`**

Replace `buildHarnessEntry` in `packages/vite-plugin/src/harness-loader.ts`:
```ts
export function buildHarnessEntry(
  configPath: string | null,
  styles: string[] = [],
  patterns: string[] = ["**/*.stories.{ts,tsx}"],
): string {
  // ESM import specifiers use forward slashes on every OS.
  const norm = (p: string) => p.replace(/\\/g, "/");
  const styleImports = styles.map((s) => `import '${norm(s)}'`);
  // Vite's import.meta.glob resolves a leading "/" against the project root; the
  // patterns are project-root-relative, so prefix one. Negative patterns exclude
  // build output (Vite already ignores node_modules).
  const globArg = JSON.stringify([
    ...patterns.map((p) => "/" + p.replace(/^\//, "")),
    "!/**/dist/**",
    "!/**/build/**",
    "!/**/out/**",
  ]);
  const configLine = configPath
    ? `import userConfig from '${norm(configPath)}'`
    : `const userConfig = {}`;
  return [
    ...styleImports,
    "import { mountPreviewHost } from '@gobrand/openstory-runtime'",
    "import { isRegisteredComponent, mergeComponents } from '@gobrand/openstory-config'",
    configLine,
    `const modules = import.meta.glob(${globArg}, { eager: true })`,
    "const discovered = Object.values(modules).map((m) => m.default).filter(isRegisteredComponent)",
    "const components = mergeComponents(discovered, userConfig.components ?? [])",
    "const target = document.getElementById('root')",
    "if (!target) throw new Error('OpenStory: #root not found')",
    "mountPreviewHost(target, { ...userConfig, components })",
  ].join("\n");
}
```

- [ ] **Step 4: Pass patterns from the plugin + make config optional in `load()`**

In `packages/vite-plugin/src/plugin.ts`:

Add a `resolvePatternsForEntry` helper alongside `resolveStyles` (it needs the loaded config):
```ts
  async function resolveEntryPatterns(): Promise<string[]> {
    if (!resolvedConfigPath || !devServer) return resolvePatterns(null);
    try {
      const mod = await devServer.ssrLoadModule(resolvedConfigPath);
      return resolvePatterns((mod.default ?? mod) as OpenStoryConfig);
    } catch {
      return resolvePatterns(null);
    }
  }
```

Replace the `load(id)` body so it no longer hard-fails on a missing config and passes patterns:
```ts
    async load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null;
      return buildHarnessEntry(
        resolvedConfigPath,
        await resolveStyles(),
        await resolveEntryPatterns(),
      );
    },
```
(Delete the old `if (!resolvedConfigPath) { return [console.error...] }` early-return — zero-config is now valid.)

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm --filter @gobrand/openstory-vite test -- plugin && pnpm --filter @gobrand/openstory-vite typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/vite-plugin/src/harness-loader.ts packages/vite-plugin/src/plugin.ts
git commit -m "feat(vite-plugin): harness discovers via import.meta.glob; zero-config"
```

---

## Task 6: Desktop manifest carries `name`; tree labels by it

**Files:**
- Modify: `apps/desktop/electron/types.ts`
- Modify: `apps/desktop/src/components/sidebar/build-tree.ts`
- Test: `apps/desktop/src/components/sidebar/build-tree.test.ts`

- [ ] **Step 1: Add `name` to the desktop manifest type**

In `apps/desktop/electron/types.ts`, add to `ManifestComponent` (after `id`):
```ts
  /** Human display label for the sidebar tree. */
  name: string;
```

- [ ] **Step 2: Write the failing test**

In `apps/desktop/src/components/sidebar/build-tree.test.ts`, update the `component(...)` factory to include `name`, and add a label assertion. Change the factory:
```ts
function component(over: Partial<ManifestComponent> & { id: string }): ManifestComponent {
  return {
    id: over.id,
    name: over.name ?? over.id,
    group: over.group ?? "",
    section: over.section ?? null,
    background: "#fff",
    stories: over.stories ?? [{ id: "default", label: "Default", props: {} }],
    controls: [],
    sourcePath: null,
  };
}
```
Add a test:
```ts
  it("labels a component node by its name, not its id", () => {
    const tree = buildTree([
      component({
        id: "ui-button",
        name: "Button",
        stories: [
          { id: "a", label: "A", props: {} },
          { id: "b", label: "B", props: {} },
        ],
      }),
    ]);
    expect(tree[0]).toMatchObject({ kind: "component", label: "Button" });
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter openstory-desktop test -- build-tree`
Expected: FAIL — component label is `humanize("ui-button")` = "Ui Button", not "Button".

- [ ] **Step 4: Label by `name`**

In `apps/desktop/src/components/sidebar/build-tree.ts`, in `componentNode(p)`, replace the two `label: humanize(p.id)` usages with `label: p.name`:
```ts
function componentNode(p: ManifestComponent): ComponentNode | StoryLeaf {
  if (p.stories.length <= 1) {
    const v = p.stories[0];
    return {
      kind: "story",
      id: `story:${p.id}:${v?.id ?? ""}`,
      label: p.name,
      componentId: p.id,
      storyId: v?.id ?? "",
    };
  }
  const docs: DocsLeaf = { kind: "docs", id: `docs:${p.id}`, label: "Documentation", componentId: p.id };
  const stories: StoryLeaf[] = p.stories.map((v) => ({
    kind: "story",
    id: `story:${p.id}:${v.id}`,
    label: v.label,
    componentId: p.id,
    storyId: v.id,
  }));
  return {
    kind: "component",
    id: `component:${p.id}`,
    label: p.name,
    componentId: p.id,
    children: [docs, ...stories],
  };
}
```
(Note: `componentNode` takes `idPrefix` from the earlier section-scoping fix — keep that signature; only the `label` values change. If `humanize` becomes unused, remove its import/definition.)

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm --filter openstory-desktop test -- build-tree && pnpm --filter openstory-desktop typecheck`
Expected: PASS. (Typecheck will flag any other `ManifestComponent` literal missing `name` — e.g. `selection.test.ts`'s `component(...)` factory and `search.test.ts`'s; add `name: over.name ?? over.id` to those factories too.)

- [ ] **Step 6: Fix sibling test factories if typecheck flags them**

If `pnpm --filter openstory-desktop typecheck` reports `name` missing in `apps/desktop/electron/selection.test.ts` or `apps/desktop/src/components/sidebar/search.test.ts`, add `name: over.name ?? over.id,` after `id:` in each `component(...)`/`preview(...)` factory. Re-run typecheck until clean.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/electron/types.ts apps/desktop/src/components/sidebar/build-tree.ts apps/desktop/src/components/sidebar/build-tree.test.ts apps/desktop/electron/selection.test.ts apps/desktop/src/components/sidebar/search.test.ts
git commit -m "feat(desktop): manifest name; sidebar labels by name"
```

---

## Task 7: Live refresh — `pl:manifest` triggers a manifest refetch

**Files:**
- Modify: `apps/desktop/electron/types.ts` (channel)
- Modify: `apps/desktop/electron/ipc.ts` (handler)
- Modify: `apps/desktop/src/lib/use-harness-bridge.ts` (listener)

- [ ] **Step 1: Add the IPC channel**

In `apps/desktop/electron/types.ts` `IpcInvoke`, add after `preview:setDocs`:
```ts
  "preview:refreshManifest": () => void;
```

- [ ] **Step 2: Add the handler**

In `apps/desktop/electron/ipc.ts`, the `fetchManifest(port)` function and `viteHost.status()` already exist. Add a handler after `preview:setDocs` that re-fetches when Vite is ready:
```ts
  ipcMain.handle("preview:refreshManifest", async () => {
    const status = deps.viteHost.status();
    if (status.status === "ready" && status.port) {
      await fetchManifest(status.port);
      broadcastState();
    }
  });
```

- [ ] **Step 3: Invoke it when the harness re-announces its manifest**

In `apps/desktop/src/lib/use-harness-bridge.ts`, the effect that listens for `pl:ready` also handles `pl:manifest`. Update the message handler:
```ts
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const type = (e.data as { type?: string })?.type;
      if (type === "pl:ready") postRef.current();
      // The harness re-posts pl:manifest when Vite HMR re-runs import.meta.glob
      // (a *.stories.tsx was added/removed) — refetch so the sidebar updates live.
      else if (type === "pl:manifest") apiRef.current?.invoke("preview:refreshManifest");
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
```
This needs an `api` ref. `useHarnessBridge` currently takes `(iframeRef, selection)`. Add `api` as a third param and ref it:
```ts
export function useHarnessBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  selection: AppState["selection"],
  api: Api,
) {
  const apiRef = useRef(api);
  apiRef.current = api;
  // ... existing latest/postRef code unchanged ...
```
Add the import at top: `import type { Api } from "./api";`. Update the call site in `apps/desktop/src/views/main-app.tsx`:
```tsx
  useHarnessBridge(iframeRef, state.selection, api);
```

- [ ] **Step 4: Verify typecheck + build**

Run: `pnpm --filter openstory-desktop typecheck && pnpm --filter openstory-desktop build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/types.ts apps/desktop/electron/ipc.ts apps/desktop/src/lib/use-harness-bridge.ts apps/desktop/src/views/main-app.tsx
git commit -m "feat(desktop): refresh manifest live when story files change"
```

---

## Task 8: Example relies on discovery

**Files:**
- Modify: `examples/linkedin-starter/openstory.config.ts`

- [ ] **Step 1: Drop the explicit import**

The `linkedin.stories.ts` file is auto-discovered by the default glob. Replace
`examples/linkedin-starter/openstory.config.ts` with:
```ts
import { defineOpenStoryConfig } from "@gobrand/openstory-config";

// Story files (src/**/*.stories.ts) are auto-discovered — no manual registration.
export default defineOpenStoryConfig({
  styles: ["./src/styles.css"],
});
```

- [ ] **Step 2: Verify the example's manifest still resolves the linkedin component**

Run: `pnpm --filter @gobrand/openstory-vite test`
Expected: PASS (unit tests unaffected). The example is validated by the manual smoke in Task 9.

- [ ] **Step 3: Commit**

```bash
git add examples/linkedin-starter/openstory.config.ts
git commit -m "feat(example): linkedin-starter relies on auto-discovery"
```

---

## Task 9: Full verification + manual smoke

- [ ] **Step 1: Run the whole monorepo**

Run: `pnpm -w typecheck && pnpm -w test`
Expected: PASS — config (define + discover), vite-plugin (discover + plugin), runtime, desktop (build-tree + search + selection).

Run: `pnpm --filter openstory-desktop build && pnpm --filter openstory-desktop test:e2e`
Expected: PASS (10/10 smoke).

- [ ] **Step 2: Manual smoke — zero-config discovery**

Run: `pnpm --filter openstory-desktop dev`
- Load `examples/linkedin-starter`: the LinkedIn component appears with its stories **without** being listed in the config.
- In `apps/app` (the user's repo): add a `*.stories.tsx` file next to a component (or rely on the existing config). After saving, the sidebar updates **without relaunch** (live refresh).
- Confirm a non-`defineStories` `*.stories.tsx` (a Storybook `Meta`) is skipped (dev-console warning), not crashing the manifest.

- [ ] **Step 3: Commit any doc note (optional)**

No code change expected here. If the manual smoke surfaces a defect, fix it under systematic-debugging and add a regression test before re-running Step 1.

---

## Notes for the implementer

- **Run order:** Tasks 1–2 (config) are the contract; 3–5 (vite-plugin) build on them; 6–7 (desktop) consume `name` + live refresh. Don't fix intermediate cross-package type errors out of their owning task.
- **`p.name ?? p.id` fallback** in `buildManifest` keeps raw test fixtures (no `name`) working while real `defineStories` results always carry `name`.
- **ids must be unique** — discovery does NOT auto-uniquify (a path-id can't stay consistent between Node and the browser harness). Duplicate ids warn; document the explicit-`id` escape hatch.
- **`import.meta.glob` patterns are literals** emitted by the plugin (Vite statically analyzes them); the leading `/` makes them project-root-relative.
- **pnpm filters:** `@gobrand/openstory-config`, `@gobrand/openstory-vite`, `openstory-desktop`.
