# Doc-sync Engine (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the in-session coding agent two read-only MCP tools that, at a work boundary, list the `*.stories.md` docs a cumulative change affected (with structured reasons) and hand over everything needed to reconcile each one.

**Architecture:** A pure detection core (`detectAffectedDocs`) joins the manifest against the git-changed file set; a pure context packager (`buildDocSyncContext`) assembles, per affected doc, its source plus each changed component's git diff and current API. Two new git helpers (`gitDiffFile`, `mergeBase`) and two new MCP tools (`get_affected_docs`, `get_doc_sync_context`) expose it. Everything is read-only; the agent edits docs with its own tools.

**Tech Stack:** TypeScript, Vitest, `@modelcontextprotocol/sdk`, Node `execFileSync` for git, pnpm workspaces.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-06-30-doc-sync-engine-design.md`.
- **Read-only engine.** No file writes, no auto-apply. The agent applies edits itself.
- **No "old manifest."** Detection uses the current manifest + the git-changed file set. The git *diff* is the before/after the agent reads.
- **Cadence = completion boundary, cumulative diff.** Default base = `merge-base origin/main HEAD` when resolvable, else working-tree-vs-HEAD (`base` undefined).
- **argv-injection guard (verbatim rule):** any git helper taking an agent-controlled `base` must reject a `base` that starts with `-` before invoking git, and run git via `execFileSync` (no shell).
- **Detection reasons (exact union):** `embed-component-changed` | `link-target-changed` | `doc-file-changed` | `broken-embed`. No `broken-link` (the inter-doc resolver already neutralizes broken links at build).
- **Broken-embed suggestion:** closest existing story key for that component by Levenshtein distance, only when distance ≤ 3, else `null`.
- **Custom-scheme links in `doc.html`:** resolved internal links are `openstory:docs/<componentId>` and `openstory:story/<componentId>/<storyId>` with each id segment `encodeURIComponent`-encoded (decode on read). `openstory:page/...` links are NOT component references — ignore them.
- **Test command (run only this package):** `pnpm --filter @gobrand/openstory-vite exec vitest run <file>`
- **Package typecheck:** `pnpm --filter @gobrand/openstory-vite typecheck`
- **Commit trailer (every commit):**
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- **Branch:** work directly on `staging`. Commit only the files named in each task (explicit `git add`).

---

### Task 1: Detection core — `detectAffectedDocs`

**Files:**
- Create: `packages/vite-plugin/src/doc-sync.ts`
- Test: `packages/vite-plugin/src/doc-sync.test.ts`

**Interfaces:**
- Consumes: `Manifest` from `./assemble-manifest.js`.
- Produces:
  - `type AffectedReason` (union below), `type AffectedDoc = { docId: string; sourcePath: string; reasons: AffectedReason[] }`.
  - `function detectAffectedDocs(manifest: Manifest, changedFiles: string[]): AffectedDoc[]`.
  - (Task 3 adds more to this same file.)

- [ ] **Step 1: Write the failing test** — create `packages/vite-plugin/src/doc-sync.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { detectAffectedDocs } from "./doc-sync";
import type { Manifest } from "./assemble-manifest";

const manifest = {
  schemaVersion: 1,
  components: [
    {
      id: "button", name: "Button", group: "", section: "", background: "#fff", layout: "padded",
      stories: [{ id: "primary", label: "Primary", props: {} }, { id: "small", label: "Small", props: {} }],
      controls: {}, sourcePath: "/p/button.stories.tsx",
    },
    {
      id: "card", name: "Card", group: "", section: "", background: "#fff", layout: "padded",
      stories: [{ id: "basic", label: "Basic", props: {} }],
      controls: {}, sourcePath: "/p/card.stories.tsx",
    },
  ],
  docs: [
    {
      id: "buttons", title: "Buttons", group: "", section: "", sourcePath: "/p/buttons.stories.md",
      embeds: ["button--primary"], html: '<p><a href="openstory:docs/button">api</a></p>',
    },
    {
      id: "layout", title: "Layout", group: "", section: "", sourcePath: "/p/layout.stories.md",
      embeds: ["card--basic"], html: "<p>no links</p>",
    },
    {
      id: "broken", title: "Broken", group: "", section: "", sourcePath: "/p/broken.stories.md",
      embeds: ["button--smal"], html: "",
    },
  ],
} as unknown as Manifest;

describe("detectAffectedDocs", () => {
  it("flags embed + link reasons when a referenced component's source changed", () => {
    const r = detectAffectedDocs(manifest, ["/p/button.stories.tsx"]);
    const buttons = r.find((d) => d.docId === "buttons")!;
    expect(buttons.reasons).toContainEqual({ kind: "embed-component-changed", componentId: "button", storyId: "primary" });
    expect(buttons.reasons).toContainEqual({ kind: "link-target-changed", targetKind: "docs", componentId: "button" });
  });

  it("flags an embed-only doc when its embedded component changed", () => {
    const r = detectAffectedDocs(manifest, ["/p/card.stories.tsx"]);
    const layout = r.find((d) => d.docId === "layout")!;
    expect(layout.reasons).toEqual([{ kind: "embed-component-changed", componentId: "card", storyId: "basic" }]);
  });

  it("flags a doc whose own source file changed", () => {
    const r = detectAffectedDocs(manifest, ["/p/layout.stories.md"]);
    const layout = r.find((d) => d.docId === "layout")!;
    expect(layout.reasons).toContainEqual({ kind: "doc-file-changed" });
  });

  it("always flags a broken embed with a fuzzy suggestion, regardless of changes", () => {
    const r = detectAffectedDocs(manifest, []);
    const broken = r.find((d) => d.docId === "broken")!;
    expect(broken.reasons).toEqual([{ kind: "broken-embed", embedId: "button--smal", suggestion: "button--small" }]);
  });

  it("suggests null for a broken embed with no close story", () => {
    const m = {
      ...manifest,
      docs: [{ ...manifest.docs[2], embeds: ["button--zzzzz"] }],
    } as unknown as Manifest;
    const r = detectAffectedDocs(m, []);
    expect(r[0].reasons).toEqual([{ kind: "broken-embed", embedId: "button--zzzzz", suggestion: null }]);
  });

  it("returns no entry for a doc with no reasons", () => {
    const r = detectAffectedDocs(manifest, ["/p/unrelated.ts"]);
    expect(r.map((d) => d.docId)).toEqual(["broken"]); // only the always-broken doc
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-vite exec vitest run src/doc-sync.test.ts`
Expected: FAIL — module `./doc-sync` not found.

- [ ] **Step 3: Write minimal implementation** — create `packages/vite-plugin/src/doc-sync.ts`:

```ts
import type { Manifest } from "./assemble-manifest.js";

export type AffectedReason =
  | { kind: "embed-component-changed"; componentId: string; storyId: string }
  | { kind: "link-target-changed"; targetKind: "docs" | "story"; componentId: string; storyId?: string }
  | { kind: "doc-file-changed" }
  | { kind: "broken-embed"; embedId: string; suggestion: string | null };

export type AffectedDoc = {
  docId: string;
  sourcePath: string;
  reasons: AffectedReason[];
};

type Component = Manifest["components"][number];

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[m];
}

// Closest existing story key for a component, by edit distance — only when within
// 3 edits (else a nonsense suggestion erodes trust). null when the component is
// unknown or has no stories.
function closestStoryKey(component: Component | undefined, storyId: string): string | null {
  if (!component || component.stories.length === 0) return null;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const s of component.stories) {
    const d = levenshtein(storyId, s.id);
    if (d < bestDist) {
      bestDist = d;
      best = s.id;
    }
  }
  return best !== null && bestDist <= 3 ? `${component.id}--${best}` : null;
}

// Internal component/story links the inter-doc-nav resolver wrote into doc.html.
// Page links (openstory:page/...) are not component references and are ignored.
// Each id segment is encodeURIComponent'd, so it has no raw / " ' whitespace <.
const LINK_RE = /openstory:(docs|story)\/([^/"'\s<]+)(?:\/([^/"'\s<]+))?/g;

export function detectAffectedDocs(manifest: Manifest, changedFiles: string[]): AffectedDoc[] {
  const changed = new Set(changedFiles);
  const byId = new Map<string, Component>(manifest.components.map((c) => [c.id, c]));
  const storyKeys = new Set(
    manifest.components.flatMap((c) => c.stories.map((s) => `${c.id}--${s.id}`)),
  );

  const out: AffectedDoc[] = [];
  for (const doc of manifest.docs) {
    const reasons: AffectedReason[] = [];

    if (changed.has(doc.sourcePath)) reasons.push({ kind: "doc-file-changed" });

    for (const embedId of doc.embeds) {
      const sep = embedId.indexOf("--");
      const componentId = sep === -1 ? embedId : embedId.slice(0, sep);
      const storyId = sep === -1 ? "" : embedId.slice(sep + 2);
      if (storyKeys.has(embedId)) {
        const comp = byId.get(componentId);
        if (comp?.sourcePath && changed.has(comp.sourcePath)) {
          reasons.push({ kind: "embed-component-changed", componentId, storyId });
        }
      } else {
        reasons.push({
          kind: "broken-embed",
          embedId,
          suggestion: closestStoryKey(byId.get(componentId), storyId),
        });
      }
    }

    for (const m of doc.html.matchAll(LINK_RE)) {
      const targetKind = m[1] as "docs" | "story";
      const componentId = decodeURIComponent(m[2]!);
      const comp = byId.get(componentId);
      if (!comp?.sourcePath || !changed.has(comp.sourcePath)) continue;
      if (targetKind === "story") {
        reasons.push({ kind: "link-target-changed", targetKind, componentId, storyId: decodeURIComponent(m[3]!) });
      } else {
        reasons.push({ kind: "link-target-changed", targetKind, componentId });
      }
    }

    // Dedupe structurally-identical reasons (e.g. the same component linked twice).
    const seen = new Set<string>();
    const deduped = reasons.filter((r) => {
      const key = JSON.stringify(r);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (deduped.length > 0) out.push({ docId: doc.id, sourcePath: doc.sourcePath, reasons: deduped });
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-vite exec vitest run src/doc-sync.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/vite-plugin/src/doc-sync.ts packages/vite-plugin/src/doc-sync.test.ts
git commit -m "feat(vite-plugin): detectAffectedDocs — map a diff to affected docs

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Git helpers — `gitDiffFile` + `mergeBase`

**Files:**
- Modify: `packages/vite-plugin/src/changed-stories.ts`
- Test: `packages/vite-plugin/src/changed-stories.test.ts`

**Interfaces:**
- Produces:
  - `function gitDiffFile(projectRoot: string, absPath: string, base?: string): string` — `git diff [base] -- <absPath>`; `""` on any failure or a `-`-leading base.
  - `function mergeBase(projectRoot: string, ref?: string): string | null` — `git merge-base <ref|origin/main> HEAD`; `null` on failure.

- [ ] **Step 1: Write the failing test** — append to `packages/vite-plugin/src/changed-stories.test.ts`. Update the top import to include the new functions:

```ts
import { changedStories, gitChangedFiles, gitDiffFile, mergeBase } from "./changed-stories";
```

Then append:

```ts
describe("gitDiffFile flag-injection guard", () => {
  it("returns empty string for a base starting with a dash, without invoking git", () => {
    expect(gitDiffFile("/p", "/p/a.tsx", "--output=/tmp/x")).toBe("");
    expect(gitDiffFile("/p", "/p/a.tsx", "-x")).toBe("");
  });
  it("returns empty string when git fails (not a repo)", () => {
    // /dev/null is not a git repo; execFileSync throws -> "".
    expect(gitDiffFile("/dev/null", "/dev/null/a.tsx")).toBe("");
  });
});

describe("mergeBase", () => {
  it("returns null when git fails (not a repo)", () => {
    expect(mergeBase("/dev/null")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-vite exec vitest run src/changed-stories.test.ts`
Expected: FAIL — `gitDiffFile`/`mergeBase` are not exported.

- [ ] **Step 3: Write minimal implementation** — in `packages/vite-plugin/src/changed-stories.ts`, append after `gitChangedFiles`:

```ts
// `git diff [base] -- <absPath>` for one file — the before/after of a change the
// agent reads to reconcile a doc. `base` is agent-controlled: reject a leading
// `-` (argv injection) before invoking git, exactly like gitChangedFiles. Here
// the `--` end-of-options marker is correct because absPath IS a pathspec (base,
// if present, is a revision and precedes it). Any failure degrades to "".
export function gitDiffFile(projectRoot: string, absPath: string, base?: string): string {
  if (base !== undefined && base.startsWith("-")) return "";
  try {
    const args = ["diff", ...(base ? [base] : []), "--", absPath];
    return execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" });
  } catch {
    return "";
  }
}

// The commit a branch diverged from — the natural "start of this work" boundary,
// so a 10-step feature syncs its docs once against everything it changed. null
// when unresolvable (no remote, shallow clone): callers fall back to HEAD.
export function mergeBase(projectRoot: string, ref = "origin/main"): string | null {
  try {
    const out = execFileSync("git", ["merge-base", ref, "HEAD"], { cwd: projectRoot, encoding: "utf8" });
    return out.trim() || null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-vite exec vitest run src/changed-stories.test.ts`
Expected: PASS (existing + 3 new tests).

- [ ] **Step 5: Commit**

```bash
git add packages/vite-plugin/src/changed-stories.ts packages/vite-plugin/src/changed-stories.test.ts
git commit -m "feat(vite-plugin): gitDiffFile + mergeBase helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Context packager — `buildDocSyncContext`

**Files:**
- Modify: `packages/vite-plugin/src/doc-sync.ts`
- Test: `packages/vite-plugin/src/doc-sync.test.ts`

**Interfaces:**
- Consumes: `AffectedDoc` + `Manifest` (Task 1); a `gitDiffFile`-shaped dep `(abs: string, base?: string) => string` (Task 2 provides the underlying impl).
- Produces:
  - `type ChangedComponentContext = { componentId: string; gitDiff: string; manifestEntry: Manifest["components"][number] }`.
  - `type DocSyncContext = { docId: string; sourcePath: string; docSource: string; reasons: AffectedReason[]; changedComponents: ChangedComponentContext[] }`.
  - `function buildDocSyncContext(manifest, affected, deps, base?): DocSyncContext`.

- [ ] **Step 1: Write the failing test** — append to `packages/vite-plugin/src/doc-sync.test.ts`. Update the top import to include the new function:

```ts
import { detectAffectedDocs, buildDocSyncContext } from "./doc-sync";
```

Then append (the `manifest` fixture from Task 1 is in scope):

```ts
describe("buildDocSyncContext", () => {
  const affectedButtons = {
    docId: "buttons",
    sourcePath: "/p/buttons.stories.md",
    reasons: [
      { kind: "embed-component-changed", componentId: "button", storyId: "primary" },
      { kind: "link-target-changed", targetKind: "docs", componentId: "button" },
    ],
  } as const;

  const deps = {
    readFile: (abs: string) => `# Buttons doc at ${abs}`,
    gitDiffFile: (abs: string) => `diff --git a${abs} b${abs}\n+changed`,
  };

  it("assembles doc source + one entry per distinct changed component", () => {
    const ctx = buildDocSyncContext(manifest, affectedButtons, deps);
    expect(ctx.docId).toBe("buttons");
    expect(ctx.docSource).toBe("# Buttons doc at /p/buttons.stories.md");
    expect(ctx.changedComponents).toHaveLength(1); // button appears in two reasons -> deduped
    expect(ctx.changedComponents[0].componentId).toBe("button");
    expect(ctx.changedComponents[0].gitDiff).toContain("+changed");
    expect(ctx.changedComponents[0].manifestEntry.id).toBe("button");
  });

  it("degrades docSource to empty string when the doc is unreadable", () => {
    const ctx = buildDocSyncContext(manifest, affectedButtons, {
      readFile: () => {
        throw new Error("ENOENT");
      },
      gitDiffFile: () => "",
    });
    expect(ctx.docSource).toBe("");
  });

  it("skips a component that is not in the manifest", () => {
    const affected = {
      docId: "x", sourcePath: "/p/x.stories.md",
      reasons: [{ kind: "embed-component-changed", componentId: "ghost", storyId: "z" }],
    } as const;
    const ctx = buildDocSyncContext(manifest, affected, deps);
    expect(ctx.changedComponents).toEqual([]);
  });

  it("does not pull a component diff for a broken-embed-only doc", () => {
    const affected = {
      docId: "broken", sourcePath: "/p/broken.stories.md",
      reasons: [{ kind: "broken-embed", embedId: "button--smal", suggestion: "button--small" }],
    } as const;
    const ctx = buildDocSyncContext(manifest, affected, deps);
    expect(ctx.changedComponents).toEqual([]);
    expect(ctx.reasons).toEqual(affected.reasons);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-vite exec vitest run src/doc-sync.test.ts`
Expected: FAIL — `buildDocSyncContext` is not exported.

- [ ] **Step 3: Write minimal implementation** — in `packages/vite-plugin/src/doc-sync.ts`, append:

```ts
export type ChangedComponentContext = {
  componentId: string;
  gitDiff: string;
  manifestEntry: Manifest["components"][number];
};

export type DocSyncContext = {
  docId: string;
  sourcePath: string;
  docSource: string;
  reasons: AffectedReason[];
  changedComponents: ChangedComponentContext[];
};

// Assemble everything the agent needs to reconcile ONE affected doc in one shot:
// its current source, and per distinct changed component (from embed/link reasons
// only — a broken-embed's fix is the deterministic suggestion, not a diff) that
// component's git diff + current manifest entry (the new prop/story API).
export function buildDocSyncContext(
  manifest: Manifest,
  affected: AffectedDoc,
  deps: { readFile: (abs: string) => string; gitDiffFile: (abs: string, base?: string) => string },
  base?: string,
): DocSyncContext {
  let docSource = "";
  try {
    docSource = deps.readFile(affected.sourcePath);
  } catch {
    docSource = "";
  }

  const componentIds: string[] = [];
  for (const r of affected.reasons) {
    if (r.kind === "embed-component-changed" || r.kind === "link-target-changed") {
      if (!componentIds.includes(r.componentId)) componentIds.push(r.componentId);
    }
  }

  const byId = new Map(manifest.components.map((c) => [c.id, c]));
  const changedComponents: ChangedComponentContext[] = [];
  for (const id of componentIds) {
    const comp = byId.get(id);
    if (!comp || !comp.sourcePath) continue;
    changedComponents.push({
      componentId: id,
      gitDiff: deps.gitDiffFile(comp.sourcePath, base),
      manifestEntry: comp,
    });
  }

  return {
    docId: affected.docId,
    sourcePath: affected.sourcePath,
    docSource,
    reasons: affected.reasons,
    changedComponents,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @gobrand/openstory-vite exec vitest run src/doc-sync.test.ts`
Expected: PASS (Task 1's 6 + 4 new = 10 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/vite-plugin/src/doc-sync.ts packages/vite-plugin/src/doc-sync.test.ts
git commit -m "feat(vite-plugin): buildDocSyncContext — per-doc reconciliation package

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: MCP tools + wiring — `get_affected_docs`, `get_doc_sync_context`

**Files:**
- Modify: `packages/vite-plugin/src/mcp-server.ts`
- Modify: `packages/vite-plugin/src/plugin.ts:189-201` (inject the two helpers)
- Test: `packages/vite-plugin/src/mcp-server.test.ts`

**Interfaces:**
- Consumes: `detectAffectedDocs`, `buildDocSyncContext` (Tasks 1, 3); `gitDiffFile`, `mergeBase` (Task 2).
- Produces: `McpToolContext` gains `gitDiffFile: typeof gitDiffFile` and `mergeBase: typeof mergeBase`; two new tools registered.

- [ ] **Step 1: Write the failing test** — in `packages/vite-plugin/src/mcp-server.test.ts`:

Extend `makeCtx` so the two new context deps exist (add to the returned object, before `...over`):

```ts
    gitDiffFile: () => "diff --git a/button.stories.tsx b/button.stories.tsx\n+changed",
    mergeBase: () => null,
```

A manifest fixture with a doc that references the changed `button` component (add below the existing `manifest`):

```ts
const manifestWithDoc = {
  ...manifest,
  docs: [
    {
      id: "buttons", title: "Buttons", group: "", section: "", sourcePath: "/p/buttons.stories.md",
      embeds: ["button--primary"], html: '<a href="openstory:docs/button">api</a>',
    },
  ],
} as unknown as Manifest;
```

Append these tests inside the `describe("buildMcpTools", ...)` block:

```ts
  it("get_affected_docs returns affected docs with reasons", async () => {
    const ctx = makeCtx({ getManifest: async () => manifestWithDoc });
    const r = (await buildMcpTools(ctx).get_affected_docs.handler({})) as {
      affected: Array<{ docId: string; reasons: Array<{ kind: string }> }>;
    };
    expect(r.affected.map((a) => a.docId)).toEqual(["buttons"]);
    expect(r.affected[0].reasons.map((x) => x.kind)).toContain("embed-component-changed");
  });

  it("get_affected_docs degrades outside a git repo", async () => {
    const ctx = makeCtx({ getManifest: async () => manifestWithDoc, gitChangedFiles: () => ({ files: null }) });
    const r = (await buildMcpTools(ctx).get_affected_docs.handler({})) as { degraded?: string; affected: unknown[] };
    expect(r.degraded).toBe("not-a-git-repo");
    expect(r.affected).toEqual([]);
  });

  it("get_doc_sync_context returns the package for an affected doc", async () => {
    const ctx = makeCtx({ getManifest: async () => manifestWithDoc });
    const r = (await buildMcpTools(ctx).get_doc_sync_context.handler({ doc: "buttons" })) as {
      docId: string; changedComponents: Array<{ componentId: string; gitDiff: string }>;
    };
    expect(r.docId).toBe("buttons");
    expect(r.changedComponents[0].componentId).toBe("button");
    expect(r.changedComponents[0].gitDiff).toContain("+changed");
  });

  it("get_doc_sync_context throws on an unaffected doc", async () => {
    const ctx = makeCtx({ getManifest: async () => manifestWithDoc });
    await expect(buildMcpTools(ctx).get_doc_sync_context.handler({ doc: "nope" })).rejects.toThrow(/Unknown or unaffected/);
  });
```

Update the tool-count round-trip test to expect eight tools:

```ts
  it("exposes the eight read-only tools", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_affected_docs",
      "get_changed_stories",
      "get_component_props",
      "get_doc_sync_context",
      "get_render_url",
      "get_story_source",
      "list_components",
      "list_stories",
    ]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @gobrand/openstory-vite exec vitest run src/mcp-server.test.ts`
Expected: FAIL — `get_affected_docs`/`get_doc_sync_context` undefined; the eight-tools assertion fails; `McpToolContext` missing `gitDiffFile`/`mergeBase` (TS error in the test factory until Step 3).

- [ ] **Step 3: Write minimal implementation** — in `packages/vite-plugin/src/mcp-server.ts`:

Extend the imports at the top:

```ts
import { changedStories, type ChangedComponent, gitChangedFiles, gitDiffFile, mergeBase } from "./changed-stories.js";
import { detectAffectedDocs, buildDocSyncContext } from "./doc-sync.js";
```

Add the two deps to `McpToolContext` (after `gitChangedFiles`):

```ts
  gitChangedFiles: typeof gitChangedFiles;
  gitDiffFile: typeof gitDiffFile;
  mergeBase: typeof mergeBase;
  readFile: (absPath: string) => string;
```

Add both tools inside the object returned by `buildMcpTools` (after `get_changed_stories`):

```ts
    get_affected_docs: {
      description:
        "List the *.stories.md docs affected by your cumulative changes since `base` (default: merge-base with origin/main, else working tree vs HEAD), each with structured reasons (embed/link to a changed component, the doc file itself changed, or a broken embed). Call ONCE at a completion boundary; then open each flagged doc and reconcile it with get_doc_sync_context.",
      inputSchema: { base: z.string().optional().describe("Git ref to diff against (optional)") },
      handler: async (args) => {
        const manifest = await ctx.getManifest();
        const base = (args.base as string | undefined) ?? ctx.mergeBase(ctx.projectRoot) ?? undefined;
        const { files } = ctx.gitChangedFiles(ctx.projectRoot, base);
        if (files === null) return { affected: [], degraded: "not-a-git-repo" };
        return { affected: detectAffectedDocs(manifest, files), base: base ?? null };
      },
    },

    get_doc_sync_context: {
      description:
        "Get everything needed to reconcile ONE affected doc (from get_affected_docs): its current source, plus each changed component's git diff and current prop/story API. Read the diff for the before/after, then edit the *.stories.md with your own tools.",
      inputSchema: {
        doc: z.string().describe("Doc id from get_affected_docs"),
        base: z.string().optional().describe("Git ref to diff against (optional)"),
      },
      handler: async (args) => {
        const manifest = await ctx.getManifest();
        const base = (args.base as string | undefined) ?? ctx.mergeBase(ctx.projectRoot) ?? undefined;
        const { files } = ctx.gitChangedFiles(ctx.projectRoot, base);
        const affected = (files === null ? [] : detectAffectedDocs(manifest, files)).find(
          (a) => a.docId === args.doc,
        );
        if (!affected) throw new Error(`Unknown or unaffected doc: ${String(args.doc)}`);
        return buildDocSyncContext(
          manifest,
          affected,
          { readFile: ctx.readFile, gitDiffFile: (abs, b) => ctx.gitDiffFile(ctx.projectRoot, abs, b) },
          base,
        );
      },
    },
```

- [ ] **Step 4: Wire the helpers into the construction site** — in `packages/vite-plugin/src/plugin.ts`:

Extend the `changed-stories` import (currently `import { gitChangedFiles } from "./changed-stories.js";` — verify and update it to):

```ts
import { gitChangedFiles, gitDiffFile, mergeBase } from "./changed-stories.js";
```

In the `createMcpServer({ ... })` call (around line 189-201), add the two helpers next to `gitChangedFiles`:

```ts
            gitChangedFiles,
            gitDiffFile,
            mergeBase,
            readFile: (abs) => readFileSync(abs, "utf8"),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @gobrand/openstory-vite exec vitest run src/mcp-server.test.ts`
Expected: PASS (existing + 4 new tool tests + the eight-tools assertion).

- [ ] **Step 6: Typecheck the package**

Run: `pnpm --filter @gobrand/openstory-vite typecheck`
Expected: no errors (the `McpToolContext` change forces `plugin.ts` to provide the new deps — Step 4 satisfies it).

- [ ] **Step 7: Commit**

```bash
git add packages/vite-plugin/src/mcp-server.ts packages/vite-plugin/src/plugin.ts packages/vite-plugin/src/mcp-server.test.ts
git commit -m "feat(vite-plugin): get_affected_docs + get_doc_sync_context MCP tools

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the vite-plugin suite**

Run: `pnpm --filter @gobrand/openstory-vite exec vitest run`
Expected: all pass (the 3 modified/new test files + the rest of the package).

- [ ] **Step 2: Typecheck the workspace**

Run: `pnpm typecheck`
Expected: no errors across all packages.

- [ ] **Step 3: Build the publishable package**

Run: `pnpm --filter @gobrand/openstory-vite build`
Expected: emits `dist/` with no errors.

- [ ] **Step 4: Manual smoke (optional, agent-driven)** — in a project running the OpenStory MCP, change a component's source, then have the coding agent call `get_affected_docs` (no args) and `get_doc_sync_context({ doc })` for a flagged doc. Confirm the affected list names the right docs with reasons, and the context package carries the component's diff + current API. (No automated test covers a live git repo end-to-end; the unit tests inject git IO.)

---

## Rollout

Ships in `@gobrand/openstory-vite` only (the MCP server lives there). No runtime/app change. A `minor` release exposes the two new tools to any consumer running the OpenStory MCP; the value is in the agent session, so no desktop change is needed. Per the publish flow: clean tree on `main` → `pnpm release minor` → CI publishes.
