# Agent-First OpenStory: Headless Render Route + MCP Server

**Date:** 2026-06-29
**Status:** Approved design, pre-implementation
**Topic:** Make OpenStory drivable by AI agents, not only humans.

## Problem

OpenStory today is human-in-the-loop. To see a component an agent would have to
launch the Electron **manager**, click a story, and let it drive the harness over
`postMessage`. There is no headless way for an agent to (a) discover the design
system as structured data or (b) render a single component to something it can
"see."

The data plane is already agent-friendly: the Vite plugin serves
`/__pl__/manifest.json` over plain HTTP with rich, structured data (components,
stories with props, derived controls, prop types, `sourcePath`). The render plane
is the gap — it currently requires Electron + `postMessage`.

Two facts from ecosystem research shape the fix:

1. **Browser MCPs read the accessibility tree, not pixels.** Chrome DevTools MCP /
   Playwright MCP call `page.accessibility.snapshot()` and hand the agent a text
   AX tree with element uids. Screenshots are secondary (visual verification).
   The reliable agent "eyes" are *semantic DOM*, so OpenStory must serve a real,
   clean DOM the agent's own browser MCP can snapshot.
2. **Storybook already ships this pattern.** `@storybook/addon-mcp` mounts an MCP
   server **inside the dev server** over **HTTP transport** (`localhost:6006/mcp`),
   sources data from its manifests (`index.json`), and keeps Chromium **out of
   core** — community servers add Puppeteer screenshots as an opt-in. We mirror
   this exactly.

## Goal

An agent connects to OpenStory's MCP server, lists the design system, finds what
it just changed, gets a URL for a single story, and points its own browser MCP at
that URL to snapshot the accessibility tree (and optionally screenshot). No
Electron, no Chromium in core.

Non-goals (this push): server-side screenshots, write/mutation tools, MCP-Apps
inline embedding, auth. All are deliberate later-additive seams, called out below.

## Architecture

Two pieces, both mounted in the consumer project's Vite dev server by the
existing `openStory()` plugin. No new process, no new app.

```
  Agent (any: Claude, Cursor, CI)
    │  MCP over HTTP
    ▼
  /__pl__/mcp   ── reads ──►  manifest (already built) + git diff
    │  returns render URL
    ▼
  /__pl__/?component=X&story=Y&viewport=Z&theme=dark   (P0 render route)
    │  harness renders ONE story, clean DOM
    ▼
  Agent's browser MCP  ──►  page.accessibility.snapshot()  (sees it)
                            + optional screenshot          (verifies it)
```

### Principle: one renderer, many triggers

The harness at `/__pl__/` is the single renderer. It already accepts two
triggers:

- `postMessage` (`pl:render`) — how the Electron manager drives it (unchanged).
- **URL params** — `preview-host.tsx` already has `readSelectionFromUrl()` that
  reads `?component=&story=&viewport=` on initial mount and renders that one
  story. The render route is therefore **mostly already built**.

This guarantees what an agent snapshots is byte-identical to what a human sees —
no second renderer to drift, the same guard the manifest route already enforces
between Node discovery and browser render.

## P0 — Headless render route

### What exists

`/__pl__/?component=button&story=primary&viewport=desktop` already boots the
harness, `readSelectionFromUrl()` parses it, `PreviewStage` renders just the
component (inside an `inline-block` wrapper + the project's `providers`). The DOM
is already close to "naked component" — good for a clean AX tree.

### Gaps to close

1. **Theme via URL.** `.dark` is only toggled by the `os:theme` postMessage today;
   a headless agent has no manager to send it. Extend `readSelectionFromUrl()` to
   read `theme=light|dark` and toggle `.dark` on `document.documentElement` on
   mount. Default `light`.
2. **Layout via URL (optional param).** Read `layout=padded|centered|fullscreen`
   so an agent can request a layout without the manager toolbar. Falls back to the
   component's declared layout when absent (same precedence as the bridge).
3. **Stable, documented contract.** Treat the query API as a public, versioned
   surface (see Versioning). Document params, defaults, and the `OpenStory: …`
   fallback strings (`Unknown component`, `Unknown story`, `Waiting for
   selection…`) so an agent can distinguish "rendered" from "miss."
4. **No new route needed.** `/__pl__/render` is unnecessary; reuse `/__pl__/`.
   `get_render_url` (P1) returns the `/__pl__/?…` form. (If a cleaner alias is
   wanted later it can redirect; not in scope.)

### Clean-DOM requirement

The render must keep OpenStory chrome out of the component's accessibility tree.
`PreviewStage` already renders only `<Providers><Component/></Providers>` inside a
measure wrapper. Audit that the measure wrapper and `--os-canvas` style injection
add no roles/labels/landmarks to the AX tree (plain `div`s with inline styles are
fine; no `role`, `aria-*`, headings, or `nav`). Document this as an invariant.

### Out of scope for P0

`mode=docs|page` via URL — the bridge supports it, but the agent loop targets
single stories; defer URL support for docs/page until needed.

## P1 — MCP server in the Vite dev server

### Mounting

The `openStory()` plugin's `configureServer` already adds middleware for
`/__pl__/` and `/__pl__/manifest.json`. Add a third handler mounting an MCP
server over **Streamable HTTP transport** at `/__pl__/mcp`, using the official
`@modelcontextprotocol/sdk` (`McpServer` + the HTTP transport). Lives in the
`@gobrand/openstory-vite` package — same place the manifest is built, so tools
read the in-memory manifest with no extra IO. **Read-only** (the documented MCP
safety default: narrow blast radius, no mutations).

### Tools (all read-only)

| Tool | Input | Returns | Source |
| --- | --- | --- | --- |
| `list_components` | — | id, name, group, section, story ids+labels | manifest |
| `list_stories` | `component` | stories: id, label, props | manifest |
| `get_component_props` | `component` | derived `controls` (name, type, options, default) | manifest |
| `get_story_source` | `component` | absolute `sourcePath` + file contents | manifest + fs read |
| `get_changed_stories` | optional `base` (git ref) | components/stories whose `sourcePath` changed vs `base` (default working tree vs HEAD) | manifest + `git diff` |
| `get_render_url` | `component`, `story`, `viewport?`, `theme?`, `layout?` | absolute `/__pl__/?…` URL for the agent's browser MCP to open | P0 route |

`get_changed_stories` is the high-value loop: agent edits a component → asks what
it touched → renders only those → verifies. Implemented by mapping each manifest
component's `sourcePath` against the set of files reported by `git diff --name-only`
(relative to project root) at the chosen base. Files outside a git repo or git
errors degrade to "all stories" with a warning field, never a crash.

### Return-shape forward-compat

`get_render_url` returns a structured object (`{ url, component, story, viewport,
theme }`), not a bare string, so it can later gain an embedded MCP-App resource
(Storybook's `preview-stories` inline render) additively without breaking
consumers.

## Versioning

Add `schemaVersion` (integer, start at `1`) to the manifest JSON and expose it as
an MCP server capability/field. The P0 query-param contract is documented under
the same version. Breaking either bumps the version.

## Later / out of core (explicitly deferred, with seams)

- **Screenshot for browser-less agents.** A separate **opt-in** package
  `@gobrand/openstory-mcp` with Playwright as an optional dep, exposing a
  `render_story`-returns-PNG tool that drives the P0 URL headlessly. Never put
  Chromium in `@gobrand/openstory-vite`. Seam: `get_render_url`'s structured
  return + the stable P0 URL are all this package needs.
- **MCP-Apps inline render** — upgrade `get_render_url` return additively.
- **Auth / write tools** — start read-only; revisit if a mutation use case appears.

## Testing

The render contract is exactly what has no test today and is the thing that must
never silently break. Add, using `examples/starter` as the fixture project:

1. **Render-route unit/integration** (vite-plugin or runtime): boot the example
   project's Vite in `openstory` mode, GET `/__pl__/?component=button&story=primary&viewport=desktop&theme=dark`,
   assert 200 HTML; in a DOM/browser test assert the button renders, `.dark` is
   applied, and the AX tree contains the button's role/name and **none** of
   OpenStory's chrome.
2. **`readSelectionFromUrl` unit tests** for the new `theme`/`layout` params and
   defaults (extend existing `preview-host` tests).
3. **MCP tool unit tests**: each tool against a fixture manifest — shapes,
   `get_changed_stories` git mapping (mock `git diff` output), `get_render_url`
   URL composition, fallback/degrade paths.
4. **MCP integration**: spin the server on the example project, issue JSON-RPC
   over HTTP (curl-style, like Storybook's tests), assert `list_components` and
   `get_render_url` round-trip.

Vitest, matching the existing per-package setup. No visual-regression in this push
(deferred with the screenshot package).

## Risks

- **AX-tree pollution** by the measure wrapper / canvas style — mitigated by the
  clean-DOM audit + invariant test.
- **Framework-plugin gating** — the MCP route lives under `/__pl__/`, already the
  carve-out path the README documents projects to protect; no new gating burden.
- **MCP SDK transport churn** — pin `@modelcontextprotocol/sdk`; isolate transport
  wiring in one module so a transport change is a single-file edit.

## Build sequence

1. P0: extend `readSelectionFromUrl` (theme/layout) + clean-DOM audit + tests +
   document the URL contract.
2. Manifest `schemaVersion`.
3. P1: MCP server module + tools (read-only) + tests, mounted at `/__pl__/mcp`.
4. Docs: agent-facing README section (connect MCP, the URL contract, the loop).
