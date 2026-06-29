---
title: Design System
status: shipped
group: OpenStory
owner: core
---

# Design System

These are the **real** primitives the OpenStory desktop app is built from —
`apps/desktop/src/components/ui`, Base UI under the hood, styled with the app's own
Tailwind theme (`src/styles.css`). OpenStory is rendering its own design system,
through itself. Every preview below is the live component, mounted inline (not a
screenshot): edit a story and the doc updates with it.

## Button

A `cva`-driven button — four variants (`primary`, `secondary`, `ghost`, `active`)
across three sizes:

:::story button--primary

:::story button--ghost

## Switch

A Base UI `Switch`, thumb and all, rendered headlessly:

:::story switch--off

:::story switch--on

## Checkbox

:::story checkbox--checked

## Slider

A full Base UI `Slider` — track, indicator, thumb:

:::story slider--default

## Authoring your own

- **A component story** — drop a `*.stories.tsx` next to the component
  (`defineStories({ component, stories: { Name: props } })`). It appears under its
  `group`; controls are derived from the props.
- **A docs page** — drop a `*.stories.md` (like this one) anywhere under `src`.
  Use frontmatter (`title`, `group`, `status`, `owner`) and
  `:::story <componentId>--<storyId>` to embed live components.
