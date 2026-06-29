---
title: For Agents
status: shipped
group: OpenStory
owner: core
---

# For Agents

OpenStory is **agents-first**. Everything a human does by clicking, an AI agent
can do headlessly — no Electron, no manager. This page (a `.stories.md`,
discovered and rendered by the same engine) documents that surface, and dogfoods
it: the live `Button` below is embedded the same way an agent would render it.

## Two surfaces, both under `/__pl__/`

Run the project's Vite dev server with the `openStory()` plugin and an agent gets:

**1. A headless render route.** A stateless URL that renders one story, identical
to what the desktop manager shows — same renderer, two triggers (the manager's
`postMessage`, or these query params):

```
/__pl__/?component=button&story=primary&viewport=desktop&theme=dark
```

`component` / `story` / `viewport` are required; `theme` (default `light`) and
`layout` (`padded` | `centered` | `fullscreen`, defaults to the component's own)
are optional. An agent points its **browser MCP** (Chrome DevTools, Playwright,
claude-in-chrome) at the URL and snapshots the **accessibility tree** — the
reliable way to "see" UI, more stable than pixels — then optionally screenshots
to verify. The page is the naked component: no OpenStory chrome pollutes the AX
tree.

**2. A read-only MCP server** at `/__pl__/mcp` (HTTP transport, mounted right in
your dev server). Six tools over the same manifest the sidebar reads:
`list_components`, `list_stories`, `get_component_props`, `get_story_source`,
`get_changed_stories`, and `get_render_url`.

## The loop

The point isn't "list 500 components." It's a tight edit→verify loop:

1. Edit a component (say `button.tsx`).
2. `get_changed_stories` → the stories that touched (git diff vs HEAD).
3. `get_render_url` for each → a navigable URL.
4. Browser MCP opens it, snapshots the AX tree + screenshot, verifies the change.

No re-scanning the whole design system every turn.

## Live, the way an agent renders it

A `:::story` directive mounts the **real** story inline — the same `button--primary`
an agent reaches via `get_render_url`:

:::story button--primary

## Boundaries (on purpose)

- **Read-only.** No mutation tools — narrow blast radius, the documented MCP
  safety default.
- **No Chromium in core.** Screenshots are the agent's own browser MCP's job. A
  server-side screenshot tool for browser-less agents (CI, plain API) is a planned
  opt-in package.
- **Versioned.** The manifest shape and the render-route query params are stable
  under `schemaVersion` (currently `1`); breaking either bumps it.
