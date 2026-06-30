# Inter-doc navigation (clickable links in feature docs)

**Date:** 2026-06-30
**Status:** Approved design, pre-implementation
**Builds on:** [feature-docs](./2026-06-26-feature-docs-design.md) (`docs[]` manifest, `DocHost`, `:::story` embeds), [sidebar mode switch](./2026-06-28-sidebar-mode-switch-design.md) (`design` | `docs` modes), [agent-first MCP render](./2026-06-29-agent-first-mcp-render-design.md) (headless URL contract)

## Problem

A feature doc (`*.stories.md`) can embed live stories but **cannot link to
anything**. An author who writes `[See the Design System](./design-system.stories.md)`
gets a dead link: the runtime renders the doc HTML inertly (`doc-host.tsx:50`,
one-time `innerHTML`), there is no click handling, and clicking a relative href
navigates the preview iframe to a 404 (the iframe URL only routes
`component`/`story`/`viewport`/`theme`/`layout` — there is no `doc`/`page`
param). Cross-references in the reference docs are therefore written as **prose
mentions**, not links (e.g. `how-the-mcp-works.stories.md:92`).

We want real, clickable inter-doc navigation: a link in a doc that selects
another doc, a component's auto-docs, or a specific story — and external links
that open in the user's real browser.

## Why this is tractable

The runtime **already posts messages upward** to the manager — `pl:ready`,
`pl:manifest`, `pl:size` are defined in `bridge.ts` and handled by the manager's
`onMessage` listener (`use-harness-bridge.ts:160-182`). A navigation message is
not a new channel, just a new member of that family. And the manager already
owns every selection IPC we need: `preview:set` (story), `preview:setDocs`
(auto-docs), `preview:setPage` (page) — `ipc.ts:147-196`.

## Decisions (settled in brainstorm)

1. **Four link targets, all in scope:** other feature-doc pages, component
   auto-docs, a specific story, and external URLs.
2. **Author syntax is plain CommonMark** — no new directive. Relative file paths
   identify internal targets; a `#fragment` selects a story within a component
   file; `http(s):`/`mailto:` are external.

   ```markdown
   [See the Design System](./design-system.stories.md)   → page
   [All Button docs](../button.stories.tsx)              → component auto-docs
   [Button / Primary](../button.stories.tsx#primary)     → specific story
   [Anthropic](https://anthropic.com)                    → external (real browser)
   ```
3. **Resolution happens at build time**, in the vite-plugin, where the full
   manifest (component ids, story ids, page ids, source paths) is already in
   hand. The runtime never parses file paths.
4. **Unresolved links warn + render inert.** A clear `console.warn` (doc path +
   bad href) and the link text renders as non-clickable styled text. The doc
   still works; the breakage is visible to authors/agents, not silent.
5. **Encoding is an accessible real anchor with a resolved custom-scheme href.**
   The build rewrites the href to `openstory:page/<id>` /
   `openstory:docs/<componentId>` / `openstory:story/<componentId>/<storyId>`.
   We keep a real `<a href>` (focusable, keyboard-activatable via Enter,
   announced as a link by screen readers — WCAG/WAI-ARIA standard for in-app
   links) rather than a hrefless `data-` attribute. Because the href is a
   resolved *custom scheme*, an un-intercepted click cannot navigate the iframe
   to a dead URL — fail-safe.
6. **The runtime intercepts clicks and posts up; the manager dispatches to
   existing IPC.** No new selection logic, just a new message → IPC mapping.

## Non-goals (v1 cuts — fast-follows)

- **In-page `#heading` anchors** within a rendered page (would require slug ids
  on headings). A fragment is only meaningful on a component file link (story
  selection) in v1; a fragment on a page link is ignored.
- **Back/forward navigation history.** Selection remains the single source of
  truth; there is no per-doc URL to build history on.
- **Auto-docs `#story` deep-linking** that scrolls the auto-docs page to a
  specific story. A component fragment selects the *single story* view, not a
  scroll position within auto-docs.

## Architecture

```
*.stories.md  ──build──▶  assembleManifest (vite-plugin)
  [link](./x)             │  resolve-doc-links.ts rewrites <a href> →
                          │  openstory:page/… | docs/… | story/…  (or inert)
                          ▼
                       doc.html (in manifest, carries resolved hrefs)
                          │  manifest → manager → pl:render { pageHtml }
                          ▼
   DocHost (runtime)  ─ delegated click handler ─▶  window.parent.postMessage
                          │                          { type:"pl:navigate", target }
                          ▼
   useHarnessBridge (manager) onMessage ── pl:navigate ──▶ api.invoke(
        page → preview:setPage | docs → preview:setDocs |
        story → preview:set    | external → shell:openExternal )
                          ▼
        patchSelection + broadcastState → re-render
```

### 1. Build-time resolver — `packages/vite-plugin/src/resolve-doc-links.ts` (new)

Resolution moves into `assembleManifest` (`assemble-manifest.ts`), the one place
both `components` (with `sourcePath`, id, story ids) and `docs` (with
`sourcePath`, id) exist together — the same context that already validates
embeds at `assemble-manifest.ts:96-104`.

AST-based via **marked's custom `renderer.link`** (operate on the markdown link
token, not regex over serialized HTML). `discoverDocs` becomes two-pass so a doc
can link to a doc whose id comes from *its* frontmatter:

- **Pass 1:** parse every doc's frontmatter + body; compute each doc's id
  (`data.id ?? kebabCase(fileBase)`, as today at `discover-docs.ts:48-49`).
  Build `pageByAbsPath: Map<string, pageId>`. Components arrive prebuilt from
  `assemble-manifest.ts:92-93` as `componentByAbsPath: Map<string, {id, storyIds:Set}>`.
- **Pass 2:** render each doc body with a link-resolving renderer. For a link
  with raw href `H` and the doc's `sourcePath`:

| Case | Emitted href / output |
|---|---|
| `H` scheme is `http`/`https`/`mailto` | `<a href="H" rel="noopener noreferrer">` (unchanged target) |
| `H` relative, `resolve(dirname(sourcePath), pathPart)` matches a doc | `<a href="openstory:page/<encodedId>">` |
| matches a component, no fragment | `<a href="openstory:docs/<encodedComponentId>">` |
| matches a component, fragment = a known story id | `<a href="openstory:story/<encodedComponentId>/<encodedStoryId>">` |
| matches a component, fragment not a known story | **inert** + warn |
| matches nothing | **inert** + warn |

- **Inert output:** `<span class="openstory-doc-deadlink" title="unresolved link: H">TEXT</span>`
  plus `console.warn("[openstory] doc <sourcePath>: unresolved link 'H' — <reason>. Rendering inert.")`.
- **Segment encoding:** `encodeURIComponent` each id segment so ids with special
  characters round-trip; the runtime `decodeURIComponent`s.

`discoverDocs` gains a `componentTargets` parameter (passed from
`assembleManifest`). `parseDoc` is split so frontmatter/id derivation (pass 1)
is reusable without rendering.

### 2. Runtime — delegated click handler in `DocHost` (`packages/runtime/src/doc-host.tsx`)

In the existing effect that writes `root.innerHTML = html` (`doc-host.tsx:47-57`),
add one delegated `click` listener on `root`, removed in the effect cleanup.
On click, walk to the nearest `<a>`:

- href starts with `openstory:` → `preventDefault()`; decode into a `target`;
  `window.parent.postMessage({ type: "pl:navigate", target }, "*")`.
- href scheme is `http`/`https`/`mailto` → `preventDefault()`;
  post `{ type:"pl:navigate", target:{ kind:"external", href } }`.
- otherwise (no anchor, inert span, in-doc embed) → ignore.

Decoding grammar for `openstory:<kind>/<segments>`:
`page/<id>` → `{kind:"page", id}`; `docs/<componentId>` →
`{kind:"docs", componentId}`; `story/<componentId>/<storyId>` →
`{kind:"story", componentId, storyId}`. Each segment `decodeURIComponent`'d.

Keyboard Enter on a focused anchor dispatches a native `click`, so this path is
keyboard- and screen-reader-correct with no extra handling.

Styling (`DOC_CSS` in `doc-host.tsx`): `.openstory-doc-deadlink` renders muted,
no underline, `cursor: default`; resolved internal links keep the existing
underlined `.openstory-doc a` treatment.

### 3. Channel — `pl:navigate` in `packages/runtime/src/bridge.ts`

```ts
export type NavigateTarget =
  | { kind: "page"; id: string }
  | { kind: "docs"; componentId: string }
  | { kind: "story"; componentId: string; storyId: string }
  | { kind: "external"; href: string };

export type NavigateMessage = { type: "pl:navigate"; target: NavigateTarget };
```

Added to the `BridgeMessage` union and `KNOWN_TYPES`, alongside the existing
upward messages. (Defining it in the shared contract keeps the runtime and
manager from drifting, even though only the manager consumes it.)

### 4. Manager — dispatch in `apps/desktop/src/lib/use-harness-bridge.ts`

Extend the existing `onMessage` listener (`use-harness-bridge.ts:160-182`) with:

```ts
else if (type === "pl:navigate") {
  const t = (e.data as NavigateMessage).target;
  const api = apiRef.current;
  if (!api) return;
  if (t.kind === "page") api.invoke("preview:setPage", t.id);
  else if (t.kind === "docs") api.invoke("preview:setDocs", t.componentId);
  else if (t.kind === "story")
    api.invoke("preview:set", { componentId: t.componentId, storyId: t.storyId, viewport: latest.current.viewport });
  else if (t.kind === "external") api.invoke("shell:openExternal", t.href);
}
```

`viewport` for a story target comes from the current selection (`latest.current`),
preserving the user's desktop/mobile choice.

### 5. Cross-tree correctness — fold `mode` into the selection IPC handlers (`apps/desktop/electron/ipc.ts`)

A page (Docs tree) linking to a story (Design System tree) must flip the sidebar
mode, or the new selection is invisible. Make the selection IPCs authoritative
about `mode` — an invariant that is a no-op for existing same-tree sidebar
clicks and fixes cross-tree navigation in one place:

- `preview:set` (`ipc.ts:159`) and `preview:setDocs` (`ipc.ts:182`) →
  `patchSelection({ …, mode: "design" })`.
- `preview:setPage` (`ipc.ts:187`) → `patchSelection({ …, mode: "docs" })`.

Single `patchSelection` + single `broadcastState` per navigation (no double
broadcast, no flicker).

### 6. External links — `shell:openExternal` IPC (`apps/desktop/electron/ipc.ts`, `types.ts`)

New handler; add `"shell:openExternal": (href: string) => void` to `IpcInvoke`
(`types.ts:104-130`). The main-process handler **allowlists schemes** before
opening — the documented Electron guard against `shell.openExternal` being
handed `file:`/`javascript:`/etc.:

```ts
ipcMain.handle("shell:openExternal", (_e, href: string) => {
  try {
    const scheme = new URL(href).protocol;
    if (scheme === "http:" || scheme === "https:" || scheme === "mailto:")
      shell.openExternal(href);
    else console.warn(`[openstory] blocked openExternal for scheme ${scheme}`);
  } catch { /* malformed URL: ignore */ }
});
```

Combined with `rel="noopener noreferrer"` on the rendered external anchors.

## Error handling

- **Unresolved link (build):** warn + inert span (decision 4). Never throws —
  one typo must not block the preview.
- **Unknown id at navigate time (runtime/manager):** `preview:setPage`/`setDocs`/`set`
  with an id absent from the current manifest patches selection to a
  non-matching target; the host shows its existing "Waiting for selection…" /
  missing-story fallback. Acceptable; ids are build-validated, so this only
  occurs under live manifest churn (a story deleted between build and click).
- **Disallowed external scheme:** blocked in the main handler with a warn; no
  navigation occurs.
- **Version skew:** an older runtime (no click handler) leaves the
  custom-scheme anchor inert — a no-op, not a broken navigation. An older
  vite-plugin (no resolver) emits today's relative hrefs (current dead-link
  behavior). The resolver and runtime handler are a matched pair and ship
  together.

## Testing

Colocated `*.test.ts(x)`, matching existing patterns (`preview-host.url.test.tsx`,
`discover-docs.test.ts`, `selection.test.ts`):

- **`resolve-doc-links.test.ts`** — table over every target kind, unresolved file,
  unknown story fragment, fragment-on-page (ignored), external pass-through,
  segment encoding, and sibling vs. parent-dir relative paths.
- **`doc-host` click test** — each anchor type posts the correct `pl:navigate`;
  `preventDefault` is called; clicks on non-links and inert spans are ignored.
- **manager handler test** — each `target.kind` maps to the correct `api.invoke`,
  story preserves current viewport.
- **`bridge` parse test** — `parseBridgeMessage` accepts `pl:navigate`.
- **main handler test** — `shell:openExternal` opens `http(s)`/`mailto` and
  rejects `file:`/`javascript:`.

## Rollout

Three published packages (publish flow: `v*` tag → CI; the app consumes
published versions):

1. Ship `@gobrand/openstory-vite-plugin` (resolver) + `@gobrand/openstory-runtime`
   (click handler + `pl:navigate`) together — matched pair.
2. Bump the desktop app's deps to the published versions.
3. The desktop manager handler (`use-harness-bridge`, `ipc`, `types`) ships with
   the app build.

## Files touched

**New:**
- `packages/vite-plugin/src/resolve-doc-links.ts` + test

**Modified:**
- `packages/vite-plugin/src/discover-docs.ts` (two-pass; split `parseDoc`)
- `packages/vite-plugin/src/assemble-manifest.ts` (pass `componentTargets` into `discoverDocs`)
- `packages/runtime/src/bridge.ts` (`NavigateMessage`)
- `packages/runtime/src/doc-host.tsx` (click handler + deadlink CSS)
- `apps/desktop/src/lib/use-harness-bridge.ts` (`pl:navigate` dispatch)
- `apps/desktop/electron/ipc.ts` (fold `mode`; `shell:openExternal`)
- `apps/desktop/electron/types.ts` (`shell:openExternal` in `IpcInvoke`)
