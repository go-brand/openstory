---
title: How the MCP Works
status: shipped
group: OpenStory
owner: core
---

# How the MCP Works

You're reading this **inside OpenStory**, rendered from a `.stories.md` in the
desktop app's own source — OpenStory documenting itself with its own tool. This
page explains the agent surface: how an AI agent drives OpenStory headlessly, no
clicking required.

## Two surfaces, both under `/__pl__/`

When the `openStory()` Vite plugin runs in a project's dev server, an agent gets
two things mounted on that server:

**1. A headless render route.** A stateless URL that renders **one** story,
identical to what you see on this canvas (same renderer, two triggers — the
manager's `postMessage`, or these query params):

```
/__pl__/?component=button&story=primary&viewport=desktop&theme=dark
```

`component` / `story` / `viewport` are required; `theme` (default `light`) and
`layout` (`padded` | `centered` | `fullscreen`) are optional. An agent points its
**browser MCP** (Chrome DevTools, Playwright, claude-in-chrome) at the URL and
snapshots the **accessibility tree** — the reliable way to "see" UI, more stable
than pixels because it survives layout reflow — then optionally screenshots to
verify. The page is the naked component: no OpenStory chrome pollutes the tree.

**2. A read-only MCP server** at `/__pl__/mcp` (HTTP transport, mounted right in
the dev server, the way `@storybook/addon-mcp` does it). Point any MCP client at
it:

```
npx mcp-add --type http --url 'http://localhost:<port>/__pl__/mcp'
```

## The six tools

All read-only — the documented MCP safety default (narrow blast radius, no
mutations). All read the same manifest that fills this sidebar:

| Tool | Returns |
| --- | --- |
| `list_components` | every component: id, name, group, section, story ids/labels |
| `list_stories` | one component's stories with props |
| `get_component_props` | a component's derived controls — its prop API |
| `get_story_source` | a component's stories file path + contents |
| `get_changed_stories` | stories whose source changed (git diff; default working tree vs HEAD) |
| `get_render_url` | a navigable render URL (structured object) for a story |

## The loop that matters

Not "list 500 components." The tight edit→verify loop:

1. Edit a component (say `button.tsx`).
2. `get_changed_stories` → the stories that touched (git diff).
3. `get_render_url` for each → a navigable URL.
4. The browser MCP opens it, snapshots the accessibility tree + screenshot, and
   verifies the change.

No re-scanning the whole design system every turn.

## Live, the way an agent renders it

A `:::story` directive mounts the **real** story inline — the same
`button--primary` an agent reaches via `get_render_url`:

:::story button--primary

And a stateful Base UI control, rendered headlessly just the same:

:::story switch--on

## Boundaries (on purpose)

- **Read-only.** No mutation tools.
- **No Chromium in core.** Screenshots are the agent's own browser MCP's job. A
  server-side screenshot tool for browser-less agents (CI, plain API) is a planned
  opt-in package.
- **Versioned.** The manifest shape and the render-route query params are stable
  under `schemaVersion` (currently `1`); breaking either bumps it.
