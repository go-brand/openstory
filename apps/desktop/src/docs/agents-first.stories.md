---
title: Agents First
status: shipped
group: OpenStory
owner: core
---

# Agents First

A design system tool is only as useful as the things that can _read_ it. People
read it through a GUI. Increasingly, the thing reading it is an **AI agent**
writing or reviewing UI code. OpenStory's bet: treat agents as a first-class
consumer, not an afterthought.

The principle, stated once:

> **Anything a human can do through the OpenStory window, an agent can do
> headlessly — through a documented, versioned surface. No Electron, no clicking.**

## What is and isn't "agent-first"

It's worth being precise, because not everything in this repo is agent-first:

- **Agent-first** — the Vite plugin's machine surfaces: the **manifest**, the
  **headless render route**, and the **MCP server**. These need no GUI. An agent
  talks to them over HTTP.
- **Human convenience** — the Electron **manager** (this window), the dock dev
  launcher, the packaged `.app`. These make OpenStory pleasant for _people_. They
  add no agent capability and take none away. Shipping a signed installer is a
  distribution chore, not an agent feature.

The two halves share **one renderer and one manifest**. That's the trick: the
agent surface isn't a parallel reimplementation that can drift — it's the same
engine the window uses, exposed without the window.

## The three surfaces

**1. The manifest** — `GET /__pl__/manifest.json`. Structured, versioned
(`schemaVersion`) JSON: every component, its stories, their props, the derived
controls (the prop API), and source paths. An agent reads the whole design system
as data, with no rendering at all.

**2. The headless render route** — `/__pl__/?component=…&story=…&viewport=…&theme=…`.
Renders one story as a clean DOM — the naked component, no OpenStory chrome. An
agent points its **browser MCP** (Chrome DevTools, Playwright, claude-in-chrome)
at the URL and reads the **accessibility tree** — the reliable way to "see" UI,
more stable than pixels — then screenshots to confirm. Same render the window
shows; just triggered by a URL instead of a click.

**3. The MCP server** — `/__pl__/mcp`, read-only, mounted in the dev server. Six
tools: `list_components`, `list_stories`, `get_component_props`,
`get_story_source`, `get_changed_stories`, `get_render_url`. Any MCP client —
whatever agent the user already runs — connects and drives OpenStory.

## The loop that makes it matter

Not "dump 500 components into context." A tight edit→verify loop:

1. The agent edits a component.
2. `get_changed_stories` → only the stories that change touched (git diff).
3. `get_render_url` for each → a navigable URL.
4. Its browser MCP opens the URL, snapshots the accessibility tree + a screenshot,
   and verifies the change actually looks right.

The agent never re-scans the whole system. It sees exactly what it changed, the
way a careful human would — but in one turn.

## Why this is the bet, not a feature

Component libraries are racing to ship MCP servers so agents generate code with
the _real_ components instead of hallucinating new ones. OpenStory is built so
that surface is the same one humans use — no second system to maintain, versioned
so agents can depend on it, and dogfooded: the doc you're reading is a
`*.stories.md` rendered by OpenStory itself, and the components beside it in the
sidebar are the app's own primitives, read through the same manifest an agent
would call.

Here's `button--primary`, the live component an agent would reach via
`get_render_url`:

:::story button--primary

## Honest boundaries

- **Read-only.** No mutation tools — narrow blast radius by design.
- **No Chromium in core.** Screenshots are the agent's own browser MCP's job; a
  server-side screenshot tool for browser-less agents is a planned opt-in package.
- **The desktop app is for humans.** Its packaging, signing, and launchers are not
  agent features — the agent path is the headless surface above, and it works
  whether or not the Electron app is even installed.

See **How the MCP Works** for the tool-by-tool reference.
