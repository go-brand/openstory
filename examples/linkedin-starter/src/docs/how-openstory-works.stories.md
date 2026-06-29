---
title: How OpenStory Works
status: shipped
group: OpenStory
owner: core
---

# How OpenStory Works

You're reading this **inside OpenStory** — it's a `.stories.md` file in this
project, discovered and rendered by the same engine that shows the component
previews. This page explains how that engine is put together.

## Two worlds

OpenStory is not a single library. It is a **manager** plus a **harness**, and
they run in two different places:

- **The manager** is the Electron app — the sidebar, toolbar, controls panel,
  and the canvas you're looking at. You run it. It is *not* installed into your
  project.
- **The harness** is a small React app that runs **inside your own Vite dev
  server**, in an iframe. It imports your *real* components and renders them
  with your CSS, your React version, and your providers.

```
  Electron MANAGER                         YOUR Vite dev server
  (chrome you click)                       (openStory() plugin)
  ┌────────────────────┐   postMessage   ┌────────────────────────┐
  │ sidebar / toolbar  │ ◄─────────────► │ harness renders YOUR    │
  │ <iframe /__pl__/ ──┼─────────────────┼─► components, posts size │
  └────────────────────┘                 └────────────────────────┘
        not published                       installed as @gobrand/*
```

The manager **cannot** import your components directly — they need your
bundler, your Tailwind, your providers. So the part that renders components has
to live in your project and run in your Vite. The manager just points an iframe
at it and talks over `postMessage`. That single boundary is the reason OpenStory
is split into the packages below.

## The request flow

1. You add `openStory()` to your `vite.config.ts` and run Vite.
2. The plugin globs `*.stories.{ts,tsx}` and `*.stories.md`, builds a manifest
   (components, stories, docs), and serves the harness HTML at `/__pl__/`.
3. The manager starts your Vite server and loads `/__pl__/` in the canvas iframe.
4. You click a story. The manager sends a `postMessage` (`pl:render`) with the
   selection + theme.
5. The harness renders that component, measures it, and posts its size back
   (`pl:size`) so the manager can fit the iframe to the component and frame it on
   OpenStory's themed canvas.

## The packages

The split is about **where code runs**, not arbitrary modularity:

| Package | Runs in | Job |
| --- | --- | --- |
| `@gobrand/openstory-config` | everywhere (shared) | the authoring API (`defineOpenStoryConfig`) + the component/story types. Zero dependencies, so the Node tooling can import it without pulling in React. |
| `@gobrand/openstory-runtime` | the **browser** harness | the React app in the iframe — renders the component, the doc prose you're reading, and the size/manifest bridge. |
| `@gobrand/openstory-vite` | **Node** (your Vite server) | serves the harness, discovers stories + docs, extracts prop types from TypeScript. |
| `@gobrand/openstory-platforms` | the browser (optional) | prebuilt content (the LinkedIn preview component used on this page). Not infrastructure — skip it if you don't need it. |

The hard line is **Node vs Browser**: the Vite plugin and the harness literally
cannot be one package. `config` stays dependency-free so the Node side imports
shared types without dragging React along.

## Live components in docs

Docs aren't screenshots. A `:::story` directive mounts the **real** story inline
— edit the story and this updates with it. Here is `linkedin--text-short`,
rendered live in the middle of this page:

:::story linkedin--text-short

## Add your own

- **A component story** — drop a `*.stories.tsx` next to your component. It shows
  up under **Design System**. No manual registration.
- **A docs page** — drop a `*.stories.md` (like this file) anywhere under `src`.
  It shows up under **Docs**. Use frontmatter (`title`, `group`, `status`,
  `owner`) for the sidebar, and `:::story <componentId>--<storyId>` to embed live
  components.
