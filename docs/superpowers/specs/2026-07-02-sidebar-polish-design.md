# Sidebar Polish

**Date:** 2026-07-02
**Status:** Approved design, pre-implementation
**Scope:** Visual and interaction polish for the existing desktop sidebar.

## Goal

Make the OpenStory sidebar feel more deliberate and faster to scan without changing
its navigation model. The user selected a hybrid direction: the top controls should
feel like a polished product navigator, while the tree body should borrow the dense,
guided rhythm of a code editor explorer.

## Current Surface

The sidebar already has the right structure:

- `RepoSwitcher` at the top.
- `ModeTabs` for `Design System` and `Docs`.
- `Tree` rows with section, folder, component, docs, page, and story node kinds.
- Existing keyboard navigation and selection callbacks in `Sidebar`.

This work keeps those contracts intact. It should not change routing, persisted
selection, project loading, docs/story IPC calls, or manifest tree building.

## Visual Direction

### Top Area

The repo switcher should read closer to the first reference:

- Slightly larger project identity and monogram.
- Calm hover/open states.
- Enough vertical breathing room to make the sidebar feel intentional.

The mode tabs remain a segmented pill, but should feel more tactile:

- Stronger active capsule.
- Better icon/text spacing.
- Subtle inset border and dark-mode depth.

### Tree Body

The tree body should read closer to the second reference:

- Denser row rhythm than the top controls.
- Clear indentation with branch guide rails for nested, expanded content.
- Larger text than the current tiny utility feel, but still compact enough for long trees.
- Selection as a strong blue pill spanning the row.
- Hover and focus states that are visible without competing with the selected row.

### Icons And Status

Keep the existing Hugeicons and node color semantics:

- Folders: violet.
- Components and docs-like primary nodes: blue/cyan family.
- Stories/bookmarks: teal.
- Page status labels stay right aligned and subdued, becoming readable on selected rows.

## Implementation Boundaries

Expected touch points:

- `apps/desktop/src/components/sidebar.tsx`
- `apps/desktop/src/components/sidebar/repo-switcher.tsx`
- `apps/desktop/src/components/sidebar/mode-tabs.tsx`
- `apps/desktop/src/components/sidebar/tree.tsx`
- `apps/desktop/src/styles.css` only if a small token-level adjustment is needed.

Avoid:

- Changing `build-tree.ts` behavior.
- Changing IPC calls.
- Changing project-switching behavior.
- Replacing Hugeicons.
- Introducing a new sidebar state model.

## Accessibility And Interaction

The polish must preserve:

- Existing keyboard navigation.
- Button semantics for tree rows and tabs.
- Visible focus.
- Truncated labels for narrow sidebars.
- Loading and empty states.

Guide rails should be decorative and must not add extra accessibility tree noise.

## Verification

Run focused verification for the edited surface:

- Targeted desktop unit tests for sidebar/build-tree behavior.
- Typecheck or equivalent package verification for `apps/desktop`.
- Visual smoke in the running app when feasible, with screenshot inspection of the
  sidebar in dark mode and enough nested rows to confirm spacing and guide rails.

Full-project `pnpm check` is not required for this polish if it remains noisy from
unrelated existing issues.
