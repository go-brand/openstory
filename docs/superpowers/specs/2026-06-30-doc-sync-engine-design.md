# Doc-sync engine (v1: detection + agent context over MCP)

**Date:** 2026-06-30
**Status:** Approved design, pre-implementation
**Builds on:** [agent-first MCP render](./2026-06-29-agent-first-mcp-render-design.md) (`mcp-server.ts`, manifest contract), [feature-docs](./2026-06-26-feature-docs-design.md) (`*.stories.md`, `:::story` embeds), [inter-doc navigation](./2026-06-30-inter-doc-navigation-design.md) (resolved doc→component/story/page links)

## North star (context, not v1 scope)

Stale docs are an **economics + feedback failure**: the cost of updating a doc is
separated in time from the change, paid by someone without the context, and
nothing breaks when a doc is wrong. The regime change is that **the agent makes
the change and holds full context at the moment of change** — so the doc update
can be a first-class output of the change, produced and reviewed alongside the
code. The full vision is a three-layer system:

- **Layer 0 — derive everything derivable** (prop tables, story lists, live
  examples) so it *cannot* go stale. OpenStory already does this for live
  `:::story` embeds and prop controls. Separate track; not this spec.
- **Layer 1 — detect drift in the irreducible prose**, deterministically, because
  docs are colocated and manifest-backed.
- **Layer 2 — suggest the prose fix**, reviewed by whoever has the most context,
  at the cheapest moment (the agent's own turn; the commit/PR as a safety net).

**This spec is the engine that powers Layers 1–2, surfaced at the authorship
moment.** Triggers (pre-commit/PR), a headless LLM path, and an approval UI are
deferred wrappers around this engine (see Non-goals).

## Why this beats "GitHub-observer" tools (and the honest caveats)

Observer tools (watch merged PRs → infer doc changes → a detached human approves)
fail because they *guess* the code↔doc link from text and review post-hoc without
context. This engine makes the link a **deterministic fact** ("this doc embeds
Button's story / links to Button / is Button's doc") and puts the suggestion in
front of the **change-author** with full context. Buildable today on existing
substrate: `gitChangedFiles(base)`, the manifest (components→sourcePath/stories,
docs→embeds/links/sourcePath), embed validation, the inter-doc link resolver, and
`changedStories`.

Honest limits this spec accepts on purpose:
1. **Invocation depends on the agent calling it.** The automatic trigger
   (hook/PR) that guarantees invocation is deferred — you cannot build a
   trustworthy *automatic* trigger before the suggestion quality is proven. v1's
   job is to prove quality cheaply; the trigger is a thin wrapper afterward.
2. **One signal is noisy.** "Component source changed → doc affected" has false
   positives (internal refactor, no API change); the agent filters these by
   reading the diff. The broken-reference signals are zero-false-positive. A
   later precision pass (public-API diff) tightens signal 1.
3. **Deep semantic drift is best-effort.** Structural/reference drift — the bulk
   of the pain — is handled well.

## Decisions (settled in brainstorm)

1. **v1 surface = MCP, consumed by the in-session coding agent.** The engine is
   deterministic detection + a context package; the agent writes the doc edit
   with its own tools. No `ANTHROPIC_API_KEY`, no per-call LLM cost, no LLM infra.
2. **Read-only engine.** Matches the existing MCP safety default. No auto-apply;
   the human reviews the agent's edits in the normal flow.
3. **Detection = high-precision structural flagging; the agent does the fine
   prose reasoning** from the component's git diff. No "old manifest"
   computation: the git diff *is* the before/after.
4. **Cadence = completion boundary, on the cumulative diff** of the whole work
   unit (not per-step). Driven by a `base` git ref. Default base:
   `merge-base origin/main HEAD` (the whole branch's work) when resolvable, else
   `HEAD` (working tree). The agent/human calls it once when the work is "done."
5. **Deterministic fixes for broken structural refs; prose left to the agent.** A
   broken embed/link gets a suggested concrete fix in the context package when
   inferable (fuzzy-matched new id/path); prose drift is the agent's job.

## Non-goals (deferred wrappers / later precision)

- Headless portable-LLM path (OpenStory calling Claude itself).
- Pre-commit / pre-push hook and GitHub PR bot triggers + the HTML approval UI.
- Auto-applying edits.
- Layer-0 derivation expansion (deriving prop tables etc.).
- Prose-only-mention recall (a doc that names a component with no embed/link).
- Old-manifest semantic diffing / public-API-only change detection.

## Architecture

```
agent finishes a unit of work (N steps)
        │  calls MCP
        ▼
get_affected_docs(base?) ──▶ detectAffectedDocs(manifest, changedFiles)   [pure]
        │                         uses gitChangedFiles(projectRoot, base)
        │                         + manifest embeds/links + broken-ref checks
        ▼
   [{ docId, sourcePath, reasons:[{kind, detail}] }]
        │  for each affected doc the agent wants to fix:
        ▼
get_doc_sync_context(doc, base?) ──▶ buildDocSyncContext(...)              [pure-ish]
        │   returns: doc source + per changed component { gitDiff, manifestEntry }
        │            + reasons + deterministic fixes for broken refs
        ▼
   agent edits the *.stories.md with its own Edit tool
        ▼
   human reviews the doc edit alongside the code change
```

New module `packages/vite-plugin/src/doc-sync.ts` holds the two pure cores;
`mcp-server.ts` gains two tools; `changed-stories.ts` gains a one-file git-diff
helper.

### 1. Detection core — `detectAffectedDocs` (`doc-sync.ts`, pure)

```ts
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

export function detectAffectedDocs(
  manifest: Manifest,
  changedFiles: string[],         // absolute paths, from gitChangedFiles
): AffectedDoc[];
```

A doc (`manifest.docs[i]`) is affected when any reason fires:

- **embed-component-changed** — the doc has an embed `componentId--storyId` whose
  component's `sourcePath` is in `changedFiles`. (Embeds are `doc.embeds[]`; map
  embed id → component via the `--` split, look up `sourcePath` in
  `manifest.components`.)
- **link-target-changed** — the doc's rendered HTML contains a resolved internal
  link `openstory:docs/<componentId>` or `openstory:story/<componentId>/<storyId>`
  whose component `sourcePath` is in `changedFiles`. (Parse `openstory:` hrefs out
  of `doc.html` with a narrow regex; this is the build-resolved scheme from the
  inter-doc-nav feature.)
- **doc-file-changed** — `doc.sourcePath` is itself in `changedFiles`.
- **broken-embed** — an embed id matches no `componentId--storyId` in the current
  manifest (the existing `assemble-manifest` validation already computes this
  set). `suggestion` = the closest existing story key for that component by edit
  distance, or `null`. (Embeds stay in `doc.embeds` even when broken, so this is
  reachable — unlike broken inter-doc *links*, which the resolver already
  neutralizes into inert spans at build with a console warning, so they carry no
  recoverable target and are out of scope here.)

Pure: no I/O. `changedFiles` is injected (from `gitChangedFiles`). Reuses the
embed→component mapping and the manifest story-key set already built in
`assemble-manifest.ts`.

### 2. Context packager — `buildDocSyncContext` (`doc-sync.ts`)

```ts
export type ChangedComponentContext = {
  componentId: string;
  gitDiff: string;                          // base → working tree, for this component's source
  manifestEntry: Manifest["components"][number]; // current props/controls + stories (the new truth)
};

export type DocSyncContext = {
  docId: string;
  sourcePath: string;
  docSource: string;                        // current *.stories.md contents
  reasons: AffectedReason[];
  changedComponents: ChangedComponentContext[];
};

export function buildDocSyncContext(
  manifest: Manifest,
  affected: AffectedDoc,
  deps: { readFile: (abs: string) => string; gitDiffFile: (abs: string, base?: string) => string },
  base?: string,
): DocSyncContext;
```

For the affected doc: read its source; for each distinct changed component named
in its reasons, attach that component's source git diff (`gitDiffFile`) and its
current manifest entry. The `broken-embed` `suggestion` is already in the reason.
This is everything the agent needs to fix the prose in one shot.

### 3. Git helper — `gitDiffFile` (`changed-stories.ts`)

```ts
// `git diff [base] -- <absPath>` for a single file; "" on any failure.
export function gitDiffFile(projectRoot: string, absPath: string, base?: string): string;
```

Mirrors `gitChangedFiles`' injection + the **same argv-injection guard**
(`base` starting with `-` is rejected). Runs git with `execFileSync` (no shell).

### 4. MCP tools (`mcp-server.ts`, read-only)

- **`get_affected_docs`** — `inputSchema: { base?: string }`. Resolves changed
  files via `ctx.gitChangedFiles(projectRoot, base ?? defaultBase())`, returns
  `detectAffectedDocs(manifest, files)`. If `files === null` (not a git repo),
  returns `{ affected: [], degraded: "not-a-git-repo" }` (mirrors
  `get_changed_stories`). `defaultBase()` resolves `merge-base origin/main HEAD`
  via a new injected helper; falls back to `undefined` (working tree vs HEAD) when
  unresolvable.
- **`get_doc_sync_context`** — `inputSchema: { doc: string, base?: string }`.
  Re-runs detection, finds the `AffectedDoc` with `docId === doc` (404 →
  `Unknown or unaffected doc`), returns `buildDocSyncContext(...)`.

Tool descriptions state the intended loop ("call once at a completion boundary;
then edit the flagged `*.stories.md`") so the agent uses them correctly. The
existing `McpToolContext` gains `gitDiffFile` and a `mergeBase(projectRoot)`
helper, injected like `gitChangedFiles`.

## Data flow / cadence

Invoked **once, at a completion boundary**, on the cumulative diff vs `base`:
`get_affected_docs(base)` → the agent picks the docs to fix →
`get_doc_sync_context(doc, base)` per doc → the agent edits the `*.stories.md` →
the human reviews the doc edits with the code. Per-step invocation is never
required; `base` accumulates all steps' changes.

## Error handling

- **Not a git repo / git missing** — `gitChangedFiles` already returns
  `{ files: null }`; the tool returns `degraded: "not-a-git-repo"` with an empty
  affected list. `gitDiffFile` returns `""`.
- **Invalid/injected `base`** — rejected by the existing guard (leading `-`).
- **Unreadable doc / missing source** — `buildDocSyncContext` skips that
  component's diff (empty string) rather than throwing; a doc with no readable
  source still returns its reasons.
- **`merge-base origin/main` unresolvable** (no remote, shallow clone) —
  `defaultBase()` falls back to working-tree-vs-HEAD.

## Testing

Colocated `*.test.ts`, mirroring `changed-stories.test.ts` / `mcp-server.test.ts`:

- **`doc-sync.test.ts`** — `detectAffectedDocs` over a fixture manifest: each
  reason kind in isolation (embed-changed, link-changed, doc-file-changed,
  broken-embed with/without a fuzzy suggestion), a doc with multiple
  reasons, and a doc with none (not returned). `buildDocSyncContext` assembles the
  doc source + per-component diff + manifest entry; broken-embed suggestion
  surfaces; unreadable component degrades to `""`.
- **`changed-stories.test.ts`** — `gitDiffFile` builds the right argv, injects IO,
  and rejects a `-`-leading base (no git in the unit test; IO injected).
- **`mcp-server.test.ts`** — `get_affected_docs` returns the detection list and
  the `degraded` shape when files are null; `get_doc_sync_context` returns the
  package and 404s an unaffected doc id.

## Files touched

**New:**
- `packages/vite-plugin/src/doc-sync.ts` (+ `doc-sync.test.ts`) — `detectAffectedDocs`, `buildDocSyncContext`, types.

**Modified:**
- `packages/vite-plugin/src/changed-stories.ts` (+ test) — add `gitDiffFile`, `mergeBase`.
- `packages/vite-plugin/src/mcp-server.ts` (+ test) — add `get_affected_docs`, `get_doc_sync_context`; extend `McpToolContext` with `gitDiffFile` + `mergeBase`.
- Wherever `McpToolContext` is constructed (the MCP route wiring) — inject the two new helpers.

## Rollout

Ships in `@gobrand/openstory-vite` (the MCP server lives there). No runtime/app
change. A `minor` release exposes the new tools to any consumer running the
OpenStory MCP. The desktop app needs no change; the value is in the agent session.
