---
title: Post Previews
status: shipped
group: Features
owner: growth
---

# Post Previews

OpenStory renders a pixel-accurate preview of how a post will look on LinkedIn
before it ships. The same component powers every post type — text, media, polls,
reposts — so what a creator sees in the composer is what their audience gets.

## A short text post

The simplest case: author, body copy, and an engagement bar. This is the live
component, not a screenshot:

:::story linkedin--text-short

## A poll

Polls render their options, vote counts, and an expiry. Same component, richer
`media`:

:::story linkedin--poll

Every preview on this page is the real `LinkedinPreview` story, mounted inline —
edit the story and the doc updates with it.
