---
title: Keeping Docs in Sync
status: shipped
group: OpenStory
owner: core
---

# Keeping Docs in Sync

A `.stories.md` doc — like this one — embeds live stories and links to component
APIs. When the code behind those changes, the prose drifts out of date silently.
The **doc-sync engine** closes that gap: at a work boundary it tells an agent
exactly which docs a change touched, and hands over everything needed to
reconcile each one. Two read-only MCP tools, no auto-writing — the agent edits
the doc with its own tools.

## When to run it

**Once, at a completion boundary** — the end of a feature, not after every save.
Detection works off the *cumulative* diff, so a ten-step change reconciles its
docs a single time against everything it touched.

The diff base defaults to `merge-base origin/main HEAD` (the commit your work
diverged from). When that can't be resolved — no remote, shallow clone — it falls
back to the working tree vs `HEAD`. Pass an explicit `base` to override.

## `get_affected_docs` — what changed, and why

Call it with no args at the boundary. It joins the current manifest against the
git-changed file set and returns each affected `*.stories.md` with **structured
reasons**:

| Reason | Meaning |
| --- | --- |
| `embed-component-changed` | a `:::story` embed's component source changed (carries `componentId`, `storyId`) |
| `link-target-changed` | an inter-doc link points at a changed component's docs/story (`targetKind`, `componentId`, `storyId?`) |
| `doc-file-changed` | the doc's own `.md` file was edited |
| `broken-embed` | the doc embeds a story that no longer exists — with a fuzzy `suggestion` (the closest existing story key within 3 edits, else `null`) |

`broken-embed` is flagged **every** run, change or not — a dangling `:::story`
is always worth fixing. The other three are diff-driven.

## `get_doc_sync_context` — everything to reconcile one doc

For each flagged doc, call `get_doc_sync_context({ doc })`. It returns one
self-contained reconciliation package:

- **`docSource`** — the doc's current `.md` source.
- **`reasons`** — the same structured reasons, so you know *why* it's here.
- **`changedComponents`** — per distinct changed component (from embed/link
  reasons only): its **git diff** (the before/after to read) plus its current
  **`manifestEntry`** (the new prop/story API). A `broken-embed`'s fix is the
  deterministic `suggestion`, not a diff, so it pulls no component context.

Read the diff for what actually changed, cross-check the current API, then edit
the `.stories.md` with your own tools.

## The loop

1. Finish the change (component, story, or doc edits).
2. `get_affected_docs` → the docs that drifted, with reasons.
3. For each: `get_doc_sync_context({ doc })` → source + diffs + current API.
4. Reconcile the prose. Re-run step 2 to confirm nothing's left flagged.

## Boundaries (on purpose)

- **Read-only.** The engine detects and packages; it never writes a doc. The
  agent owns every edit.
- **No "old manifest."** Detection uses the *current* manifest plus the
  git-changed file set — the git *diff* is the before/after the agent reads.
  Nothing to snapshot or persist.
- **Custom-scheme links only.** Resolved internal links
  (`openstory:docs/<id>`, `openstory:story/<id>/<storyId>`) count as component
  references; `openstory:page/...` links do not.
