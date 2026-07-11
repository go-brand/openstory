---
name: openstory-feature-docs
description: Use when creating, reviewing, or updating OpenStory *.stories.md feature documentation, especially after code changes, when feature docs may have drifted, or when working with OpenStory docs, internal links, story embeds, affected-doc MCP tools, or manifest verification.
---

# OpenStory Feature Docs

## Overview

Treat each `*.stories.md` page as the current operational contract for one cohesive feature. Write from source truth for engineers who need to understand behavior, boundaries, ownership, and safe change—not from the task narrative or git history.

Read [the feature documentation standard](references/feature-documentation-standard.md) before drafting or restructuring a page.

## Workflow

1. **Establish scope.** Identify the cohesive feature, its actors, user-visible capabilities, canonical state, runtime owners, and important limits. Keep one canonical page until a subsystem has independent ownership or an independently useful mental model.
2. **Collect current truth.** Inspect the current code, schemas, contracts, tests, runtime configuration, and existing page. A diff explains what changed; current source defines what is true.
3. **Use doc sync once.** At the completion boundary, call OpenStory MCP `get_affected_docs` once with a stable base. For every result, call `get_doc_sync_context` with the same base. Also inspect relevant untracked files and indirect feature changes; detection is intentionally reference-driven, not semantic.
4. **Select the document shape.** Apply the required sections and only the conditional modules whose predicates match the feature. Do not add empty headings.
5. **Write current-state prose.** Describe the feature as it works now. Preserve durable product rules, state transitions, authorization, failure behavior, ownership, and extension constraints. Let git own removed implementations and refactor history.
6. **Use OpenStory navigation.** Prefer meaningful relative links and live story embeds where seeing a state materially improves understanding.
7. **Verify the rendered contract.** Review the final cumulative diff, then validate the affected page against the real OpenStory manifest. Do not expect `get_affected_docs` to clear after editing; it has no acknowledgement state.

## OpenStory quick reference

| Authoring need      | Syntax                                      | Result                        |
| ------------------- | ------------------------------------------- | ----------------------------- |
| Link another page   | `[Assets](./assets.stories.md)`             | Opens that OpenStory page     |
| Link component docs | `[Button](../button.tsx)`                   | Opens component documentation |
| Link one story      | `[Disabled button](../button.tsx#disabled)` | Opens that component story    |
| Embed one story     | `:::story button--disabled` on its own line | Renders the live story inline |

Relative component links must target the component's manifest `sourcePath`. Story fragments use the manifest story id, not the display label.

## Manifest verification

Use the manifest served by the project's existing OpenStory-mode Vite server:

```bash
node <skill-dir>/scripts/verify-openstory-docs.mjs \
  http://localhost:<port>/__pl__/manifest.json <doc-id>
```

The check requires supported feature metadata, resolved internal links, and valid embeds. It accepts a saved manifest JSON path when an HTTP server is unavailable.

## Common mistakes

- Writing a changelog, implementation diary, PR summary, or deleted-system comparison.
- Treating intended behavior as shipped behavior.
- Listing every file or adapter instead of explaining the contract and ownership boundaries.
- Adding verification timestamps or command transcripts that immediately become stale.
- Using free-form statuses; OpenStory supports `shipped`, `beta`, and `planned`.
- Assuming an empty affected-doc result proves prose accuracy or link integrity.
