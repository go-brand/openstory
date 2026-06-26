# Feature docs (`*.stories.md`)

**Date:** 2026-06-26
**Status:** Approved design, pre-implementation
**Builds on:** [story-file discovery](./2026-06-03-story-file-discovery-design.md) (glob + `discoverComponents`), [sidebar nav tree](./2026-06-03-sidebar-nav-tree-design.md) (`group`/`section`), [vocabulary](./2026-06-03-storybook-parity-north-star.md) (component/story)

## Problem

OpenStory documents a **design system** (components + their stories). It does
not document **features** — how the pieces combine into user-facing behavior
(notifications, billing, onboarding). Teams want rich, interactive feature
documentation that lives next to the code, stays current, and is trivial for an
AI agent to author ("document this feature into OpenStory").

The author DX must be **stupid simple**: no folder to create, no config field to
add, no React/JSX to compile, no build step. Drop a Markdown file, it appears —
exactly like a story file does today.

## Decisions (settled in brainstorm)

1. **`*.stories.md` is the marker.** One rule for the whole system: a
   `*.stories.*` file is an OpenStory entry; the **extension picks the
   interpreter** — `.ts`/`.tsx` → render React (today), `.md` → render docs
   (new). `README.md`, `CHANGELOG.md`, `docs/*.md` never collide because they
   lack the `.stories.` infix.
2. **No new config field, no prescribed folder.** The default glob simply widens
   from `["**/*.stories.{ts,tsx}"]` to `["**/*.stories.{ts,tsx,md}"]`. Docs
   co-locate anywhere a story file can. Users who override `stories` opt their
   `.md` in/out themselves.
3. **Markdown, not raw HTML, not MDX.** Agents emit clean Markdown best; it
   renders richer than hand-written HTML; and it needs no JSX compiler or scope
   wiring (the setup complexity we are rejecting). MDX is a deferred non-goal.
4. **Interactivity by embedding existing stories**, not inline component code. A
   `:::story componentId--storyId` directive mounts a **live, real** story from
   the design-system track inline. Zero new wiring; the doc dries up against the
   component manifest that already exists.
5. **Grouping reuses component machinery.** Frontmatter `group:` + the existing
   `deriveSection(sourcePath)` place a doc in the **same** sidebar tree as
   components. No separate hardcoded "Features" track; the author organizes via
   `group:` (e.g. `Features/Notifications`).

## Non-goals (v1 cuts — fast-follows)

- **`.html` passthrough** (author-supplied raw HTML doc). Trivial later; the
  discovery branch is extension-keyed and extends cleanly.
- **Controls on embedded stories.** Embeds render read-only in v1.
- **Search / full-text index** over docs.
- **MDX / JSX** in docs. Embeds are the interactivity primitive.
- **Cross-doc links / backlinks**, doc-to-component "used in" reverse index.

## Architecture

Docs ride the **same three rails** as components: one discovery glob → a
manifest array → a browser render path. Each rail gains a `.md` branch beside the
existing `.tsx` branch; nothing about the component path changes.

### A. Config shape

`OpenStoryConfig.stories` is unchanged in type — only the **default** widens:

```ts
// packages/vite-plugin/src/discover.ts
const DEFAULT_PATTERNS = ["**/*.stories.{ts,tsx,md}"]; // was {ts,tsx}
```

No new field. `resolvePatterns` is untouched. A user override of `stories` is
authoritative as today (they include `md` or not).

### B. Manifest shape

`buildManifest` returns a second top-level array beside `components`:

```ts
{
  components: ManifestComponent[],   // unchanged
  docs: ManifestDoc[],               // new
}
```

```ts
// packages/config/src/define.ts — shared type (Node plugin + desktop agree)
export type ManifestDoc = {
  id: string;          // kebab(filename minus ".stories.md"), or frontmatter id
  title: string;       // frontmatter `title`, else humanized filename
  group: string;       // frontmatter `group`, else ""
  section: string | null;  // deriveSection(sourcePath) — same as components
  status?: "shipped" | "beta" | "planned";  // frontmatter, optional
  owner?: string;      // frontmatter, optional
  html: string;        // markdown rendered to HTML (Node side)
  embeds: string[];    // story ids referenced by :::story (for validation/mount)
  sourcePath: string;  // the .md file (Code panel + section derivation)
};
```

`ManifestDoc` lives in the pure `@gobrand/openstory-config` package (like
`ManifestControl`) so the Node plugin and the desktop renderer share one type.

### C. Doc discovery (Node)

Discovery partitions the matched file list **by extension before loading**,
because a `.md` file cannot be `ssrLoadModule`'d as a module with a
`defineStories` default export:

```ts
// packages/vite-plugin/src/discover.ts (extended)
// walk + glob-match is unchanged; then:
const docFiles = files.filter((f) => f.endsWith(".md"));
const storyFiles = files.filter((f) => !f.endsWith(".md"));
// storyFiles → existing discoverComponents path (ssrLoadModule)
// docFiles   → new discoverDocs path (read + parse)
```

New `packages/vite-plugin/src/discover-docs.ts` (Node, pure-ish — `fs.readFile`
injected for testability):

```ts
export function parseDoc(source: string, sourcePath: string): ManifestDoc;
export async function discoverDocs(
  projectRoot: string,
  docFiles: string[],
  read: (absPath: string) => string,   // injected fs.readFileSync
): Promise<ManifestDoc[]>;
```

`parseDoc` steps:
1. **Frontmatter** — split a leading `---\n…\n---` block; parse with a
   **hand-rolled scalar parser** (`key: value` lines; `tags`/list values as
   `[a, b]` or comma split). No `gray-matter`/`js-yaml` dependency —
   supply-chain hygiene, consistent with the no-third-party-glob decision. Only
   the documented keys are read; unknown keys ignored.
2. **Embed preprocess** — replace each line matching `^:::story\s+(\S+)\s*$`
   with a placeholder block `<div data-openstory-story="<id>"></div>` and
   collect `<id>` into `embeds[]`. (Block-level raw HTML survives Markdown
   rendering untouched.)
3. **Render** — run the body through **`marked`** (single, audited, zero-dep
   markdown lib) → `html`.
4. **Defaults** — `id` = frontmatter `id` ?? `kebab(basename without
   ".stories.md")`; `title` = frontmatter `title` ?? `humanize` of same;
   `group` = frontmatter `group` ?? `""`; `section` = `deriveSection(sourcePath)`.

`discoverDocs` reads each file, calls `parseDoc`, and (consistency with
components) **dev-warns** on a duplicate doc id and on an embed id that resolves
to no component/story in the final manifest
(`console.warn("[openstory] doc <file>: embed <id> matches no story")`).

### D. `buildManifest` + manifest route

`buildManifest(config, projectRoot)` gains a `docs` input and emits `docs[]`.
The manifest route (`configureServer`) walks once, partitions, runs both
discovery paths, and validates embeds against the assembled `components` (so a
typo'd `:::story` id is caught at build, warned, and still renders a visible
"missing story" placeholder rather than crashing the page).

### E. Render (browser)

The harness entry already globs and registers the story components
(`import.meta.glob(["**/*.stories.{ts,tsx,md}"])` — the `.md` entries are inert
for the React glob since they export nothing; harmless, but we pass a
**`.{ts,tsx}`-only** literal to `import.meta.glob` to avoid Vite trying to
transform `.md` as a module). Docs are fetched as part of `/manifest.json`.

New `packages/runtime/src/doc-host.tsx`:
- Renders `doc.html` into a container (`dangerouslySetInnerHTML`).
- Queries `[data-openstory-story]` placeholders; for each, splits the id on
  `--` into `componentId--storyId`, looks up the registered component + fixture,
  and mounts it through the existing **`mountPreviewHost`** machinery (read-only
  — no controls in v1). A missing id renders an inline "⚠ story not found:
  `<id>`" node.

The doc page is a single scrollable surface (the prose) with live story mounts
inline — not the component preview canvas. Layout/preset/viewport do not apply to
the doc page itself; each *embed* renders in its component's own resolved render.

### F. Desktop (sidebar + main area)

- **Sidebar** — `build-tree` consumes `manifest.docs` alongside
  `manifest.components`. A doc is a **leaf node** (no expandable story
  variants), placed by `group:`/`section` with the same path logic. A small
  doc/text icon distinguishes it from a component; optional `status` renders as
  a faint badge.
- **Main area** — selecting a doc renders `doc-host` (the prose page) instead of
  the component preview canvas. The right panel shows **no controls** (a doc has
  none); the **Code panel shows the raw `.md` source** (`sourcePath`), mirroring
  how components show their source.
- **Live updates** — same as stories: editing/adding a `*.stories.md` re-runs
  discovery and re-posts `pl:manifest`; the desktop refetches `/manifest.json`
  (the existing refetch-trigger path), so a new doc appears without relaunch.

## Authoring contract (the whole thing an agent learns)

````markdown
---
title: Notifications
status: shipped
group: Features
owner: growth
---

# Notifications

Users get a bell in the titlebar; unread state shows a count badge.

:::story notification-bell--unread

Clicking it opens the panel:

:::story notifications-panel--default
````

- File: `Notifications.stories.md`, anywhere under the project.
- Everything in frontmatter is optional except nothing (all optional).
- `:::story <componentId>--<storyId>` on its own line embeds a live story.

## Touch-points

| Layer | File | Change |
|-------|------|--------|
| Config types | `packages/config/src/define.ts` | add `ManifestDoc` type (shared) |
| Default glob | `packages/vite-plugin/src/discover.ts` | `DEFAULT_PATTERNS` → `{ts,tsx,md}`; partition matched files by extension |
| Doc discovery | `packages/vite-plugin/src/discover-docs.ts` (new) | `parseDoc` (frontmatter + embed preprocess + `marked`), `discoverDocs` |
| Manifest | `packages/vite-plugin/src/plugin.ts` | `buildManifest` emits `docs[]`; route runs both discovery paths; validate embeds vs components |
| Harness | `packages/vite-plugin/src/harness-loader.ts` | keep `import.meta.glob` literal at `.{ts,tsx}` (exclude `.md` from the React glob) |
| Doc render | `packages/runtime/src/doc-host.tsx` (new) | inject `html`, hydrate `:::story` placeholders via `mountPreviewHost` |
| Runtime exports | `packages/runtime/src/index.ts` | export `mountDocHost` |
| Desktop types | desktop manifest type | add `docs: ManifestDoc[]` |
| Sidebar tree | `apps/desktop/src/components/sidebar/build-tree.ts` | docs as leaf nodes (group/section), status badge, icon |
| Main area | desktop preview/right-panel | doc selected → render doc-host; Code panel shows `.md`; hide controls |
| Dep | `packages/vite-plugin/package.json` | add `marked` |
| Example | `examples/` | add a `Notifications.stories.md` embedding existing stories |

## Testing

- **config** (`define.test.ts`): `ManifestDoc` shape typed/exported.
- **vite-plugin** (`discover-docs.test.ts`, new): `parseDoc` — frontmatter
  scalar/list parse; missing frontmatter → humanized-filename defaults; `:::story`
  → placeholder + `embeds[]`; non-directive `:::` lines untouched; markdown →
  html via `marked`. `discoverDocs` with a fake `read` — globs `.md`, defaults
  id/title, derives section, warns on dup id.
- **vite-plugin** (`discover.test.ts`): matched files partitioned by extension;
  `.md` excluded from the `ssrLoadModule` component path.
- **vite-plugin** (`plugin.test.ts`): `buildManifest` emits `docs[]`; embed id
  resolving to a real story passes, a typo warns + yields a missing-story marker;
  harness `import.meta.glob` literal stays `.{ts,tsx}`.
- **runtime** (`doc-host.test.tsx`, new): injects html; mounts a known embed;
  renders "story not found" for an unknown id.
- **desktop** (`build-tree` test): a `ManifestDoc` becomes a leaf node under its
  `group`/`section`; status badge present.
- **example**: the `Notifications.stories.md` doc renders with both embeds live.

## Risks

- **Two discovery interpreters** (component `ssrLoadModule` vs doc `read+parse`)
  could drift on path/section/id rules — mitigated by sharing `deriveSection`,
  the `kebab`/`humanize` helpers, and the single walk+glob front end.
- **Embed id coupling** — `componentId--storyId` ids churn if a component is
  renamed/re-slugged, silently breaking an embed. Mitigated by build-time
  validation + a visible in-page "story not found" marker (never a silent blank).
- **`marked` dependency** — first third-party runtime dep in the plugin. Chosen
  over hand-rolling markdown (too large) and over heavier MDX toolchains; it is
  zero-dependency and widely audited. Frontmatter stays hand-rolled to avoid
  `js-yaml`.
- **`dangerouslySetInnerHTML`** — doc HTML comes from project-local files the
  developer already trusts (same trust boundary as their own source); not
  user-submitted content. Acceptable; note it for any future hosted scenario.
- **`.md` in `import.meta.glob`** — Vite would try to transform unmatched `.md`;
  avoided by keeping the harness glob literal at `.{ts,tsx}` while the Node walk
  uses the widened pattern. The two patterns are intentionally different here and
  must be kept in sync if either changes.
