# Feature documentation standard

## Contents

- [Purpose and audience](#purpose-and-audience)
- [Page ownership](#page-ownership)
- [Required page shape](#required-page-shape)
- [Conditional modules](#conditional-modules)
- [Detail threshold](#detail-threshold)
- [Writing rules](#writing-rules)
- [Feature page skeleton](#feature-page-skeleton)
- [Research basis](#research-basis)

## Purpose and audience

An OpenStory feature page is a living explanation and reference for product engineers and operators. It answers:

- What does this feature do, and for whom?
- Which behavior and business rules must remain true?
- How does work move through the system?
- Which system owns each important state or asynchronous responsibility?
- What failure, authorization, lifecycle, or operational behavior matters?
- Where should an engineer start when changing it?

It is not a proposal, tutorial, task report, test log, API dump, or replacement for git history.

## Page ownership

Keep one canonical page per cohesive capability. Split a page when a subsystem has its own operational owner, lifecycle, or independently useful mental model. Link shared concepts to their canonical page instead of copying them.

Use this frontmatter:

```md
---
title: Feature name
status: shipped
group: Features
owner: team-slug
---
```

Supported statuses are `shipped`, `beta`, and `planned`. Use `id` only to preserve navigation identity across a rename or to resolve a filename collision.

## Required page shape

### Orientation

Start with what the feature enables, who uses it, and its boundary. Name adjacent products only when the distinction prevents a real misunderstanding.

### Feature contract

Describe user-visible capabilities and durable rules. Cover scope, ownership, visibility, destructive behavior, and important limits. A compact capability or role table is appropriate when exact mappings matter.

### How it works

Give the smallest mental model that explains the feature. Trace the primary flow from entry point through authoritative state and asynchronous work to the observable result. Prefer one compact diagram or numbered sequence over parallel descriptions of the same flow.

### Source map

Point to stable entrypoints by responsibility: UI, public contract, validation, persistence, runtime, configuration, and representative tests. Prefer directories, files, and exported symbols over line numbers or exhaustive inventories.

### Related OpenStory pages

Link only pages that own a related concept. Explain the relationship in one phrase.

## Conditional modules

Include a module only when its predicate is true.

| Predicate                                     | Add this module            | Cover                                                       |
| --------------------------------------------- | -------------------------- | ----------------------------------------------------------- |
| Different actors have different powers        | Authorization              | Role capabilities, tenancy, anti-enumeration                |
| Records move through meaningful states        | State and lifecycle        | Transitions, retention, deletion, restoration               |
| Work crosses processes or services            | Architecture and ownership | Sources of truth, runtime boundaries, bindings              |
| Work can fail after acceptance                | Failure and recovery       | Idempotency, retries, reconciliation, partial success       |
| Users pay or consume quotas                   | Metering and billing       | Quote authority, reservation, settlement, failure rules     |
| Clients cache, poll, or receive events        | Client consistency         | Authority, refresh triggers, realtime hints, stale recovery |
| Privacy or security depends on a boundary     | Security and privacy       | Access enforcement, secrets, signed delivery, revocation    |
| A shipped limitation affects use or operation | Known limitations          | Observable impact and canonical follow-up                   |
| A live state is easier to understand visually | Embedded stories           | Representative states, not a component gallery              |

## Detail threshold

Document facts that survive ordinary refactors:

- business invariants and product semantics;
- canonical records and state machines;
- authorization and tenancy boundaries;
- idempotency, retries, reconciliation, and destructive behavior;
- provider/runtime ownership and operational dependencies;
- public feature/API topology when it is a useful navigation map;
- constraints future changes must preserve.

Leave these to source code, tests, or git:

- deleted approaches and before/after comparisons;
- individual hook callback wiring or cache helper names;
- transient component names, line numbers, and file counts;
- copied command output, verification dates, and release diaries;
- speculative architecture presented beside shipped behavior;
- exhaustive type or endpoint listings that add no mental model.

Name a technical mechanism when it explains a durable contract. For example, document a transactional outbox because it defines recovery semantics; omit a helper rename that does not change behavior.

## Writing rules

- Lead each section with its most important fact.
- Use clear, direct language and consistent domain terms.
- Use sentence-case headings and meaningful link text.
- Use numbered lists for sequences and bullets for unordered facts.
- Put identifiers, paths, fields, statuses, and commands in code formatting.
- Distinguish authoritative state from caches, projections, and delivery hints.
- State current limitations plainly. Link future design instead of blending it into current behavior.
- Keep verification as stable expectations and representative coverage ownership, not a transcript of one run.

## Feature page skeleton

```md
---
title: Feature name
status: shipped
group: Features
owner: team-slug
---

# Feature name

What the feature enables, who uses it, and its boundary.

## Feature contract

- Durable capability or rule.
- Durable capability or rule.

## How it works

1. Entry point accepts the intent.
2. Authoritative state records it.
3. Runtime work produces the observable result.

## Architecture and ownership

Include only when the feature crosses meaningful runtime boundaries.

## Authorization and lifecycle

Include only when roles or state transitions matter.

## Failure and recovery

Include only when accepted work can fail asynchronously.

## Verification expectations

Name stable test ownership and remaining environment acceptance boundaries.

## Source map

- UI: `path`
- Contract: `path`
- Data: `path`
- Runtime: `path`
- Tests: `path`

## Related OpenStory pages

- [Related feature](./related-feature.stories.md) — relationship.
```

Remove every conditional heading that does not apply.

## Research basis

This standard combines:

- [Atlassian's product requirements guidance](https://www.atlassian.com/software/confluence/templates/product-requirements): purpose, actors, requirements, scope, and a single connected source of truth.
- [GitLab's documentation style guide](https://docs.gitlab.com/development/documentation/styleguide/) and [documentation workflow](https://docs.gitlab.com/development/documentation/workflow/): concise, searchable documentation maintained with the code change.
- [Diátaxis](https://diataxis.fr/): separate explanation/reference needs from tutorials and task-oriented how-to guides.
- [Google's developer documentation guidance](https://developers.google.com/style/highlights): direct language, descriptive headings and links, accessibility, and consistent terminology.
