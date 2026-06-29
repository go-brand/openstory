---
title: Design System
status: shipped
group: Docs
owner: core
---

# Design System

This starter ships a tiny design system — a `Button` and a `Badge` — so there's
something real to look at. Both live under **Design System** in the sidebar,
auto-discovered from their `*.stories.tsx` files. The previews below are the
**real** components, mounted inline (not screenshots): edit a story and the doc
updates with it.

## Button

Four variants and three sizes. Here's the primary action:

:::story button--primary

And the destructive one:

:::story button--danger

## Badge

A status pill. The `Badge` stories declare `preset: "panel"`, so in the canvas
they render at a narrower width than the buttons:

:::story badge--success

## Authoring your own

- **A component story** — drop a `*.stories.tsx` next to your component
  (`defineStories({ component, stories: { Name: props } })`). It appears under
  whatever `group` you give it. Controls are derived from the props.
- **A docs page** — drop a `*.stories.md` (like this one) anywhere under `src`.
  Use frontmatter (`title`, `group`, `status`, `owner`) and
  `:::story <componentId>--<storyId>` to embed live components.
