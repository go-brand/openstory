# Feature Docs (`*.stories.md`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let OpenStory document app *features* — drop a `*.stories.md` Markdown file anywhere, it appears in the sidebar as a rich prose page that can embed live component stories inline.

**Architecture:** Markdown docs ride the same three rails as component stories. (1) Discovery: the default glob widens to `**/*.stories.{ts,tsx,md}`; matched files partition by extension — `.tsx` keep the existing `ssrLoadModule` path, `.md` get read+parsed. (2) Manifest: a new `docs: ManifestDoc[]` array beside `components`, each carrying Node-rendered `html` + an `embeds` list (`:::story` → placeholder div). (3) Render: the desktop pushes a doc's `html`+`embeds` through the harness bridge as a new `pl:render` `mode:"page"`; the preview-host mounts the HTML and hydrates each `:::story` placeholder against the live in-browser component registry.

**Tech Stack:** TypeScript, Vitest, React 19, Vite plugin, Electron (desktop). One new runtime dep: `marked` (markdown → HTML).

## Global Constraints

- **Marker contract (verbatim):** a `*.stories.*` file is an OpenStory entry; extension picks the interpreter — `.ts`/`.tsx` → React, `.md` → prose doc. `README.md`/`CHANGELOG.md` must never be picked up (they lack the `.stories.` infix).
- **No new config field.** Discovery widens the existing default glob only: `["**/*.stories.{ts,tsx}"]` → `["**/*.stories.{ts,tsx,md}"]`. `resolvePatterns` signature is unchanged.
- **Dependency hygiene:** exactly one new dependency, `marked` (zero-dep, ESM). Frontmatter is hand-rolled — do NOT add `gray-matter`/`js-yaml`. No third-party glob (the repo's existing rule).
- **Embed id format:** `componentId--storyId` (kebab ids, Storybook convention). Split on the first `--`.
- **Two distinct "docs" concepts — do not conflate.** The existing `DocsLeaf` / `kind:"docs"` / `docsComponentId` / `preview:setDocs` is a *component's auto-docs page*. Feature docs are a NEW, separate entity: `kind:"page"` / `pageId` / `preview:setPage`. Never reuse the component-docs fields for feature docs.
- **Build-time embed validation:** an embed id resolving to no story dev-warns `[openstory] doc <file>: embed <id> matches no story` and renders a visible in-page marker — never a silent blank, never a crash.
- **Trust boundary:** doc HTML comes from project-local files the developer already trusts (same boundary as their own source). `dangerouslySetInnerHTML` is acceptable here; add a code comment saying so.
- Tests use Vitest. Run a single package's tests from the repo root with `pnpm --filter <pkg> test`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `packages/config/src/define.ts` | add `ManifestDoc` type; export `humanize`, `kebabCase` (currently private) |
| `packages/config/src/index.ts` | re-export `ManifestDoc`, `humanize`, `kebabCase` |
| `packages/vite-plugin/src/discover.ts` | widen `DEFAULT_PATTERNS`; partition matched files by extension |
| `packages/vite-plugin/src/discover-docs.ts` (new) | `parseDoc` (frontmatter + embed preprocess + `marked`), `discoverDocs` |
| `packages/vite-plugin/src/plugin.ts` | `buildManifest` emits `docs[]`; manifest route runs both discovery paths + validates embeds |
| `packages/vite-plugin/src/harness-loader.ts` | strip `.md` from the `import.meta.glob` literal (React glob stays `.{ts,tsx}`) |
| `packages/vite-plugin/package.json` | add `marked` dependency |
| `packages/runtime/src/bridge.ts` | `RenderMessage` gains `mode:"page"`, `pageHtml`, `pageEmbeds` |
| `packages/runtime/src/doc-host.tsx` (new) | `DocHost({html, embeds, components})` — inject HTML, hydrate embeds |
| `packages/runtime/src/preview-host.tsx` | render `DocHost` when a page render arrives |
| `packages/runtime/src/index.ts` | export `DocHost` |
| `apps/desktop/electron/types.ts` | `ManifestDoc`; `AppState.docs`; `ActiveSelection.pageId`; `preview:setPage` |
| `apps/desktop/electron/ipc.ts` | `fetchManifest` reads `docs`; `preview:setPage` handler; clear `pageId` on story/docs select; `buildAppState` carries `docs` |
| `apps/desktop/src/components/sidebar/build-tree.ts` | feature docs → `PageLeaf` (`kind:"page"`) nodes |
| `apps/desktop/src/components/sidebar/build-tree.test.ts` | tree tests for page nodes |
| `apps/desktop/src/components/sidebar/tree.tsx` | render `page` leaf; `onSelectPage` callback |
| `apps/desktop/src/components/sidebar.tsx` | wire `onSelectPage` → `preview:setPage` |
| `apps/desktop/src/lib/use-harness-bridge.ts` | post `mode:"page"` render when `pageId` set |
| `apps/desktop/src/components/right-panel.tsx` | page selected → hide controls, show `.md` source |
| `examples/<starter>/` | a real `Notifications.stories.md` |

---

## Phase A — Doc engine (config + plugin)

### Task 1: `ManifestDoc` type + shared text helpers

**Files:**
- Modify: `packages/config/src/define.ts`
- Modify: `packages/config/src/index.ts`
- Test: `packages/config/src/define.test.ts`

**Interfaces:**
- Produces: `type ManifestDoc` (shape below); `humanize(name: string): string`; `kebabCase(name: string): string` — both already exist as private functions in `define.ts`, this task only adds `export`.

- [ ] **Step 1: Write the failing test**

Add to `packages/config/src/define.test.ts`:

```ts
import { humanize, kebabCase, type ManifestDoc } from "./define.js";

describe("shared text helpers (exported for docs)", () => {
  it("humanize turns a slug into a title", () => {
    expect(humanize("notifications-panel")).toBe("Notifications Panel");
  });
  it("kebabCase slugs a name", () => {
    expect(kebabCase("NotificationsPanel")).toBe("notifications-panel");
  });
  it("ManifestDoc shape is assignable", () => {
    const d: ManifestDoc = {
      id: "notifications",
      title: "Notifications",
      group: "Features",
      section: null,
      html: "<h1>Notifications</h1>",
      embeds: ["bell--unread"],
      sourcePath: "/abs/Notifications.stories.md",
    };
    expect(d.embeds).toEqual(["bell--unread"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-config test -- define.test`
Expected: FAIL — `humanize`/`kebabCase` not exported; `ManifestDoc` not exported.

- [ ] **Step 3: Implement**

In `packages/config/src/define.ts`, add `export` to the two existing private functions and add the type. Change `function humanize(` → `export function humanize(` and `function kebabCase(` → `export function kebabCase(`. Add near `ManifestControl`:

```ts
export type ManifestDoc = {
  /** Unique key: frontmatter `id`, else kebab of the filename sans ".stories.md". */
  id: string;
  /** Display label: frontmatter `title`, else humanized filename. */
  title: string;
  /** Slash-delimited sidebar path. "" means the sidebar root. */
  group: string;
  /** Auto-derived workspace section (package basename) or null. */
  section: string | null;
  /** Markdown body rendered to HTML (Node side), with `:::story` already
   *  replaced by `<div data-openstory-story="<id>">` placeholders. */
  html: string;
  /** Story ids referenced by `:::story` directives, in document order. */
  embeds: string[];
  /** Absolute path of the source `.md` file (Code panel + section derivation). */
  sourcePath: string;
  /** Optional frontmatter metadata. */
  status?: "shipped" | "beta" | "planned";
  owner?: string;
};
```

In `packages/config/src/index.ts`, add to the `./define.js` export block: `humanize`, `kebabCase`, and `type ManifestDoc`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-config test -- define.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/config/src/define.ts packages/config/src/index.ts packages/config/src/define.test.ts
git commit -m "feat(config): ManifestDoc type + export humanize/kebabCase"
```

---

### Task 2: widen default glob + partition matched files by extension

**Files:**
- Modify: `packages/vite-plugin/src/discover.ts`
- Test: `packages/vite-plugin/src/discover.test.ts`

**Interfaces:**
- Produces: `partitionByExtension(files: string[]): { storyFiles: string[]; docFiles: string[] }` — `.md` → `docFiles`, everything else → `storyFiles`. `DEFAULT_PATTERNS` now matches `.md`.

- [ ] **Step 1: Write the failing test**

Add to `packages/vite-plugin/src/discover.test.ts`:

```ts
import { partitionByExtension, resolvePatterns } from "./discover.js";

describe("doc discovery wiring", () => {
  it("default patterns now match .md story files", () => {
    const [pattern] = resolvePatterns(null);
    expect(pattern).toBe("**/*.stories.{ts,tsx,md}");
  });
  it("partitions matched files by extension", () => {
    const { storyFiles, docFiles } = partitionByExtension([
      "/p/Button.stories.tsx",
      "/p/Notifications.stories.md",
      "/p/Badge.stories.ts",
    ]);
    expect(storyFiles).toEqual(["/p/Button.stories.tsx", "/p/Badge.stories.ts"]);
    expect(docFiles).toEqual(["/p/Notifications.stories.md"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-vite test -- discover.test`
Expected: FAIL — `partitionByExtension` not defined; default pattern still `{ts,tsx}`.

- [ ] **Step 3: Implement**

In `packages/vite-plugin/src/discover.ts`, change the default and add the helper:

```ts
const DEFAULT_PATTERNS = ["**/*.stories.{ts,tsx,md}"];
```

```ts
// Split glob-matched files into the React-story path (ssrLoadModule) and the
// markdown-doc path (read + parse). `.md` cannot be loaded as a module.
export function partitionByExtension(files: string[]): {
  storyFiles: string[];
  docFiles: string[];
} {
  const docFiles = files.filter((f) => f.endsWith(".md"));
  const storyFiles = files.filter((f) => !f.endsWith(".md"));
  return { storyFiles, docFiles };
}
```

Note: `discoverComponents` already filters its own input; leave it as-is (a `.md` file would fail `isRegisteredComponent` and be skipped) — but callers will now pass it only `storyFiles` (Task 4), so it never sees a `.md`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-vite test -- discover.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vite-plugin/src/discover.ts packages/vite-plugin/src/discover.test.ts
git commit -m "feat(vite-plugin): widen default glob to .md; partition by extension"
```

---

### Task 3: `discover-docs.ts` — parse a `.stories.md` into a `ManifestDoc`

**Files:**
- Create: `packages/vite-plugin/src/discover-docs.ts`
- Create: `packages/vite-plugin/src/discover-docs.test.ts`
- Modify: `packages/vite-plugin/package.json` (add `marked`)

**Interfaces:**
- Consumes: `ManifestDoc`, `humanize`, `kebabCase` from `@gobrand/openstory-config`; `deriveSection` from `./derive-section.js`.
- Produces:
  - `parseDoc(source: string, sourcePath: string): ManifestDoc`
  - `discoverDocs(docFiles: string[], read: (abs: string) => string): ManifestDoc[]`

- [ ] **Step 1: Add the `marked` dependency**

Run: `pnpm --filter @gobrand/openstory-vite add marked`
Expected: `marked` appears under `dependencies` in `packages/vite-plugin/package.json`.

- [ ] **Step 2: Write the failing test**

Create `packages/vite-plugin/src/discover-docs.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { parseDoc, discoverDocs } from "./discover-docs.js";

const DOC = `---
title: Notifications
status: shipped
group: Features
owner: growth
---

# Notifications

Users get a bell.

:::story notification-bell--unread
`;

describe("parseDoc", () => {
  it("reads frontmatter and renders markdown", () => {
    const d = parseDoc(DOC, "/p/Notifications.stories.md");
    expect(d.title).toBe("Notifications");
    expect(d.status).toBe("shipped");
    expect(d.group).toBe("Features");
    expect(d.owner).toBe("growth");
    expect(d.html).toContain("<h1>Notifications</h1>");
  });

  it("turns :::story into a placeholder div and collects the embed", () => {
    const d = parseDoc(DOC, "/p/Notifications.stories.md");
    expect(d.embeds).toEqual(["notification-bell--unread"]);
    expect(d.html).toContain('data-openstory-story="notification-bell--unread"');
  });

  it("defaults id/title from the filename when frontmatter is absent", () => {
    const d = parseDoc("# Hi\n\nbody", "/p/Billing-Dunning.stories.md");
    expect(d.id).toBe("billing-dunning");
    expect(d.title).toBe("Billing Dunning");
    expect(d.group).toBe("");
    expect(d.embeds).toEqual([]);
  });

  it("leaves a non-directive ::: line alone", () => {
    const d = parseDoc("::: not a directive", "/p/X.stories.md");
    expect(d.embeds).toEqual([]);
  });
});

describe("discoverDocs", () => {
  it("reads each file and parses it", () => {
    const read = vi.fn(() => DOC);
    const docs = discoverDocs(["/p/Notifications.stories.md"], read);
    expect(read).toHaveBeenCalledWith("/p/Notifications.stories.md");
    expect(docs).toHaveLength(1);
    expect(docs[0]!.id).toBe("notifications");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-vite test -- discover-docs.test`
Expected: FAIL — module `./discover-docs.js` not found.

- [ ] **Step 4: Implement `discover-docs.ts`**

Create `packages/vite-plugin/src/discover-docs.ts`:

```ts
import { basename } from "node:path";
import { marked } from "marked";
import { humanize, kebabCase, type ManifestDoc } from "@gobrand/openstory-config";
import { deriveSection } from "./derive-section.js";

// One `:::story <id>` directive per line → placeholder. The id is the only
// capture; trailing whitespace tolerated. Block-level raw HTML passes through
// `marked` untouched, so the placeholder survives rendering.
const STORY_DIRECTIVE = /^:::story[ \t]+(\S+)[ \t]*$/gm;

type Frontmatter = {
  title?: string;
  id?: string;
  group?: string;
  status?: ManifestDoc["status"];
  owner?: string;
};

// Hand-rolled frontmatter: a leading `---` fenced block of `key: value` lines.
// Scalars only (the keys we read are all scalars). No js-yaml — supply-chain
// hygiene, consistent with the no-third-party-glob rule.
function parseFrontmatter(source: string): { data: Frontmatter; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(source);
  if (!match) return { data: {}, body: source };
  const data: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) data[key] = value;
  }
  return { data: data as Frontmatter, body: source.slice(match[0].length) };
}

export function parseDoc(source: string, sourcePath: string): ManifestDoc {
  const { data, body } = parseFrontmatter(source);

  // Extract embeds + swap directives for placeholders before markdown render.
  const embeds: string[] = [];
  const preprocessed = body.replace(STORY_DIRECTIVE, (_full, id: string) => {
    embeds.push(id);
    return `<div data-openstory-story="${id}" class="openstory-embed"></div>`;
  });

  const html = marked.parse(preprocessed, { async: false }) as string;

  const fileBase = basename(sourcePath).replace(/\.stories\.md$/, "");
  const id = data.id ?? kebabCase(fileBase);
  const title = data.title ?? humanize(fileBase);

  const doc: ManifestDoc = {
    id,
    title,
    group: data.group ?? "",
    section: deriveSection(sourcePath),
    html,
    embeds,
    sourcePath,
  };
  if (data.status) doc.status = data.status;
  if (data.owner) doc.owner = data.owner;
  return doc;
}

export function discoverDocs(
  docFiles: string[],
  read: (abs: string) => string,
): ManifestDoc[] {
  const out: ManifestDoc[] = [];
  const seen = new Set<string>();
  for (const file of docFiles) {
    let source: string;
    try {
      source = read(file);
    } catch (err) {
      console.warn(`[openstory] failed to read ${file}: ${String(err)}`);
      continue;
    }
    const doc = parseDoc(source, file);
    if (seen.has(doc.id)) {
      console.warn(
        `[openstory] two docs resolve to id "${doc.id}"; keeping the first. Set frontmatter \`id\` to disambiguate.`,
      );
      continue;
    }
    seen.add(doc.id);
    out.push(doc);
  }
  return out;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-vite test -- discover-docs.test`
Expected: PASS (all 5).

- [ ] **Step 6: Commit**

```bash
git add packages/vite-plugin/src/discover-docs.ts packages/vite-plugin/src/discover-docs.test.ts packages/vite-plugin/package.json pnpm-lock.yaml
git commit -m "feat(vite-plugin): discover-docs — parse *.stories.md into ManifestDoc"
```

---

### Task 4: emit `docs[]` in the manifest + validate embeds + keep harness glob React-only

**Files:**
- Modify: `packages/vite-plugin/src/plugin.ts` (`buildManifest`, manifest route)
- Modify: `packages/vite-plugin/src/harness-loader.ts`
- Test: `packages/vite-plugin/src/plugin.test.ts`

**Interfaces:**
- Consumes: `discoverDocs`, `partitionByExtension`, `ManifestDoc`.
- Produces: `buildManifest(config, projectRoot, docs?)` returns `{ components, docs }`. `stripMarkdownPatterns(patterns: string[]): string[]` in `harness-loader.ts`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/vite-plugin/src/plugin.test.ts`:

```ts
import { stripMarkdownPatterns } from "./harness-loader.js";
import type { ManifestDoc } from "@gobrand/openstory-config";

describe("buildManifest docs", () => {
  it("passes docs through onto the manifest", () => {
    const docs: ManifestDoc[] = [
      { id: "notifications", title: "Notifications", group: "Features",
        section: null, html: "<h1>x</h1>", embeds: [], sourcePath: "/p/N.stories.md" },
    ];
    const m = buildManifest({ components: [] }, "/p", docs);
    expect(m.docs).toEqual(docs);
  });
  it("defaults docs to [] when omitted", () => {
    const m = buildManifest({ components: [] }, "/p");
    expect(m.docs).toEqual([]);
  });
});

describe("stripMarkdownPatterns", () => {
  it("removes md from a brace alternation", () => {
    expect(stripMarkdownPatterns(["**/*.stories.{ts,tsx,md}"]))
      .toEqual(["**/*.stories.{ts,tsx}"]);
  });
  it("drops a pure .md pattern entirely", () => {
    expect(stripMarkdownPatterns(["**/*.stories.md", "**/*.stories.tsx"]))
      .toEqual(["**/*.stories.tsx"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @gobrand/openstory-vite test -- plugin.test`
Expected: FAIL — `buildManifest` ignores a 3rd arg / no `docs` key; `stripMarkdownPatterns` not exported.

- [ ] **Step 3: Implement `stripMarkdownPatterns` + use it in the harness entry**

In `packages/vite-plugin/src/harness-loader.ts`, add:

```ts
// The React harness must not feed `.md` to import.meta.glob (Vite would try to
// transform markdown as a module). Remove `md` from `{ts,tsx,md}` alternations
// and drop any pure-`.md` pattern. The Node manifest walk keeps the wide glob.
export function stripMarkdownPatterns(patterns: string[]): string[] {
  return patterns
    .map((p) =>
      p.replace(/\{([^}]*)\}/g, (_full, inner: string) =>
        "{" + inner.split(",").map((s) => s.trim()).filter((s) => s !== "md").join(",") + "}",
      ),
    )
    .filter((p) => !/\.md$/.test(p));
}
```

In `buildHarnessEntry`, replace the `globArg` line's `patterns` input with the stripped set:

```ts
const reactPatterns = stripMarkdownPatterns(patterns);
const globArg = JSON.stringify([
  ...reactPatterns.map((p) => "/" + p.replace(/^\//, "")),
  "!/**/dist/**",
  "!/**/build/**",
  "!/**/out/**",
]);
```

- [ ] **Step 4: Implement `docs[]` in `buildManifest` + the manifest route**

In `packages/vite-plugin/src/plugin.ts`, change `buildManifest` signature and return:

```ts
export function buildManifest(
  config: OpenStoryConfig,
  projectRoot?: string,
  docs: ManifestDoc[] = [],
) {
  const presets = resolvePresets(config.presets);
  return {
    components: (config.components ?? []).map((p) => {
      /* ...unchanged body... */
    }),
    docs,
  };
}
```

Add the import at the top: `import type { ManifestDoc } from "@gobrand/openstory-config";` (extend the existing config import).

In the manifest route (`configureServer`, the `/manifest.json` branch), partition the walked files, run both discovery paths, validate embeds, and pass docs to `buildManifest`. Replace the discovery block with:

```ts
const config = resolvedConfigPath
  ? (((await server.ssrLoadModule(resolvedConfigPath)).default ?? {}) as OpenStoryConfig)
  : null;
const patterns = resolvePatterns(config);

// One walk + glob match, then split by extension.
const matched = matchFiles(projectRoot, patterns); // see note below
const { storyFiles, docFiles } = partitionByExtension(matched);

const discovered = await discoverComponentsFrom(storyFiles, (p) => server.ssrLoadModule(p));
const components = mergeComponents(discovered, config?.components ?? []);
const docs = discoverDocs(docFiles, (abs) => readFileSync(abs, "utf8"));

// Validate embeds against the assembled story registry; warn on misses.
const storyKeys = new Set(
  components.flatMap((c) => c.fixtures.map((f) => `${c.id}--${f.id}`)),
);
for (const doc of docs) {
  for (const id of doc.embeds) {
    if (!storyKeys.has(id)) {
      console.warn(`[openstory] doc ${doc.sourcePath}: embed ${id} matches no story`);
    }
  }
}

const manifest = buildManifest({ ...(config ?? {}), components }, projectRoot, docs);
```

**Note on `matchFiles`/`discoverComponentsFrom`:** `discoverComponents` currently does walk+match+load in one function. Refactor it into two exported pieces in `discover.ts` so this route can match once and split: `matchFiles(projectRoot, patterns): string[]` (the walk + glob filter) and `discoverComponentsFrom(storyFiles, load)` (the load+validate loop). Keep the existing `discoverComponents` as a thin wrapper (`discoverComponentsFrom(matchFiles(root, patterns).filter(non-md), load)`) so its current tests still pass. Add `readFileSync` to the existing `node:fs` import in `plugin.ts`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @gobrand/openstory-vite test`
Expected: PASS (new `buildManifest`/`stripMarkdownPatterns` tests + all existing).

- [ ] **Step 6: Commit**

```bash
git add packages/vite-plugin/src
git commit -m "feat(vite-plugin): emit docs[] in manifest, validate embeds, keep harness glob React-only"
```

---

## Phase B — Runtime render

### Task 5: `DocHost` + `pl:render` page mode

**Files:**
- Modify: `packages/runtime/src/bridge.ts`
- Create: `packages/runtime/src/doc-host.tsx`
- Create: `packages/runtime/src/doc-host.test.tsx`
- Modify: `packages/runtime/src/preview-host.tsx`
- Modify: `packages/runtime/src/index.ts`

**Interfaces:**
- Consumes: `OpenStoryConfig`/`RegisteredComponent` (for embed lookup), the existing single-fixture render used by `PreviewStage`.
- Produces: `RenderMessage` with optional `mode:"page"`, `pageHtml?: string`, `pageEmbeds?: string[]`. `DocHost({ html, embeds, components }): JSX.Element`.

**Test approach (read before writing):** runtime tests are PURE unit tests — `preview-host.test.tsx` imports only `vitest` and tests exported functions (`mergeProps`, `layoutStyle`); there is NO `@testing-library/react` dep and NO jsdom vitest environment configured. Do NOT add either. Test the embed-resolution logic by exporting `resolveEmbed` as a pure function and asserting on its return value. The DOM injection + portal hydration of `DocHost` is verified end-to-end by Task 12's manual run, not a unit test.

- [ ] **Step 1: Write the failing test**

Create `packages/runtime/src/doc-host.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { resolveEmbed } from "./doc-host.js";

function Bell() {
  return null;
}
const components = [
  { id: "bell", name: "Bell", component: Bell, fixtures: [{ id: "unread", label: "Unread", props: { tone: "warn" } }] },
] as never[];

describe("resolveEmbed", () => {
  it("resolves a known componentId--storyId to its component + fixture props", () => {
    const r = resolveEmbed(components, "bell--unread");
    expect(r?.Comp).toBe(Bell);
    expect(r?.props).toEqual({ tone: "warn" });
  });
  it("returns null for an unknown component or story", () => {
    expect(resolveEmbed(components, "ghost--x")).toBeNull();
    expect(resolveEmbed(components, "bell--missing")).toBeNull();
  });
  it("returns null when the id has no -- separator", () => {
    expect(resolveEmbed(components, "bell")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-runtime test -- doc-host`
Expected: FAIL — `./doc-host.js` not found / `resolveEmbed` not exported.

- [ ] **Step 3: Implement `bridge.ts` changes**

In `packages/runtime/src/bridge.ts`, extend `RenderMessage` and the `mode` union:

```ts
export type RenderMessage = {
  type: "pl:render";
  componentId: string;
  storyId: string;
  viewport: "desktop" | "mobile";
  layout?: "padded" | "centered" | "fullscreen";
  fixtureOverrides?: Record<string, unknown>;
  /** `story` (default) | `docs` (component auto-docs) | `page` (feature doc). */
  mode?: "story" | "docs" | "page";
  /** Present only in `page` mode: the feature doc's rendered HTML + embed ids. */
  pageHtml?: string;
  pageEmbeds?: string[];
};
```

(No change to `KNOWN_TYPES`/`parseBridgeMessage` — still a `pl:render`.)

- [ ] **Step 4: Implement `doc-host.tsx`**

Create `packages/runtime/src/doc-host.tsx`. Mount each embed by reusing React portals into the placeholder nodes after the HTML is injected:

```tsx
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

type EmbedComponent = {
  id: string;
  component: (props: never) => ReactNode;
  fixtures: Array<{ id: string; label: string; props: unknown }>;
};

export function resolveEmbed(
  components: EmbedComponent[],
  embedId: string,
): { Comp: EmbedComponent["component"]; props: unknown } | null {
  const sep = embedId.indexOf("--");
  if (sep === -1) return null;
  const componentId = embedId.slice(0, sep);
  const storyId = embedId.slice(sep + 2);
  const comp = components.find((c) => c.id === componentId);
  const fixture = comp?.fixtures.find((f) => f.id === storyId);
  if (!comp || !fixture) return null;
  return { Comp: comp.component, props: fixture.props };
}

export function DocHost({
  html,
  embeds,
  components,
}: {
  html: string;
  embeds: string[];
  components: EmbedComponent[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  // After the HTML mounts, collect each placeholder node so we can portal into it.
  const [targets, setTargets] = useState<Map<string, HTMLElement>>(new Map());

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const map = new Map<string, HTMLElement>();
    for (const el of root.querySelectorAll<HTMLElement>("[data-openstory-story]")) {
      const id = el.getAttribute("data-openstory-story");
      if (id) map.set(id, el);
    }
    setTargets(map);
  }, [html]);

  return (
    <>
      {/* doc HTML comes from a project-local file the developer already trusts
          (same boundary as their own source) — not user-submitted content. */}
      <div ref={rootRef} className="openstory-doc" dangerouslySetInnerHTML={{ __html: html }} />
      {embeds.map((id) => {
        const target = targets.get(id);
        if (!target) return null;
        const resolved = resolveEmbed(components, id);
        return createPortal(
          resolved ? (
            <resolved.Comp {...(resolved.props as never)} />
          ) : (
            <span className="openstory-embed-missing">⚠ story not found: {id}</span>
          ),
          target,
          id,
        );
      })}
    </>
  );
}
```

- [ ] **Step 5: Wire `DocHost` into `preview-host.tsx`**

In `packages/runtime/src/preview-host.tsx`, the message handler currently maps `pl:render` into selection state. Add page-mode state alongside `docsComponentId`. Where the component reads the incoming render message, capture `mode === "page"` into a `page: { html, embeds } | null` state, and render before the `docsComponentId` branch:

```tsx
if (page) {
  return (
    <DocHost
      key={`page:${remountKey}`}
      html={page.html}
      embeds={page.embeds}
      components={config.components ?? []}
    />
  );
}
```

Set `page` from the handler: when `next.mode === "page"`, `setPage({ html: next.pageHtml ?? "", embeds: next.pageEmbeds ?? [] })` and clear it (`setPage(null)`) on any non-page render. Import `DocHost` from `./doc-host.js`.

- [ ] **Step 6: Export + run tests**

In `packages/runtime/src/index.ts`, add `export { DocHost } from "./doc-host.js";`.

Run: `pnpm --filter @gobrand/openstory-runtime test`
Expected: PASS (doc-host + existing preview-host tests).

- [ ] **Step 7: Commit**

```bash
git add packages/runtime/src
git commit -m "feat(runtime): DocHost + pl:render page mode for feature docs"
```

---

## Phase C — Desktop integration

### Task 6: desktop types — docs, pageId, preview:setPage

**Files:**
- Modify: `apps/desktop/electron/types.ts`

**Interfaces:**
- Produces: `ManifestDoc` (desktop copy, mirrors the config type — desktop keeps Electron free of the config import, same as `ManifestControl`); `AppState.docs: ManifestDoc[]`; `ActiveSelection.pageId: string | null`; `IpcInvoke["preview:setPage"]: (pageId: string | null) => void`.

- [ ] **Step 1: Implement (type-only — verified by `tsc`)**

In `apps/desktop/electron/types.ts`:

Add after `ManifestComponent`:

```ts
export type ManifestDoc = {
  id: string;
  title: string;
  group: string;
  section: string | null;
  html: string;
  embeds: string[];
  sourcePath: string;
  status?: "shipped" | "beta" | "planned";
  owner?: string;
};
```

In `ActiveSelection`, add (after `docsComponentId`):

```ts
  /** Feature-doc page id whose page is the active selection, else null.
   *  Distinct from `docsComponentId` (a component's auto-docs). */
  pageId: string | null;
```

In `AppState`, add after `manifest`:

```ts
  docs: ManifestDoc[];
```

In `IpcInvoke`, add after `preview:setDocs`:

```ts
  "preview:setPage": (pageId: string | null) => void;
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @gobrand/openstory-desktop exec tsc --noEmit`
Expected: errors ONLY at the not-yet-updated call sites (store default selection lacks `pageId`, ipc `buildAppState` lacks `docs`). These are fixed in Task 7. Confirm there are no *type-definition* errors in `types.ts` itself.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/electron/types.ts
git commit -m "feat(desktop): types for feature docs (docs, pageId, preview:setPage)"
```

---

### Task 7: ipc — fetch docs, setPage handler, clear pageId on story/docs select

**Files:**
- Modify: `apps/desktop/electron/ipc.ts`
- Modify: `apps/desktop/electron/store.ts` (default `pageId: null` in the initial selection)
- Modify: `apps/desktop/electron/selection.ts` (clear `pageId` in `SelectionPatch` resets)
- Test: `apps/desktop/electron/selection.test.ts`

**Interfaces:**
- Consumes: `ManifestDoc` (Task 6).
- Produces: `AppState.docs` populated; `preview:setPage` IPC live; story/docs selection clears `pageId`; page selection clears `componentId`/`storyId`/`docsComponentId`.

- [ ] **Step 1: Write the failing test**

In `apps/desktop/electron/selection.test.ts`, extend the reset expectations to include `pageId: null` (the patches returned by `reconcileSelection` must clear it). Add:

```ts
it("reset patches clear pageId", () => {
  const patch = reconcileSelection([], { componentId: "x", storyId: "y" });
  expect(patch).toMatchObject({ pageId: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-desktop test -- selection.test`
Expected: FAIL — patches don't include `pageId`.

- [ ] **Step 3: Implement**

`selection.ts` — add `"pageId"` to the `SelectionPatch` `Pick`, and `pageId: null` to both returned patches (the reset-to-first and the clear-all).

`store.ts` — add `pageId: null` to the initial/default `selection` object (find where `docsComponentId: null` is set and add the sibling).

`ipc.ts`:
- Add `ManifestDoc` to the type import from `./types`.
- Hold docs alongside the manifest: `let docs: ManifestDoc[] = [];` near `let manifest`.
- In `fetchManifest`, read docs from the body and reset on failure:
  ```ts
  const body = (await res.json()) as { components: ManifestComponent[]; docs?: ManifestDoc[] };
  manifest = body.components ?? [];
  docs = body.docs ?? [];
  ```
  In the two failure paths (`!res.ok` and `catch`), also set `docs = []`.
- `buildAppState` — add a `docs` param and include it in the returned object; update both call sites (`broadcastState`, the `state:get` handler) to pass `docs`.
- In `preview:set`, add `pageId: null` to the patch (selecting a story exits a page).
- In `preview:setDocs`, add `pageId: null` to the patch (entering component-docs exits a page).
- Add the handler after `preview:setDocs`:
  ```ts
  ipcMain.handle("preview:setPage", (_e, pageId: string | null) => {
    deps.store.patchSelection({
      pageId,
      componentId: null,
      storyId: null,
      docsComponentId: null,
      propOverrides: {},
      layout: null,
    });
    broadcastState();
  });
  ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @gobrand/openstory-desktop test -- selection.test`
Expected: PASS.
Run: `pnpm --filter @gobrand/openstory-desktop exec tsc --noEmit`
Expected: no errors (Task 6 + Task 7 together close the loop).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/electron/ipc.ts apps/desktop/electron/store.ts apps/desktop/electron/selection.ts apps/desktop/electron/selection.test.ts
git commit -m "feat(desktop): ipc fetches docs, preview:setPage, clears pageId on select"
```

---

### Task 8: build-tree — feature docs as `page` leaves

**Files:**
- Modify: `apps/desktop/src/components/sidebar/build-tree.ts`
- Test: `apps/desktop/src/components/sidebar/build-tree.test.ts`

**Interfaces:**
- Consumes: `ManifestDoc`.
- Produces: `PageLeaf` (`kind:"page"`, `{ id, label, pageId, status? }`) in the tree; `buildTree(components, docs)` — second arg defaults to `[]`.

- [ ] **Step 1: Write the failing test**

Add to `build-tree.test.ts`:

```ts
import type { ManifestDoc } from "../../../electron/types";

const doc = (over: Partial<ManifestDoc> = {}): ManifestDoc => ({
  id: "notifications", title: "Notifications", group: "Features",
  section: null, html: "", embeds: [], sourcePath: "/p/N.stories.md", ...over,
});

it("places a feature doc as a page leaf under its group", () => {
  const tree = buildTree([], [doc()]);
  // Features folder → page leaf
  const features = tree.find((n) => n.kind === "folder" && n.label === "Features");
  expect(features).toBeTruthy();
  const leaf = (features as { children: TreeNode[] }).children[0]!;
  expect(leaf.kind).toBe("page");
  expect((leaf as { pageId: string }).pageId).toBe("notifications");
  expect(leaf.label).toBe("Notifications");
});

it("a group-less doc sits at the root", () => {
  const tree = buildTree([], [doc({ group: "" })]);
  expect(tree.some((n) => n.kind === "page")).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-desktop test -- build-tree`
Expected: FAIL — `buildTree` takes one arg; no `page` kind.

- [ ] **Step 3: Implement**

In `build-tree.ts`:

Add the leaf type + extend the union:

```ts
export type PageLeaf = {
  kind: "page";
  id: string;
  label: string;
  pageId: string;
  status?: "shipped" | "beta" | "planned";
};
export type TreeNode = SectionNode | FolderNode | ComponentNode | StoryLeaf | DocsLeaf | PageLeaf;
```

Import `ManifestDoc`. The cleanest reuse: project docs into the same section/group bucketing as components by giving `container` a uniform item. Add a sibling builder. Change `buildTree` signature and merge docs into the section map:

```ts
export function buildTree(
  manifest: ManifestComponent[],
  docs: ManifestDoc[] = [],
): TreeNode[] {
  // section → ordered entries; an entry is a component or a doc.
  type Entry =
    | { kind: "component"; value: ManifestComponent }
    | { kind: "doc"; value: ManifestDoc };
  const order: (string | null)[] = [];
  const bySection = new Map<string | null, Entry[]>();
  const push = (section: string | null, entry: Entry) => {
    if (!bySection.has(section)) {
      bySection.set(section, []);
      order.push(section);
    }
    bySection.get(section)!.push(entry);
  };
  for (const p of manifest) push(p.section ?? null, { kind: "component", value: p });
  for (const d of docs) push(d.section ?? null, { kind: "doc", value: d });
  // ...build roots from bySection exactly as before, but `container` now maps
  // each Entry to either componentNode(...) or pageLeaf(...).
}
```

Change `Item` to carry `Entry`, and in `container`, when emitting a node: `entry.kind === "doc"` → `pageLeaf(entry.value, idPrefix)`, else `componentNode(entry.value, idPrefix)`. Add:

```ts
function pageLeaf(d: ManifestDoc, idPrefix: string): PageLeaf {
  const leaf: PageLeaf = {
    kind: "page",
    id: `${idPrefix}/page:${d.id}`,
    label: d.title,
    pageId: d.id,
  };
  if (d.status) leaf.status = d.status;
  return leaf;
}
```

`segments(d.group)` provides the folder path, identical to components. `isContainer` is unaffected (a page is a leaf). Direct-vs-folder sorting: dock docs after components by giving doc entries a sort key — keep it simple: sort `direct` components alpha (unchanged), then append page leaves alpha after them.

- [ ] **Step 4: Update the `buildTree` call site**

In `apps/desktop/src/components/sidebar.tsx`, change `buildTree(state.manifest)` → `buildTree(state.manifest, state.docs)`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @gobrand/openstory-desktop test -- build-tree`
Expected: PASS (new + existing tree tests).

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/components/sidebar/build-tree.ts apps/desktop/src/components/sidebar/build-tree.test.ts apps/desktop/src/components/sidebar.tsx
git commit -m "feat(desktop): feature docs render as page leaves in the sidebar tree"
```

---

### Task 9: sidebar/tree render + select a page

**Files:**
- Modify: `apps/desktop/src/components/sidebar/tree.tsx`
- Modify: `apps/desktop/src/components/sidebar.tsx`

**Interfaces:**
- Consumes: `PageLeaf`; `preview:setPage` IPC.
- Produces: clicking/Enter on a `page` node calls `api.invoke("preview:setPage", pageId)`.

- [ ] **Step 1: Implement the callback + render**

In `sidebar.tsx`:
- Add to the `cb` object: `onSelectPage: (pageId: string) => api?.invoke("preview:setPage", pageId),`.
- In `onKeyDown`'s Enter/Space branch, add: `else if (cur.kind === "page") api?.invoke("preview:setPage", cur.pageId);` (alongside the existing `story`/`docs` cases).

In `tree.tsx` (the `TreeCallbacks` type + the node renderer): add `onSelectPage: (pageId: string) => void;` to `TreeCallbacks`, and render a `page` leaf the same way a `docs`/`story` leaf is rendered (label + a small doc icon; if `node.status`, a faint badge), wiring its click to `cb.onSelectPage(node.pageId)`. Mark a page node "active" when `selection.pageId === node.pageId`. Mirror the existing `docs` leaf branch in this file — it is the exact template (selection highlight via `selection.docsComponentId`).

- [ ] **Step 2: Verify it compiles + existing tests pass**

Run: `pnpm --filter @gobrand/openstory-desktop exec tsc --noEmit`
Expected: no errors.
Run: `pnpm --filter @gobrand/openstory-desktop test`
Expected: PASS (no regressions).

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/components/sidebar/tree.tsx apps/desktop/src/components/sidebar.tsx
git commit -m "feat(desktop): select a feature-doc page from the sidebar"
```

---

### Task 10: harness bridge posts the page render

**Files:**
- Modify: `apps/desktop/src/lib/use-harness-bridge.ts`

**Interfaces:**
- Consumes: `AppState.selection.pageId`, `AppState.docs`.
- Produces: when `pageId` is set, the iframe receives `{ type:"pl:render", mode:"page", pageHtml, pageEmbeds }`.

- [ ] **Step 1: Implement**

`useHarnessBridge` currently takes `(iframeRef, selection, api, addons)`. It needs the docs to look up html/embeds for the active page. Add a `docs: AppState["docs"]` parameter (thread it from the caller — `main-app.tsx`/`App.tsx`, wherever `useHarnessBridge` is invoked: pass `state.docs`).

In `postRef.current`, add a page branch **before** the `docsComponentId` branch:

```ts
if (s.pageId) {
  const doc = docsRef.current.find((d) => d.id === s.pageId);
  if (doc) {
    win.postMessage(
      { type: "pl:render", mode: "page", componentId: "", storyId: "",
        viewport: s.viewport, pageHtml: doc.html, pageEmbeds: doc.embeds },
      "*",
    );
  }
  return;
}
```

Add `const docsRef = useRef(docs); docsRef.current = docs;` near the other refs. Add `selection.pageId` to the re-post `useEffect` dependency array.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm --filter @gobrand/openstory-desktop exec tsc --noEmit`
Expected: no errors (update each `useHarnessBridge(...)` call site to pass `state.docs`).

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/lib/use-harness-bridge.ts apps/desktop/src/App.tsx apps/desktop/src/views/main-app.tsx apps/desktop/src/views/detached-preview.tsx
git commit -m "feat(desktop): harness bridge posts page render for feature docs"
```

---

### Task 11: right-panel — page has no controls, Code shows the `.md`

**Files:**
- Modify: `apps/desktop/src/components/right-panel.tsx`
- Modify: `apps/desktop/electron/ipc.ts` (`preview:getSource` resolves a page's `.md`)

**Interfaces:**
- Consumes: `AppState.selection.pageId`, `AppState.docs`.
- Produces: when a page is selected, the right panel hides the controls section; the Code panel shows the doc's `sourcePath` file contents.

- [ ] **Step 1: Implement the source resolution**

`preview:getSource` currently looks up `manifest.find((p) => p.id === componentId)`. Make it also resolve a doc: if no component matches, try `docs.find((d) => d.id === componentId)` and read its `sourcePath` (the same `isInside` + size guard apply). Concretely, after the component lookup fails to yield a `sourcePath`, fall through to a docs lookup keyed by the same id argument.

- [ ] **Step 2: Implement the panel branch**

In `right-panel.tsx`, where it renders controls + code for the active component, add an early branch: when `state.selection.pageId` is set, render only the Code panel (no controls — a doc has none), fetching source via `api.invoke("preview:getSource", state.selection.pageId)`. Mirror the existing component Code-panel rendering; the only change is suppressing the controls section.

- [ ] **Step 3: Verify it compiles + tests pass**

Run: `pnpm --filter @gobrand/openstory-desktop exec tsc --noEmit && pnpm --filter @gobrand/openstory-desktop test`
Expected: no errors; PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/components/right-panel.tsx apps/desktop/electron/ipc.ts
git commit -m "feat(desktop): right panel for a feature-doc page (no controls, .md source)"
```

---

### Task 12: example doc + end-to-end manual verify

**Files:**
- Create: `examples/<starter>/src/Notifications.stories.md` (use the starter that already has stories — check `examples/` for the one with `*.stories.tsx`)

- [ ] **Step 1: Author the example doc**

Pick story ids that exist in that example's `*.stories.tsx` (open them to confirm `componentId--storyId`). Create the file:

````markdown
---
title: Notifications
status: shipped
group: Features
owner: growth
---

# Notifications

Users get a bell in the titlebar; unread state shows a count badge.

:::story <existing-componentId>--<existing-storyId>

Clicking it opens the panel below.
````

- [ ] **Step 2: Run the desktop app against the example**

Run the desktop app (per the repo's run skill / `pnpm` dev script), add the example repo, and confirm:
- "Notifications" appears under a **Features** folder in the sidebar.
- Selecting it renders the prose page with the embedded story **live** inline.
- The right panel shows the `.md` source and **no controls**.
- Editing the `.md` does **NOT** live-update the open page in v1 (known limitation / fast-follow); to see content changes, re-select the page.
- A deliberately wrong `:::story typo--x` shows the in-page "⚠ story not found" marker and dev-warns in the Vite console — no crash.

- [ ] **Step 3: Commit**

```bash
git add examples
git commit -m "docs(example): Notifications.stories.md feature doc with a live embed"
```

---

## Self-Review notes (addressed)

- **Spec coverage:** marker (Task 2), discovery/partition (Tasks 2–4), frontmatter+embed parse+`marked` (Task 3), manifest `docs[]`+embed validation (Task 4), harness `.md` exclusion (Task 4), `DocHost` render+hydrate (Task 5), sidebar one-tree placement (Task 8–9), Code-panel `.md`+no controls (Task 11), grouping reuse (Task 8), live updates (existing `pl:manifest` path, exercised in Task 12). v1 cuts (`.html`, controls-on-embeds, search, MDX) intentionally absent.
- **Two-docs-concept hazard:** every feature-doc field is named `page`/`pageId`/`setPage`; the component-auto-docs `docs`/`docsComponentId`/`setDocs` path is untouched. Called out in Global Constraints.
- **Type consistency:** `ManifestDoc` shape is identical in `packages/config` (Task 1) and `apps/desktop/electron/types.ts` (Task 6); `buildManifest(config, projectRoot, docs)`, `discoverDocs(docFiles, read)`, `parseDoc(source, sourcePath)`, `DocHost({html, embeds, components})`, `partitionByExtension`, `stripMarkdownPatterns` names match across tasks.
- **Refactor flagged:** Task 4 splits `discoverComponents` into `matchFiles` + `discoverComponentsFrom` so the route matches once and partitions; existing `discoverComponents` kept as a wrapper to preserve current tests.
