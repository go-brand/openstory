# Inter-doc Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make links inside feature docs (`*.stories.md`) clickable — navigating to another doc page, a component's auto-docs, a specific story, or an external URL (in the real browser).

**Architecture:** The vite-plugin resolves relative markdown links to canonical `openstory:` custom-scheme hrefs at build time (where the full manifest is in hand). The runtime's `DocHost` intercepts clicks on those anchors and posts a new `pl:navigate` message up to the manager (joining the existing `pl:ready`/`pl:size` upward family). The manager maps each navigation to its existing selection IPC; external URLs go through a scheme-guarded `shell.openExternal`.

**Tech Stack:** TypeScript, React 18, marked v18 (markdown), Vitest (jsdom), Electron IPC, pnpm workspaces + turbo.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-30-inter-doc-navigation-design.md`.
- **Encoding:** internal links become real `<a href="openstory:…">` anchors (keyboard-focusable, screen-reader-announced) — never hrefless `data-` attributes.
- **Custom-scheme grammar (exact):** `openstory:page/<id>`, `openstory:docs/<componentId>`, `openstory:story/<componentId>/<storyId>`. Every id segment is `encodeURIComponent`-encoded on write and `decodeURIComponent`-decoded on read.
- **External schemes allowed:** `http:`, `https:`, `mailto:` only. All others are blocked/inert.
- **Unresolved internal link:** `console.warn` (doc path + href + reason) and render link text inert as `<span class="openstory-doc-deadlink">`. Never throw — one typo must not break the preview.
- **No third-party YAML / glob libs** (existing supply-chain rule) — does not arise here; do not introduce new deps. `marked` is already a vite-plugin dependency.
- **Type duplication boundary:** the desktop app does NOT depend on `@gobrand/openstory-runtime`; mirror `NavigateTarget` on the desktop side rather than importing it (same rule as `Layout` in `electron/types.ts`).
- **Test commands** (run only the touched package — never repo-wide):
  - vite-plugin: `pnpm --filter @gobrand/openstory-vite exec vitest run <file>`
  - runtime: `pnpm --filter @gobrand/openstory-runtime exec vitest run <file>`
  - desktop: `pnpm --filter openstory-desktop exec vitest run <file>`
- **Commit trailer (every commit):**
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- **Branch:** work directly on `staging` (no feature branches).

---

### Task 1: `pl:navigate` bridge message (runtime contract)

**Files:**
- Modify: `packages/runtime/src/bridge.ts`
- Test: `packages/runtime/src/bridge.test.ts`

**Interfaces:**
- Produces: `NavigateTarget` (discriminated union) and `NavigateMessage` types; `pl:navigate` added to `BridgeMessage` union + `KNOWN_TYPES`. Consumed by Task 2 (runtime click handler) and mirrored by Task 6 (manager dispatch).

- [ ] **Step 1: Write the failing test** — append to `packages/runtime/src/bridge.test.ts`:

```ts
it('accepts a valid pl:navigate message', () => {
  const msg = {
    type: 'pl:navigate',
    target: { kind: 'page', id: 'design-system' },
  } as const;
  const result = parseBridgeMessage(msg);
  expect(result?.type).toBe('pl:navigate');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-runtime exec vitest run src/bridge.test.ts`
Expected: FAIL — `parseBridgeMessage` returns `null` for the unknown `pl:navigate` type, so `result?.type` is `undefined`.

- [ ] **Step 3: Write minimal implementation** — in `packages/runtime/src/bridge.ts`, add the types after `RenderMessage` (before `ReadyMessage`):

```ts
/** Where a clicked in-doc link should navigate. Posted by DocHost (runtime) to
 *  the manager via `pl:navigate`; the manager maps each kind to a selection IPC.
 *  `external` opens in the user's real browser. */
export type NavigateTarget =
  | { kind: "page"; id: string }
  | { kind: "docs"; componentId: string }
  | { kind: "story"; componentId: string; storyId: string }
  | { kind: "external"; href: string };

export type NavigateMessage = {
  type: "pl:navigate";
  target: NavigateTarget;
};
```

Add `NavigateMessage` to the `BridgeMessage` union:

```ts
export type BridgeMessage =
  | RenderMessage
  | ReadyMessage
  | ManifestMessage
  | SizeMessage
  | NavigateMessage;
```

Add `"pl:navigate"` to `KNOWN_TYPES`:

```ts
const KNOWN_TYPES = new Set<BridgeMessage["type"]>([
  "pl:render",
  "pl:ready",
  "pl:manifest",
  "pl:size",
  "pl:navigate",
]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-runtime exec vitest run src/bridge.test.ts`
Expected: PASS (all bridge tests).

- [ ] **Step 5: Commit**

```bash
git add packages/runtime/src/bridge.ts packages/runtime/src/bridge.test.ts
git commit -m "feat(runtime): add pl:navigate bridge message + NavigateTarget

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: DocHost click interception (`parseNavTarget` + delegated handler)

**Files:**
- Modify: `packages/runtime/src/doc-host.tsx`
- Test: `packages/runtime/src/doc-host.test.tsx`

**Interfaces:**
- Consumes: `NavigateTarget` from `./bridge.js` (Task 1).
- Produces: `export function parseNavTarget(href: string): NavigateTarget | null`. A delegated `click` listener on the doc root that `preventDefault()`s and posts `{ type: "pl:navigate", target }` to `window.parent`.

- [ ] **Step 1: Write the failing test** — append to `packages/runtime/src/doc-host.test.tsx`. (Add a `parseNavTarget` import to the existing top import: `import { resolveEmbed, parseNavTarget } from "./doc-host.js";`)

```ts
describe("parseNavTarget", () => {
  it("decodes a page link", () => {
    expect(parseNavTarget("openstory:page/design-system")).toEqual({
      kind: "page",
      id: "design-system",
    });
  });
  it("decodes a docs (auto-docs) link", () => {
    expect(parseNavTarget("openstory:docs/button")).toEqual({
      kind: "docs",
      componentId: "button",
    });
  });
  it("decodes a story link", () => {
    expect(parseNavTarget("openstory:story/button/primary")).toEqual({
      kind: "story",
      componentId: "button",
      storyId: "primary",
    });
  });
  it("decodes percent-encoded segments", () => {
    expect(parseNavTarget("openstory:page/a%2Fb")).toEqual({ kind: "page", id: "a/b" });
  });
  it("treats http/https/mailto as external", () => {
    expect(parseNavTarget("https://anthropic.com")).toEqual({
      kind: "external",
      href: "https://anthropic.com",
    });
    expect(parseNavTarget("mailto:a@b.com")).toEqual({
      kind: "external",
      href: "mailto:a@b.com",
    });
  });
  it("returns null for an in-page anchor or unknown href", () => {
    expect(parseNavTarget("#heading")).toBeNull();
    expect(parseNavTarget("openstory:bogus/x")).toBeNull();
    expect(parseNavTarget("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-runtime exec vitest run src/doc-host.test.tsx`
Expected: FAIL — `parseNavTarget` is not exported (`undefined is not a function`).

- [ ] **Step 3: Write minimal implementation** — in `packages/runtime/src/doc-host.tsx`:

Add the import at the top (after the existing imports):

```ts
import type { NavigateTarget } from "./bridge.js";
```

Add the exported parser (place it just above `export function DocHost`):

```ts
// Decode an in-doc anchor href into a navigation target. Internal links carry a
// build-resolved custom scheme (openstory:page/… | docs/… | story/…); each path
// segment is encodeURIComponent'd, so splitting on "/" is unambiguous. External
// http/https/mailto links open in the user's real browser. Anything else (in-page
// #anchors, unknown schemes) returns null and is left to the browser's default.
export function parseNavTarget(href: string): NavigateTarget | null {
  if (/^(?:https?|mailto):/i.test(href)) return { kind: "external", href };
  if (!href.startsWith("openstory:")) return null;
  const segs = href.slice("openstory:".length).split("/").map(decodeURIComponent);
  if (segs[0] === "page" && segs[1]) return { kind: "page", id: segs[1] };
  if (segs[0] === "docs" && segs[1]) return { kind: "docs", componentId: segs[1] };
  if (segs[0] === "story" && segs[1] && segs[2])
    return { kind: "story", componentId: segs[1], storyId: segs[2] };
  return null;
}
```

In the existing `useEffect` that writes `root.innerHTML` (currently ends with `setTargets(arr);`), attach a delegated click listener and return a cleanup. Replace the effect body so it reads:

```ts
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.innerHTML = html;
    const arr: Array<{ id: string; el: HTMLElement }> = [];
    for (const el of root.querySelectorAll<HTMLElement>("[data-openstory-story]")) {
      const id = el.getAttribute("data-openstory-story");
      if (id) arr.push({ id, el });
    }
    setTargets(arr);

    // Intercept clicks on in-doc links. A build-resolved openstory:/external href
    // is handled by posting up to the manager; everything else (in-page anchors,
    // inert deadlink spans) falls through to the browser untouched.
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const target = parseNavTarget(anchor.getAttribute("href") ?? "");
      if (!target) return;
      e.preventDefault();
      window.parent?.postMessage({ type: "pl:navigate", target }, "*");
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [html]);
```

Add the deadlink style to the `DOC_CSS` template (just after the `.openstory-doc a { … }` rule):

```ts
.openstory-doc a.openstory-doc-deadlink, .openstory-doc .openstory-doc-deadlink { color: var(--os-doc-fg-muted); text-decoration: none; cursor: default; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-runtime exec vitest run src/doc-host.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the DOM interception test** — append to `packages/runtime/src/doc-host.test.tsx`. Add these imports at the very top of the file (above the existing imports) and the env directive on line 1:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { DocHost } from "./doc-host.js";
```

Then append the suite:

```ts
describe("DocHost click interception", () => {
  let container: HTMLElement;
  let root: Root;
  function mount(html: string) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => root.render(<DocHost html={html} embeds={[]} components={[]} />));
  }
  afterEach(() => {
    flushSync(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("posts pl:navigate to the parent when an openstory: link is clicked", () => {
    const spy = vi.spyOn(window, "postMessage");
    mount('<p><a href="openstory:story/button/primary">Go</a></p>');
    const a = container.querySelector("a")!;
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(spy).toHaveBeenCalledWith(
      { type: "pl:navigate", target: { kind: "story", componentId: "button", storyId: "primary" } },
      "*",
    );
  });

  it("ignores clicks on non-navigable spans", () => {
    const spy = vi.spyOn(window, "postMessage");
    mount('<p><span class="openstory-doc-deadlink">dead</span></p>');
    container.querySelector("span")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run the DOM test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-runtime exec vitest run src/doc-host.test.tsx`
Expected: PASS (both new suites + the existing `resolveEmbed` suite).

- [ ] **Step 7: Commit**

```bash
git add packages/runtime/src/doc-host.tsx packages/runtime/src/doc-host.test.tsx
git commit -m "feat(runtime): intercept in-doc link clicks, post pl:navigate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Build-time link resolver (pure)

**Files:**
- Create: `packages/vite-plugin/src/resolve-doc-links.ts`
- Test: `packages/vite-plugin/src/resolve-doc-links.test.ts`

**Interfaces:**
- Produces:
  - `type ComponentTarget = { id: string; storyIds: Set<string> }`
  - `type LinkResolveCtx = { fromPath: string; pageByAbsPath: Map<string,string>; componentByAbsPath: Map<string,ComponentTarget> }`
  - `type LinkTarget` (discriminated: `external | passthrough | page | docs | story | inert`)
  - `function resolveLink(href: string, ctx: LinkResolveCtx): LinkTarget`
  - `function linkHtml(target: LinkTarget, href: string, inner: string): string`
- Consumed by Task 4.

- [ ] **Step 1: Write the failing test** — create `packages/vite-plugin/src/resolve-doc-links.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveLink, linkHtml } from "./resolve-doc-links.js";

const ctx = {
  fromPath: "/p/docs/design-system.stories.md",
  pageByAbsPath: new Map([
    ["/p/docs/design-system.stories.md", "design-system"],
    ["/p/docs/how-the-mcp-works.stories.md", "how-the-mcp-works"],
  ]),
  componentByAbsPath: new Map([
    ["/p/components/button.stories.tsx", { id: "button", storyIds: new Set(["primary", "ghost"]) }],
  ]),
};

describe("resolveLink", () => {
  it("resolves a sibling doc to a page target", () => {
    expect(resolveLink("./how-the-mcp-works.stories.md", ctx)).toEqual({
      kind: "page",
      id: "how-the-mcp-works",
    });
  });
  it("resolves a component file with no fragment to auto-docs", () => {
    expect(resolveLink("../components/button.stories.tsx", ctx)).toEqual({
      kind: "docs",
      componentId: "button",
    });
  });
  it("resolves a component file + valid story fragment to a story", () => {
    expect(resolveLink("../components/button.stories.tsx#primary", ctx)).toEqual({
      kind: "story",
      componentId: "button",
      storyId: "primary",
    });
  });
  it("marks a fragment that matches no story inert", () => {
    const r = resolveLink("../components/button.stories.tsx#missing", ctx);
    expect(r.kind).toBe("inert");
  });
  it("marks an unknown relative path inert", () => {
    expect(resolveLink("./nope.stories.md", ctx).kind).toBe("inert");
  });
  it("passes http/https/mailto through as external", () => {
    expect(resolveLink("https://anthropic.com", ctx)).toEqual({ kind: "external" });
    expect(resolveLink("mailto:a@b.com", ctx)).toEqual({ kind: "external" });
  });
  it("marks an unsupported scheme inert", () => {
    expect(resolveLink("ftp://x", ctx).kind).toBe("inert");
  });
  it("leaves a pure in-page anchor as passthrough", () => {
    expect(resolveLink("#section", ctx)).toEqual({ kind: "passthrough" });
  });
});

describe("linkHtml", () => {
  it("emits a custom-scheme anchor for a page", () => {
    expect(linkHtml({ kind: "page", id: "design-system" }, "./x.md", "Text")).toBe(
      '<a href="openstory:page/design-system">Text</a>',
    );
  });
  it("encodes id segments", () => {
    expect(linkHtml({ kind: "story", componentId: "a/b", storyId: "c d" }, "x", "T")).toBe(
      '<a href="openstory:story/a%2Fb/c%20d">T</a>',
    );
  });
  it("keeps external href + adds rel", () => {
    expect(linkHtml({ kind: "external" }, "https://x.com", "T")).toBe(
      '<a href="https://x.com" rel="noopener noreferrer">T</a>',
    );
  });
  it("renders inert as a non-clickable span", () => {
    expect(linkHtml({ kind: "inert", reason: "x" }, "./bad", "T")).toBe(
      '<span class="openstory-doc-deadlink" title="unresolved link">T</span>',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-vite exec vitest run src/resolve-doc-links.test.ts`
Expected: FAIL — module `./resolve-doc-links.js` not found.

- [ ] **Step 3: Write minimal implementation** — create `packages/vite-plugin/src/resolve-doc-links.ts`:

```ts
import { dirname, resolve } from "node:path";

export type ComponentTarget = { id: string; storyIds: Set<string> };

export type LinkResolveCtx = {
  /** Absolute path of the doc the link lives in (links resolve relative to it). */
  fromPath: string;
  /** Absolute doc source path → page id. */
  pageByAbsPath: Map<string, string>;
  /** Absolute component source path → { id, storyIds }. */
  componentByAbsPath: Map<string, ComponentTarget>;
};

export type LinkTarget =
  | { kind: "external" } // http/https/mailto — keep href, open in real browser
  | { kind: "passthrough" } // in-page #anchor — leave to the browser untouched
  | { kind: "page"; id: string }
  | { kind: "docs"; componentId: string }
  | { kind: "story"; componentId: string; storyId: string }
  | { kind: "inert"; reason: string };

const EXTERNAL = /^(?:https?|mailto):/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

// Pure: classify a raw markdown link href against the build manifest. Relative
// paths resolve against the doc's directory; a #fragment on a component file
// selects a story. No I/O, no logging — the caller warns on `inert`.
export function resolveLink(href: string, ctx: LinkResolveCtx): LinkTarget {
  if (!href || href.startsWith("#")) return { kind: "passthrough" };
  if (EXTERNAL.test(href)) return { kind: "external" };
  if (HAS_SCHEME.test(href)) return { kind: "inert", reason: "unsupported link scheme" };

  const hashIdx = href.indexOf("#");
  const pathPart = hashIdx === -1 ? href : href.slice(0, hashIdx);
  const fragment = hashIdx === -1 ? "" : decodeURIComponent(href.slice(hashIdx + 1));
  if (!pathPart) return { kind: "passthrough" };

  const abs = resolve(dirname(ctx.fromPath), pathPart);

  const pageId = ctx.pageByAbsPath.get(abs);
  if (pageId) return { kind: "page", id: pageId };

  const comp = ctx.componentByAbsPath.get(abs);
  if (comp) {
    if (!fragment) return { kind: "docs", componentId: comp.id };
    if (comp.storyIds.has(fragment))
      return { kind: "story", componentId: comp.id, storyId: fragment };
    return { kind: "inert", reason: `story "${fragment}" not found in component "${comp.id}"` };
  }

  return { kind: "inert", reason: "no matching doc or component" };
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Pure: render a resolved target to an anchor (or inert span). `inner` is already
// HTML (the link's rendered inline content). Id segments are percent-encoded so
// the runtime can split the custom-scheme path on "/" unambiguously.
export function linkHtml(target: LinkTarget, href: string, inner: string): string {
  const enc = encodeURIComponent;
  switch (target.kind) {
    case "external":
      return `<a href="${escapeAttr(href)}" rel="noopener noreferrer">${inner}</a>`;
    case "passthrough":
      return `<a href="${escapeAttr(href)}">${inner}</a>`;
    case "page":
      return `<a href="openstory:page/${enc(target.id)}">${inner}</a>`;
    case "docs":
      return `<a href="openstory:docs/${enc(target.componentId)}">${inner}</a>`;
    case "story":
      return `<a href="openstory:story/${enc(target.componentId)}/${enc(target.storyId)}">${inner}</a>`;
    case "inert":
      return `<span class="openstory-doc-deadlink" title="unresolved link">${inner}</span>`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-vite exec vitest run src/resolve-doc-links.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/vite-plugin/src/resolve-doc-links.ts packages/vite-plugin/src/resolve-doc-links.test.ts
git commit -m "feat(vite-plugin): pure resolver for in-doc links

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Wire link resolution into doc discovery + manifest

**Files:**
- Modify: `packages/vite-plugin/src/discover-docs.ts`
- Modify: `packages/vite-plugin/src/assemble-manifest.ts:80-106`
- Test: `packages/vite-plugin/src/discover-docs.test.ts`

**Interfaces:**
- Consumes: `resolveLink`, `linkHtml`, `ComponentTarget`, `LinkResolveCtx` (Task 3).
- Produces: `discoverDocs(docFiles, read, componentByAbsPath?)` — now resolves links during a two-pass render. `parseDoc(source, sourcePath, linkCtx?)` keeps its existing behavior when `linkCtx` is omitted. Adds exported `parseDocMeta` / `renderDoc`.

- [ ] **Step 1: Write the failing test** — append to `packages/vite-plugin/src/discover-docs.test.ts`:

```ts
describe("discoverDocs link resolution", () => {
  it("rewrites a sibling-doc link to an openstory:page href", () => {
    const files = ["/p/a.stories.md", "/p/b.stories.md"];
    const read = (f: string) =>
      f.endsWith("a.stories.md") ? "# A\n\n[to B](./b.stories.md)\n" : "# B\n";
    const docs = discoverDocs(files, read);
    const a = docs.find((d) => d.id === "a")!;
    expect(a.html).toContain('href="openstory:page/b"');
  });

  it("rewrites a component link (+fragment) to docs/story hrefs and warns on a miss", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const components = new Map([
      ["/p/button.stories.tsx", { id: "button", storyIds: new Set(["primary"]) }],
    ]);
    const read = () =>
      "# Doc\n\n[docs](./button.stories.tsx) [story](./button.stories.tsx#primary) [bad](./button.stories.tsx#nope)\n";
    const docs = discoverDocs(["/p/doc.stories.md"], read, components);
    const html = docs[0]!.html;
    expect(html).toContain('href="openstory:docs/button"');
    expect(html).toContain('href="openstory:story/button/primary"');
    expect(html).toContain('class="openstory-doc-deadlink"');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("unresolved link"));
    warn.mockRestore();
  });

  it("keeps an external link with rel=noopener", () => {
    const read = () => "# Doc\n\n[site](https://anthropic.com)\n";
    const docs = discoverDocs(["/p/doc.stories.md"], read);
    expect(docs[0]!.html).toContain('href="https://anthropic.com" rel="noopener noreferrer"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-vite exec vitest run src/discover-docs.test.ts`
Expected: FAIL — current `discoverDocs` emits a raw `<a href="./b.stories.md">`, so `href="openstory:page/b"` is absent.

- [ ] **Step 3: Rewrite `discover-docs.ts`** — replace the whole file with:

```ts
import { basename } from "node:path";
import { Marked, marked, type Tokens } from "marked";
import { humanize, kebabCase, type ManifestDoc } from "@gobrand/openstory-config";
import { deriveSection } from "./derive-section.js";
import {
  resolveLink,
  linkHtml,
  type ComponentTarget,
  type LinkResolveCtx,
} from "./resolve-doc-links.js";

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
// Scalars only. No js-yaml — supply-chain hygiene.
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

export type DocMeta = {
  id: string;
  title: string;
  group: string;
  section: string | null;
  status?: ManifestDoc["status"];
  owner?: string;
  body: string;
  sourcePath: string;
};

// Pass 1: frontmatter + id derivation, no markdown render. Splitting render off
// lets discoverDocs learn every doc's id (to resolve cross-doc links) before any
// doc is rendered.
export function parseDocMeta(source: string, sourcePath: string): DocMeta {
  const { data, body } = parseFrontmatter(source);
  const fileBase = basename(sourcePath).replace(/\.stories\.md$/, "");
  const id = data.id ?? kebabCase(fileBase);
  const title = data.title ?? humanize(fileBase);
  const meta: DocMeta = {
    id,
    title,
    group: data.group ?? "",
    section: deriveSection(sourcePath),
    body,
    sourcePath,
  };
  if (data.status) meta.status = data.status;
  if (data.owner) meta.owner = data.owner;
  return meta;
}

function renderHtml(body: string, linkCtx?: LinkResolveCtx): { html: string; embeds: string[] } {
  const embeds: string[] = [];
  const preprocessed = body.replace(STORY_DIRECTIVE, (_full, id: string) => {
    embeds.push(id);
    return `<div data-openstory-story="${id}" class="openstory-embed"></div>`;
  });

  if (!linkCtx) {
    return { html: marked.parse(preprocessed, { async: false }) as string, embeds };
  }

  // A per-doc renderer so each link resolves against this doc's directory. marked
  // hands `link` the parsed token; we re-render its inner text via parseInline so
  // inline formatting inside the link survives, then swap the href.
  const md = new Marked({
    renderer: {
      link(token: Tokens.Link) {
        const inner = marked.parseInline(token.text, { async: false }) as string;
        const target = resolveLink(token.href, linkCtx);
        if (target.kind === "inert") {
          console.warn(
            `[openstory] doc ${linkCtx.fromPath}: unresolved link '${token.href}' — ${target.reason}. Rendering inert.`,
          );
        }
        return linkHtml(target, token.href, inner);
      },
    },
  });
  return { html: md.parse(preprocessed, { async: false }) as string, embeds };
}

// Pass 2: render a meta into a ManifestDoc, resolving links when a context is given.
export function renderDoc(meta: DocMeta, linkCtx?: LinkResolveCtx): ManifestDoc {
  const { html, embeds } = renderHtml(meta.body, linkCtx);
  const doc: ManifestDoc = {
    id: meta.id,
    title: meta.title,
    group: meta.group,
    section: meta.section,
    html,
    embeds,
    sourcePath: meta.sourcePath,
  };
  if (meta.status) doc.status = meta.status;
  if (meta.owner) doc.owner = meta.owner;
  return doc;
}

// Backward-compatible single-doc parse (no cross-doc link resolution unless a
// context is supplied). Retained for existing call sites/tests.
export function parseDoc(source: string, sourcePath: string, linkCtx?: LinkResolveCtx): ManifestDoc {
  return renderDoc(parseDocMeta(source, sourcePath), linkCtx);
}

export function discoverDocs(
  docFiles: string[],
  read: (abs: string) => string,
  componentByAbsPath: Map<string, ComponentTarget> = new Map(),
): ManifestDoc[] {
  // Pass 1: read + derive ids; dedupe (first wins); build path→id for pages so a
  // doc can link to another doc by file path.
  const metas: DocMeta[] = [];
  const seen = new Set<string>();
  const pageByAbsPath = new Map<string, string>();
  for (const file of docFiles) {
    let source: string;
    try {
      source = read(file);
    } catch (err) {
      console.warn(`[openstory] failed to read ${file}: ${String(err)}`);
      continue;
    }
    const meta = parseDocMeta(source, file);
    if (seen.has(meta.id)) {
      console.warn(
        `[openstory] two docs resolve to id "${meta.id}"; keeping the first. Set frontmatter \`id\` to disambiguate.`,
      );
      continue;
    }
    seen.add(meta.id);
    pageByAbsPath.set(meta.sourcePath, meta.id);
    metas.push(meta);
  }

  // Pass 2: render each kept doc with cross-doc + component link resolution.
  return metas.map((meta) =>
    renderDoc(meta, { fromPath: meta.sourcePath, pageByAbsPath, componentByAbsPath }),
  );
}
```

- [ ] **Step 4: Wire `componentByAbsPath` in `assemble-manifest.ts`** — replace the doc-discovery block (currently `const docs = discoverDocs(docFiles, (abs) => readFile(abs));` near line 94) with:

```ts
  // Map each component's absolute source path → { id, storyIds } so doc links to
  // a component file resolve to its auto-docs (no fragment) or a story (#story).
  const componentByAbsPath = new Map<string, { id: string; storyIds: Set<string> }>();
  for (const c of components) {
    if (!c.sourcePath) continue;
    componentByAbsPath.set(resolve(projectRoot, c.sourcePath), {
      id: c.id,
      storyIds: new Set(c.fixtures.map((f) => f.id)),
    });
  }
  const docs = discoverDocs(docFiles, (abs) => readFile(abs), componentByAbsPath);
```

(`resolve` is already imported at the top of `assemble-manifest.ts`.)

- [ ] **Step 5: Run the full vite-plugin suite to verify it passes**

Run: `pnpm --filter @gobrand/openstory-vite exec vitest run src/discover-docs.test.ts src/assemble-manifest.test.ts`
Expected: PASS — new link-resolution tests pass; existing `parseDoc`/`discoverDocs`/`assemble-manifest` tests still pass (the `parseDoc` and 2-arg `discoverDocs` signatures are unchanged for callers that omit the new argument).

- [ ] **Step 6: Typecheck the package**

Run: `pnpm --filter @gobrand/openstory-vite typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/vite-plugin/src/discover-docs.ts packages/vite-plugin/src/assemble-manifest.ts packages/vite-plugin/src/discover-docs.test.ts
git commit -m "feat(vite-plugin): resolve in-doc links during manifest assembly

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `shell:openExternal` IPC (scheme-guarded) + sidebar `mode` fold

**Files:**
- Create: `apps/desktop/electron/external-url.ts`
- Test: `apps/desktop/electron/external-url.test.ts`
- Modify: `apps/desktop/electron/ipc.ts` (add handler; fold `mode` into `preview:set` / `preview:setDocs` / `preview:setPage`)
- Modify: `apps/desktop/electron/types.ts:104-130` (add `shell:openExternal` to `IpcInvoke`)

**Interfaces:**
- Produces: `function allowedExternalUrl(href: string): string | null` and the `"shell:openExternal": (href: string) => void` IPC channel (consumed by Task 6's dispatch). Folds `mode` so selecting a story/auto-docs implies `design` mode and selecting a page implies `docs` mode. (Defined before Task 6 so the channel type exists when the renderer consumes it.)

- [ ] **Step 1: Write the failing test** — create `apps/desktop/electron/external-url.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { allowedExternalUrl } from "./external-url";

describe("allowedExternalUrl", () => {
  it("allows http, https, and mailto", () => {
    expect(allowedExternalUrl("https://anthropic.com")).toBe("https://anthropic.com/");
    expect(allowedExternalUrl("http://x.test/a")).toBe("http://x.test/a");
    expect(allowedExternalUrl("mailto:a@b.com")).toBe("mailto:a@b.com");
  });
  it("rejects dangerous schemes", () => {
    expect(allowedExternalUrl("file:///etc/passwd")).toBeNull();
    expect(allowedExternalUrl("javascript:alert(1)")).toBeNull();
    expect(allowedExternalUrl("data:text/html,<script>")).toBeNull();
  });
  it("rejects malformed input", () => {
    expect(allowedExternalUrl("not a url")).toBeNull();
    expect(allowedExternalUrl("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter openstory-desktop exec vitest run electron/external-url.test.ts`
Expected: FAIL — module `./external-url` not found.

- [ ] **Step 3: Write minimal implementation** — create `apps/desktop/electron/external-url.ts`:

```ts
// Scheme allowlist for shell.openExternal. Handing it file:/javascript:/etc. is a
// documented Electron footgun, so only http(s)/mailto pass. Returns the parsed,
// normalized URL string when allowed, else null.
const ALLOWED = new Set(["http:", "https:", "mailto:"]);

export function allowedExternalUrl(href: string): string | null {
  try {
    const url = new URL(href);
    return ALLOWED.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter openstory-desktop exec vitest run electron/external-url.test.ts`
Expected: PASS.

- [ ] **Step 5: Register the IPC handler** — in `apps/desktop/electron/ipc.ts`:

Ensure `shell` is imported from electron (add to the existing electron import, e.g. `import { ipcMain, shell } from "electron";`), and add the import:

```ts
import { allowedExternalUrl } from "./external-url.js";
```

Add the handler (place it next to the other `preview:*` handlers):

```ts
  ipcMain.handle("shell:openExternal", (_e, href: string) => {
    const url = allowedExternalUrl(href);
    if (url) void shell.openExternal(url);
    else console.warn(`[openstory] blocked openExternal: ${href}`);
  });
```

- [ ] **Step 6: Fold `mode` into the selection handlers** — in `apps/desktop/electron/ipc.ts`, add `mode` to three `patchSelection` calls so cross-tree navigation reveals the target in the correct sidebar tree:

In `preview:set` (the object passed to `patchSelection`), add `mode: "design"`:

```ts
      deps.store.patchSelection({
        ...input,
        propOverrides: {},
        layout: null,
        docsComponentId: null,
        pageId: null,
        mode: "design",
      });
```

In `preview:setDocs`:

```ts
  ipcMain.handle("preview:setDocs", (_e, componentId: string | null) => {
    deps.store.patchSelection({ docsComponentId: componentId, pageId: null, mode: "design" });
    broadcastState();
  });
```

In `preview:setPage` (add `mode: "docs"` to the existing patch object):

```ts
    deps.store.patchSelection({
      pageId,
      componentId: null,
      storyId: null,
      docsComponentId: null,
      propOverrides: {},
      layout: null,
      mode: "docs",
    });
```

- [ ] **Step 7: Add the channel to `IpcInvoke`** — in `apps/desktop/electron/types.ts`, inside the `IpcInvoke` type (after `"preview:refreshManifest"`):

```ts
  "shell:openExternal": (href: string) => void;
```

- [ ] **Step 8: Typecheck the desktop app**

Run: `pnpm --filter openstory-desktop typecheck`
Expected: no errors (the new channel type-checks; the renderer does not yet consume it — that lands in Task 6).

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/electron/external-url.ts apps/desktop/electron/external-url.test.ts apps/desktop/electron/ipc.ts apps/desktop/electron/types.ts
git commit -m "feat(desktop): scheme-guarded shell:openExternal + mode fold for nav

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Manager dispatch of `pl:navigate`

**Files:**
- Modify: `apps/desktop/src/lib/use-harness-bridge.ts`
- Test: `apps/desktop/src/lib/use-harness-bridge.test.ts` (create)

**Interfaces:**
- Consumes: existing `Api` (`./api`), existing IPC channels `preview:setPage` / `preview:setDocs` / `preview:set`, and `shell:openExternal` (added to `IpcInvoke` in Task 5).
- Produces: `export type NavigateTarget` (mirror) and `export function dispatchNavigate(api, target, viewport)`. The `onMessage` listener gains a `pl:navigate` branch.

- [ ] **Step 1: Write the failing test** — create `apps/desktop/src/lib/use-harness-bridge.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { dispatchNavigate, type NavigateTarget } from "./use-harness-bridge";

function fakeApi() {
  const invoke = vi.fn();
  return { api: { invoke } as never, invoke };
}

describe("dispatchNavigate", () => {
  it("routes page → preview:setPage", () => {
    const { api, invoke } = fakeApi();
    dispatchNavigate(api, { kind: "page", id: "design-system" }, "desktop");
    expect(invoke).toHaveBeenCalledWith("preview:setPage", "design-system");
  });
  it("routes docs → preview:setDocs", () => {
    const { api, invoke } = fakeApi();
    dispatchNavigate(api, { kind: "docs", componentId: "button" }, "desktop");
    expect(invoke).toHaveBeenCalledWith("preview:setDocs", "button");
  });
  it("routes story → preview:set with the current viewport", () => {
    const { api, invoke } = fakeApi();
    const t: NavigateTarget = { kind: "story", componentId: "button", storyId: "primary" };
    dispatchNavigate(api, t, "mobile");
    expect(invoke).toHaveBeenCalledWith("preview:set", {
      componentId: "button",
      storyId: "primary",
      viewport: "mobile",
    });
  });
  it("routes external → shell:openExternal", () => {
    const { api, invoke } = fakeApi();
    dispatchNavigate(api, { kind: "external", href: "https://anthropic.com" }, "desktop");
    expect(invoke).toHaveBeenCalledWith("shell:openExternal", "https://anthropic.com");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter openstory-desktop exec vitest run src/lib/use-harness-bridge.test.ts`
Expected: FAIL — `dispatchNavigate` is not exported.

- [ ] **Step 3: Write minimal implementation** — in `apps/desktop/src/lib/use-harness-bridge.ts`:

Add near the top (after the existing imports):

```ts
// Mirrors @gobrand/openstory-runtime's NavigateTarget. Duplicated (not imported)
// because the desktop does not depend on the runtime package — same boundary
// rationale as `Layout` in electron/types.ts. The message arrives as plain JSON,
// so structural typing is sufficient.
export type NavigateTarget =
  | { kind: "page"; id: string }
  | { kind: "docs"; componentId: string }
  | { kind: "story"; componentId: string; storyId: string }
  | { kind: "external"; href: string };

// Map a clicked in-doc link to the manager's existing selection IPC. A `story`
// preserves the user's current viewport; `external` opens in the real browser.
export function dispatchNavigate(
  api: NonNullable<Api>,
  target: NavigateTarget,
  viewport: "desktop" | "mobile",
): void {
  switch (target.kind) {
    case "page":
      api.invoke("preview:setPage", target.id);
      break;
    case "docs":
      api.invoke("preview:setDocs", target.componentId);
      break;
    case "story":
      api.invoke("preview:set", {
        componentId: target.componentId,
        storyId: target.storyId,
        viewport,
      });
      break;
    case "external":
      api.invoke("shell:openExternal", target.href);
      break;
  }
}
```

In the `onMessage` listener (the `useEffect` with `[]` deps, around lines 160-182), add a branch alongside the existing `pl:size` handling:

```ts
      else if (type === "pl:navigate") {
        const api = apiRef.current;
        if (api) {
          dispatchNavigate(api, (e.data as { target: NavigateTarget }).target, latest.current.viewport);
        }
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter openstory-desktop exec vitest run src/lib/use-harness-bridge.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck the desktop app**

Run: `pnpm --filter openstory-desktop typecheck`
Expected: no errors — `api.invoke("shell:openExternal", …)` resolves against the channel added in Task 5.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/lib/use-harness-bridge.ts apps/desktop/src/lib/use-harness-bridge.test.ts
git commit -m "feat(desktop): dispatch pl:navigate to selection IPC

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Full verification + manual smoke

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all packages PASS (turbo runs vitest per package).

- [ ] **Step 2: Typecheck the workspace**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Build the publishable packages**

Run: `pnpm --filter @gobrand/openstory-vite --filter @gobrand/openstory-runtime build`
Expected: both emit `dist/` with no errors.

- [ ] **Step 4: Manual smoke test** (the one path no unit test covers end-to-end — the live iframe→manager hop + `mode` fold):

Add (temporarily) to an existing project doc, e.g. in `apps/desktop/src/docs/agents-first.stories.md`, a paragraph:

```markdown
Try it: [Design System](./design-system.stories.md) ·
[a component's docs](../<some>.stories.tsx) ·
[a story](../<some>.stories.tsx#<storyId>) ·
[Anthropic](https://anthropic.com)
```

Run the desktop app (`pnpm --filter openstory-desktop dev`), open the doc, and verify:
1. Clicking the page link selects the other doc (sidebar stays in **Docs** mode, target highlighted).
2. Clicking the component-docs link switches to **Design System** mode showing that component's auto-docs.
3. Clicking the story link switches to **Design System** mode with that exact story rendered, preserving the current viewport.
4. Clicking the external link opens it in the system browser (NOT the iframe).
5. A deliberately broken link (`[x](./does-not-exist.stories.md)`) renders as muted non-clickable text, and the dev console shows `[openstory] doc … unresolved link …`.

Revert the temporary doc edit when done.

- [ ] **Step 5: Final commit** (only if Step 4 required any non-temporary fixes; otherwise skip).

```bash
git add -A
git commit -m "test(desktop): verify inter-doc navigation end-to-end

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Rollout (post-merge, operational)

Per the project publish flow (`v*` tag → CI; the app consumes published versions, never `link:`):

1. Publish `@gobrand/openstory-vite` + `@gobrand/openstory-runtime` together (matched pair: resolver writes the `openstory:` hrefs the runtime handler reads).
2. Bump the desktop app's dependency on those versions.
3. The desktop manager changes (`use-harness-bridge`, `ipc`, `types`, `external-url`) ship with the app build.

Graceful degradation: an older runtime leaves the custom-scheme anchor inert (a no-op, not a broken navigation); an older vite-plugin emits today's raw relative hrefs (current dead-link behavior).
```

