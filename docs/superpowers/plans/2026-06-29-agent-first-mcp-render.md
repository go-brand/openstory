# Agent-First OpenStory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any AI agent drive OpenStory headlessly — render a single story from a URL and discover the design system over an MCP server mounted in the project's Vite dev server.

**Architecture:** One renderer, many triggers. The existing harness at `/__pl__/` already renders one story from `?component=&story=&viewport=` (`readSelectionFromUrl`); we extend it with `theme`/`layout` params (P0). The `openStory()` Vite plugin gains an MCP server at `/__pl__/mcp` (HTTP transport, read-only) whose tools read the same manifest the `/__pl__/manifest.json` route builds (P1). No Electron, no Chromium in core.

**Tech Stack:** TypeScript, Vite 7 plugin (connect middleware), React 19 runtime, `@modelcontextprotocol/sdk` (Streamable HTTP, stateless), Vitest 4.

## Global Constraints

- Node `>=22`; pnpm workspace; ESM only (`"type": "module"`).
- `@gobrand/openstory-config` stays **zero runtime deps** — do not import it into anything that pulls React on the Node side beyond what already exists.
- **No Chromium / Playwright / Puppeteer** added to any published core package.
- MCP tools are **read-only** this push. No mutation, no auth.
- Tests: Vitest, `vitest run` per package. Runtime package has `jsdom` for DOM tests.
- Render route URL params are a **versioned public contract** (manifest `schemaVersion`, start `1`).
- Lint/format: `oxlint` / `oxfmt`. Double-quote strings, match existing style.
- Commit after every task. Branch: work on `staging` (project convention — no feature branches).

---

## File Structure

- `packages/runtime/src/preview-host.tsx` — extend `readSelectionFromUrl` (theme/layout) + apply theme on mount. (modify)
- `packages/runtime/src/preview-host.test.tsx` / `.layout.test.tsx` — URL-param + clean-DOM tests. (modify)
- `packages/vite-plugin/src/plugin.ts` — add `schemaVersion`; extract `assembleManifest`; mount `/__pl__/mcp`. (modify)
- `packages/vite-plugin/src/assemble-manifest.ts` — manifest assembly extracted from the route, reused by route + MCP. (create)
- `packages/vite-plugin/src/changed-stories.ts` — git-diff → changed components/stories. (create)
- `packages/vite-plugin/src/mcp-server.ts` — MCP server + 6 read-only tools + stateless HTTP handler. (create)
- `packages/vite-plugin/src/*.test.ts` — tests for the three new modules. (create)
- `examples/starter/src/docs/agents.stories.md` — dogfood doc for the agent surface. (create)
- `README.md` — "For agents" section. (modify)

---

## Task 1: Render route — theme + layout URL params

**Files:**
- Modify: `packages/runtime/src/preview-host.tsx` (`readSelectionFromUrl`, `App` mount effect)
- Test: `packages/runtime/src/preview-host.test.tsx`

**Interfaces:**
- Consumes: existing `ActiveSelection` type, `Layout` from config.
- Produces: `readSelectionFromUrl()` now also returns `layout?: Layout`; `App` applies `theme` URL param by toggling `.dark` on mount. URL contract: `?component=&story=&viewport=desktop|mobile&theme=light|dark&layout=padded|centered|fullscreen`.

- [ ] **Step 1: Write failing tests**

In `preview-host.test.tsx` add (adapt imports to the file's existing test harness — it uses jsdom + `window.location`):

```tsx
import { readSelectionFromUrl } from "./preview-host.js"; // export it (Step 3)

function setUrl(search: string) {
  window.history.replaceState({}, "", `/__pl__/${search}`);
}

test("reads layout param when present", () => {
  setUrl("?component=button&story=primary&viewport=desktop&layout=centered");
  expect(readSelectionFromUrl()).toEqual({
    componentId: "button",
    storyId: "primary",
    viewport: "desktop",
    layout: "centered",
  });
});

test("omits layout when absent", () => {
  setUrl("?component=button&story=primary&viewport=desktop");
  const sel = readSelectionFromUrl();
  expect(sel).not.toBeNull();
  expect(sel!.layout).toBeUndefined();
});

test("ignores invalid layout value", () => {
  setUrl("?component=button&story=primary&viewport=desktop&layout=bogus");
  expect(readSelectionFromUrl()!.layout).toBeUndefined();
});
```

- [ ] **Step 2: Run, verify fail**

Run: `pnpm --filter @gobrand/openstory-runtime test`
Expected: FAIL — `readSelectionFromUrl` not exported / `layout` undefined in result.

- [ ] **Step 3: Implement**

In `preview-host.tsx`, export and extend `readSelectionFromUrl`:

```tsx
const VALID_LAYOUTS: ReadonlySet<string> = new Set(["padded", "centered", "fullscreen"]);

export function readSelectionFromUrl(): ActiveSelection | null {
  const params = new URLSearchParams(window.location.search);
  const componentId = params.get("component");
  const storyId = params.get("story");
  const viewport = params.get("viewport") as "desktop" | "mobile" | null;
  if (!componentId || !storyId || !viewport) return null;
  const rawLayout = params.get("layout");
  const layout = rawLayout && VALID_LAYOUTS.has(rawLayout) ? (rawLayout as Layout) : undefined;
  return { componentId, storyId, viewport, ...(layout && { layout }) };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `pnpm --filter @gobrand/openstory-runtime test`
Expected: PASS.

- [ ] **Step 5: Apply theme on mount (test first)**

Add test:

```tsx
import { render } from "@testing-library/react"; // if present; else mount via createRoot like sibling tests
test("theme=dark toggles .dark on documentElement", () => {
  setUrl("?component=button&story=primary&viewport=desktop&theme=dark");
  // mount <App/> (use the file's existing mount pattern, e.g. mountPreviewHost on a fresh node)
  // assert after mount:
  expect(document.documentElement.classList.contains("dark")).toBe(true);
});

test("theme=light (or absent) leaves .dark off", () => {
  document.documentElement.classList.remove("dark");
  setUrl("?component=button&story=primary&viewport=desktop");
  // mount <App/>
  expect(document.documentElement.classList.contains("dark")).toBe(false);
});
```

Run: FAIL.

- [ ] **Step 6: Implement theme apply**

In `App`, add an effect that runs once on mount:

```tsx
useEffect(() => {
  const theme = new URLSearchParams(window.location.search).get("theme");
  if (theme === "dark") document.documentElement.classList.add("dark");
}, []);
```

(Place alongside the existing manifest/ready effect. The `os:theme` postMessage path is unchanged — manager still wins at runtime.)

Run: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/runtime/src/preview-host.tsx packages/runtime/src/preview-host.test.tsx
git commit -m "feat(runtime): theme + layout URL params for headless render"
```

---

## Task 2: Clean-DOM invariant test

**Files:**
- Test: `packages/runtime/src/preview-host.layout.test.tsx`

**Interfaces:**
- Consumes: `PreviewStage` / `mountPreviewHost`.
- Produces: a guard that OpenStory's measure wrapper/canvas adds no ARIA roles, landmarks, or headings around the rendered component — so an agent's accessibility-tree snapshot is the component's own semantics.

- [ ] **Step 1: Write failing test**

```tsx
test("render wrapper adds no aria roles or landmarks around the component", () => {
  // mount a PreviewStage for a fixture whose component renders a <button>Save</button>
  // (reuse the layout test file's existing fixture/config builders)
  const root = /* mounted container */;
  // The only interactive/landmark node must be the component's own button:
  expect(root.querySelectorAll("[role]").length).toBe(0); // no injected roles
  expect(root.querySelector("nav, header, main, aside")).toBeNull();
  expect(root.querySelector("button")?.textContent).toBe("Save");
});
```

- [ ] **Step 2: Run, verify pass-or-fix**

Run: `pnpm --filter @gobrand/openstory-runtime test`
Expected: PASS (current wrappers are plain styled `div`s). If it FAILS, the wrapper introduced a role/landmark — remove it from `MeasuredStage` until green. This test is the invariant; keep it.

- [ ] **Step 3: Commit**

```bash
git add packages/runtime/src/preview-host.layout.test.tsx
git commit -m "test(runtime): assert clean accessibility tree around rendered story"
```

---

## Task 3: Manifest `schemaVersion`

**Files:**
- Modify: `packages/vite-plugin/src/plugin.ts` (`buildManifest`)
- Test: `packages/vite-plugin/src/plugin.test.ts`

**Interfaces:**
- Produces: `buildManifest(...)` return gains `schemaVersion: 1` (top-level integer).

- [ ] **Step 1: Failing test**

```ts
test("manifest carries schemaVersion 1", () => {
  const m = buildManifest({ components: [] });
  expect(m.schemaVersion).toBe(1);
});
```

Run: `pnpm --filter @gobrand/openstory-vite test` → FAIL.

- [ ] **Step 2: Implement**

In `buildManifest`, add to the returned object: `schemaVersion: 1 as const,` (alongside `components`, `docs`).

- [ ] **Step 3: Run → PASS, commit**

```bash
git add packages/vite-plugin/src/plugin.ts packages/vite-plugin/src/plugin.test.ts
git commit -m "feat(vite): version the manifest schema (schemaVersion=1)"
```

---

## Task 4: Extract `assembleManifest` (reuse for route + MCP)

**Files:**
- Create: `packages/vite-plugin/src/assemble-manifest.ts`
- Modify: `packages/vite-plugin/src/plugin.ts` (manifest route calls the helper)
- Test: `packages/vite-plugin/src/assemble-manifest.test.ts`

**Interfaces:**
- Produces: `async function assembleManifest(deps): Promise<Manifest>` where `deps = { projectRoot: string; resolvedConfigPath: string | null; ssrLoadModule(p): Promise<any>; readFile(abs): string }`. Returns the same object `buildManifest` produces today (the route's current inline logic moves here verbatim). `Manifest` type exported.

- [ ] **Step 1: Failing test**

```ts
import { assembleManifest } from "./assemble-manifest.js";

test("assembleManifest returns components + docs + schemaVersion from a config module", async () => {
  const m = await assembleManifest({
    projectRoot: "/proj",
    resolvedConfigPath: null, // zero-config path
    ssrLoadModule: async () => ({}),
    readFile: () => "",
  });
  expect(m.schemaVersion).toBe(1);
  expect(Array.isArray(m.components)).toBe(true);
  expect(Array.isArray(m.docs)).toBe(true);
});
```

Run: FAIL (module missing).

- [ ] **Step 2: Implement** — move the body of the `/manifest.json` handler (config load → `resolvePatterns` → `matchFiles` → `partitionByExtension` → `discoverComponentsFrom` → `mergeComponents` → `discoverDocs` → embed validation → `buildManifest`) into `assembleManifest`, taking IO via `deps`. Export `Manifest = Awaited<ReturnType<typeof assembleManifest>>`.

- [ ] **Step 3: Rewire route** — in `configureServer`, the `/manifest.json` branch becomes:

```ts
const manifest = await assembleManifest({
  projectRoot,
  resolvedConfigPath,
  ssrLoadModule: (p) => server.ssrLoadModule(p),
  readFile: (abs) => readFileSync(abs, "utf8"),
});
res.setHeader("content-type", "application/json");
res.end(JSON.stringify(manifest));
```

- [ ] **Step 4: Run plugin tests → PASS** (route behavior unchanged). 

Run: `pnpm --filter @gobrand/openstory-vite test`

- [ ] **Step 5: Commit**

```bash
git add packages/vite-plugin/src/assemble-manifest.ts packages/vite-plugin/src/assemble-manifest.test.ts packages/vite-plugin/src/plugin.ts
git commit -m "refactor(vite): extract assembleManifest for route + MCP reuse"
```

---

## Task 5: `changed-stories` git helper

**Files:**
- Create: `packages/vite-plugin/src/changed-stories.ts`
- Test: `packages/vite-plugin/src/changed-stories.test.ts`

**Interfaces:**
- Produces: `function changedStories(manifest: Manifest, changedFiles: string[]): Array<{ id: string; name: string; stories: {id:string;label:string}[] }>` — components whose absolute `sourcePath` is in `changedFiles`. Pure; git IO injected by caller. Also `function gitChangedFiles(projectRoot: string, base?: string): { files: string[] | null }` — runs `git diff --name-only [base]` via `child_process.execFileSync`, returns absolute paths, or `{ files: null }` on any error (not a repo, git missing).

- [ ] **Step 1: Failing tests**

```ts
import { changedStories } from "./changed-stories.js";

const manifest = {
  schemaVersion: 1, docs: [],
  components: [
    { id: "button", name: "Button", sourcePath: "/p/src/button.tsx", stories: [{ id: "primary", label: "Primary" }] },
    { id: "badge", name: "Badge", sourcePath: "/p/src/badge.tsx", stories: [{ id: "ok", label: "Ok" }] },
  ],
} as any;

test("returns only components whose sourcePath changed", () => {
  const r = changedStories(manifest, ["/p/src/button.tsx"]);
  expect(r.map((c) => c.id)).toEqual(["button"]);
  expect(r[0].stories).toEqual([{ id: "primary", label: "Primary" }]);
});

test("empty when nothing matches", () => {
  expect(changedStories(manifest, ["/p/src/unrelated.ts"])).toEqual([]);
});
```

Run: FAIL.

- [ ] **Step 2: Implement** `changedStories` (filter by `Set(changedFiles)`) and `gitChangedFiles`:

```ts
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

export function gitChangedFiles(projectRoot: string, base?: string): { files: string[] | null } {
  try {
    const args = ["diff", "--name-only", ...(base ? [base] : [])];
    const out = execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" });
    const files = out.split("\n").map((l) => l.trim()).filter(Boolean).map((rel) => resolve(projectRoot, rel));
    return { files };
  } catch {
    return { files: null };
  }
}
```

- [ ] **Step 3: Run → PASS, commit**

```bash
git add packages/vite-plugin/src/changed-stories.ts packages/vite-plugin/src/changed-stories.test.ts
git commit -m "feat(vite): changedStories git-diff helper"
```

---

## Task 6: MCP server module (read-only tools)

**Files:**
- Modify: `packages/vite-plugin/package.json` (add `@modelcontextprotocol/sdk`)
- Create: `packages/vite-plugin/src/mcp-server.ts`
- Test: `packages/vite-plugin/src/mcp-server.test.ts`

**Interfaces:**
- Consumes: `assembleManifest` deps, `changedStories`/`gitChangedFiles`, `Manifest`.
- Produces:
  - `function buildMcpTools(ctx): McpToolset` — pure registry mapping tool name → handler, where `ctx = { getManifest(): Promise<Manifest>; projectRoot: string; baseUrl: string; gitChangedFiles: typeof gitChangedFiles }`. Six tools: `list_components`, `list_stories`, `get_component_props`, `get_story_source`, `get_changed_stories`, `get_render_url`.
  - `get_render_url` returns a **structured object** `{ url, component, story, viewport, theme }` (not a bare string) — `url = `${baseUrl}/__pl__/?component=…&story=…&viewport=…&theme=…[&layout=…]``.
  - `function createMcpServer(ctx): McpServer` — wires `buildMcpTools` into an `@modelcontextprotocol/sdk` `McpServer`, each tool registered with a zod input schema, returning `{ content: [{ type: "text", text: JSON.stringify(result) }] }`.

- [ ] **Step 1: Add dep**

```bash
cd packages/vite-plugin && pnpm add @modelcontextprotocol/sdk && pnpm add -D zod && cd ../..
```

(zod is the SDK's tool-schema lib; pin whatever the SDK peer-expects.)

- [ ] **Step 2: Failing tests for the pure registry** (`buildMcpTools`, no transport):

```ts
import { buildMcpTools } from "./mcp-server.js";

const manifest = {
  schemaVersion: 1, docs: [],
  components: [{
    id: "button", name: "Button", group: "", section: "", stories: [{ id: "primary", label: "Primary", props: { variant: "primary" } }],
    controls: { variant: { name: "variant", type: "enum", options: ["primary","danger"] } },
    sourcePath: "/p/src/button.tsx",
  }],
} as any;

const ctx = {
  getManifest: async () => manifest,
  projectRoot: "/p",
  baseUrl: "http://localhost:5180",
  gitChangedFiles: () => ({ files: ["/p/src/button.tsx"] }),
  readFile: () => "export const Button = () => null;",
};

test("list_components returns id/name/stories", async () => {
  const r = await buildMcpTools(ctx).list_components.handler({});
  expect(r[0]).toMatchObject({ id: "button", name: "Button" });
});

test("get_render_url builds a structured, navigable URL", async () => {
  const r = await buildMcpTools(ctx).get_render_url.handler({ component: "button", story: "primary", theme: "dark" });
  expect(r).toMatchObject({ component: "button", story: "primary", viewport: "desktop", theme: "dark" });
  expect(r.url).toBe("http://localhost:5180/__pl__/?component=button&story=primary&viewport=desktop&theme=dark");
});

test("get_changed_stories maps git diff to stories", async () => {
  const r = await buildMcpTools(ctx).get_changed_stories.handler({});
  expect(r.changed.map((c: any) => c.id)).toEqual(["button"]);
});

test("get_story_source returns path + contents", async () => {
  const r = await buildMcpTools(ctx).get_story_source.handler({ component: "button" });
  expect(r.sourcePath).toBe("/p/src/button.tsx");
  expect(r.source).toContain("Button");
});
```

Run: FAIL.

- [ ] **Step 3: Implement `buildMcpTools`** — each tool a `{ description, inputSchema, handler }`. `get_render_url` composes the URL with `URLSearchParams` (viewport default `desktop`, theme default omitted-as-light, layout appended only when provided). `get_changed_stories` calls `ctx.gitChangedFiles(projectRoot, base)`; when `files === null` return `{ changed: [...all stories...], degraded: "not-a-git-repo" }`. `get_story_source` reads `ctx.readFile(sourcePath)`.

- [ ] **Step 4: Run → PASS.**

- [ ] **Step 5: Implement `createMcpServer`** wrapping the registry into `McpServer` (zod schemas, text-JSON results). No dedicated unit test for the SDK wiring here — covered by the integration test in Task 7.

- [ ] **Step 6: Commit**

```bash
git add packages/vite-plugin/package.json pnpm-lock.yaml packages/vite-plugin/src/mcp-server.ts packages/vite-plugin/src/mcp-server.test.ts
git commit -m "feat(vite): read-only MCP toolset (6 tools) over the manifest"
```

---

## Task 7: Mount MCP at `/__pl__/mcp` + integration test

**Files:**
- Modify: `packages/vite-plugin/src/plugin.ts` (`configureServer`)
- Test: `packages/vite-plugin/src/plugin.test.ts` (add MCP integration)

**Interfaces:**
- Consumes: `createMcpServer`, `assembleManifest`, `gitChangedFiles`.
- Produces: middleware branch for `/__pl__/mcp` using the SDK's **Streamable HTTP transport in stateless mode** (`sessionIdGenerator: undefined`), creating a fresh server+transport per request. `baseUrl` derived from the request `Host` header (fallback `http://localhost`).

- [ ] **Step 1: Failing integration test** — boot a Vite dev server on `examples/starter` with the plugin, POST a JSON-RPC `tools/list` to `/__pl__/mcp`, assert the six tool names present; POST `tools/call` for `get_render_url` and assert the URL. (Model on Storybook's curl JSON-RPC tests. Use Vite's `createServer` + `server.listen()` in the test, like any existing plugin integration test; if none exists, drive the middleware via a mock `req/res`.)

```ts
test("MCP endpoint lists the six tools", async () => {
  const res = await rpc("/__pl__/mcp", { method: "tools/list", params: {} });
  const names = res.result.tools.map((t: any) => t.name).sort();
  expect(names).toEqual([
    "get_changed_stories","get_component_props","get_render_url","get_story_source","list_components","list_stories",
  ]);
});
```

Run: FAIL.

- [ ] **Step 2: Implement the route** in `configureServer`, before the final `next()`:

```ts
if (url === "/mcp" || req.url === "/__pl__/mcp") {
  const host = (req.headers.host as string) || "localhost";
  const baseUrl = `http://${host}`;
  const mcp = createMcpServer({
    projectRoot,
    baseUrl,
    getManifest: () => assembleManifest({ projectRoot, resolvedConfigPath, ssrLoadModule: (p) => server.ssrLoadModule(p), readFile: (abs) => readFileSync(abs, "utf8") }),
    gitChangedFiles,
    readFile: (abs) => readFileSync(abs, "utf8"),
  });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { transport.close(); mcp.close(); });
  await mcp.connect(transport);
  await transport.handleRequest(req, res);
  return;
}
```

- [ ] **Step 3: Run → PASS, commit**

```bash
git add packages/vite-plugin/src/plugin.ts packages/vite-plugin/src/plugin.test.ts
git commit -m "feat(vite): mount read-only MCP server at /__pl__/mcp"
```

---

## Task 8: Full-suite + typecheck gate

- [ ] **Step 1:** `pnpm typecheck` → no errors.
- [ ] **Step 2:** `pnpm test` → all packages green.
- [ ] **Step 3:** `pnpm lint && pnpm format` → clean.
- [ ] **Step 4:** Commit any formatting: `git commit -am "chore: lint/format agent-first surface"` (skip if nothing changed).

---

## Task 9: Docs — agent README section + dogfood stories.md

**Files:**
- Modify: `README.md`
- Create: `examples/starter/src/docs/agents.stories.md`

- [ ] **Step 1:** Add a `## For agents` section to `README.md`: the URL contract (`/__pl__/?component=&story=&viewport=&theme=&layout=`), the MCP endpoint (`/__pl__/mcp`, HTTP transport, read-only), the six tools (one line each), and the loop (`get_changed_stories` → `get_render_url` → browser-MCP snapshot). Note screenshots are an opt-in future package; core has no Chromium.

- [ ] **Step 2:** Write `agents.stories.md` in the project's `*.stories.md` format (frontmatter `title: For Agents`, `group: OpenStory`, `status: shipped`, `owner: core`). Prose explains the agent surface and embeds a live story: `:::story button--primary` (verify the id exists in the starter before committing). It dogfoods the docs system while documenting the agent feature.

- [ ] **Step 3: Commit**

```bash
git add README.md examples/starter/src/docs/agents.stories.md
git commit -m "docs: agent-facing render/MCP contract + dogfood stories.md"
```

---

## Self-Review

- **Spec coverage:** P0 render route → T1/T2; `schemaVersion` → T3; `assembleManifest` reuse → T4; `get_changed_stories` → T5/T6; all six MCP tools + read-only + structured `get_render_url` → T6; HTTP transport mount at `/__pl__/mcp` → T7; testing (render contract, tool units, MCP integration, clean-DOM) → T1/T2/T6/T7; docs + dogfood → T9. Deferred items (screenshot package, MCP-Apps, auth, docs/page URL mode) intentionally absent.
- **Type consistency:** `assembleManifest` → `Manifest` consumed by `changedStories`, `buildMcpTools`, route, MCP mount. `get_render_url` shape `{url,component,story,viewport,theme}` consistent T6↔README. `gitChangedFiles` `{files: string[]|null}` consumed in T6 degrade path + T7 mount.
- **Placeholders:** none — DOM mount steps reference the file's existing mount pattern (createRoot/jsdom) rather than inventing one, since the runtime tests already establish it.
