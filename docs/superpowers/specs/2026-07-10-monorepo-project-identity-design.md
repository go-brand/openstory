# Monorepo-Aware Project Identity Design

**Date:** 2026-07-10
**Status:** Implemented

## Problem

OpenStory currently creates a `ProjectRecord` with `name: basename(path)`. That
makes the selected folder the runtime boundary, but it makes the project picker
ambiguous in monorepos. Every project selected from `apps/app` is displayed as
`app`, regardless of which repository owns it.

Package names do not solve this reliably. Workspace packages are commonly named
`app`, `web`, or `desktop`, and private monorepo root package names may be stale,
generic, or unrelated to the product name.

OpenStory needs a project identity that is useful to both humans and agents:

- Humans need a recognizable, collision-resistant label.
- Agents need the exact repository and workspace boundary they are operating in.
- Teams need optional identity metadata that travels with the codebase.
- Existing single-package and zero-config projects must keep working.

## Goals

1. Distinguish identically named workspaces across repositories without setup.
2. Treat a repository and an OpenStory workspace as separate concepts.
3. Keep the selected workspace folder as the Vite, config, story, and trust
   boundary.
4. Allow a repository root to discover multiple OpenStory workspaces.
5. Let teams override automatic labels through version-controlled OpenStory
   configuration.
6. Expose the same identity to the desktop UI, browser manager, and MCP agents.
7. Migrate existing persisted projects without losing selection or cache state.

## Non-goals

- Building a general-purpose package-manager or monorepo browser.
- Starting one Vite server for an entire monorepo.
- Changing component, documentation, selection, or preview semantics.
- Requiring Git, a remote, a package manifest, or explicit identity metadata.
- Adding local-only rename state in the first implementation.

## Considered approaches

### Local aliases only

Allow users to rename each saved item in the desktop app. This fixes the visual
collision, but aliases do not travel with the repository, do not help browser
mode, and are invisible to agents. It is insufficient as the identity model.

### Automatic repository and workspace labels only

Derive a repository label from Git and a workspace label from the selected
folder or package manifest. This provides a strong zero-config baseline, but it
cannot express product names such as `GoBrand` when the repository is named
`gb-monorepo`.

### Hybrid identity model

Derive repository/workspace identity automatically, allow optional config
overrides, group saved workspaces by repository, and expose the resolved identity
to agents. This is the selected approach because it is zero-config by default,
portable when customized, and precise at runtime.

## Terminology

- **Repository:** The nearest Git worktree root that contains the selected
  folder. If Git metadata is unavailable, the selected folder is the fallback
  repository boundary.
- **Workspace:** The folder OpenStory starts Vite from. It owns
  `openstory.config.*`, story discovery, docs, source reads, and the MCP server.
- **Project identity:** The resolved human and machine-readable description of
  one saved OpenStory workspace and its containing repository.

One repository may contain multiple OpenStory workspaces. A workspace belongs to
exactly one resolved repository boundary.

## Persisted model

Keep `ProjectRecord` as the compatibility name for this release, but add a
structured identity:

```ts
type ProjectIdentity = {
  repository: {
    label: string;
    slug: string | null;
    rootPath: string;
  };
  workspace: {
    label: string;
    relativePath: string;
    rootPath: string;
  };
  source: "automatic" | "config";
};

type ProjectRecord = {
  id: string;
  name: string;
  path: string;
  addedAt: string;
  identity: ProjectIdentity;
};
```

`path` remains the absolute workspace root and the security boundary. `id`
remains stable so existing selection and workspace-data caches survive migration.
`name` remains as a compatibility field and mirrors the resolved workspace
label; new UI and agent surfaces consume `identity`.

The Electron store backfills `identity` for existing records at startup. The
migration updates records in place and does not create new ids or change the
active project.

## Automatic identity resolution

Identity resolution runs in the Electron main process because it requires local
filesystem and Git access.

### Repository

1. Resolve the selected path to a canonical real path.
2. Ask Git for the containing worktree root using `execFile` with the selected
   path as `cwd`; never construct a shell command.
3. Read the `origin` remote when available and normalize common HTTPS, SSH, and
   local remote formats into an `owner/repository` slug.
4. Use the remote repository segment as the automatic label.
5. Fall back to the Git-root basename, then the selected-folder basename.

For example, `https://github.com/go-brand/gb-monorepo.git` resolves to slug
`go-brand/gb-monorepo` and label `gb-monorepo`.

### Workspace

1. Read the selected workspace's `package.json` when available.
2. Use its package name after stripping an npm scope.
3. Fall back to the selected-folder basename.
4. Store the POSIX-style path relative to the repository root; use `.` for a
   root workspace.

Generic workspace names such as `app` are acceptable because the UI pairs them
with repository identity. If two saved workspaces in the same repository resolve
to the same label, the UI uses their relative paths as the disambiguating label.

## Explicit identity metadata

Extend `OpenStoryConfig` with optional, display-only metadata:

```ts
export default defineOpenStoryConfig({
  identity: {
    repository: "GoBrand",
    workspace: "Web App",
  },
  components: [],
});
```

Both fields are optional. `repository` overrides only the repository label;
`workspace` overrides only the workspace label. Neither field may change root
paths, ids, file access, or any other trust boundary.

The Vite manifest response includes the resolved config identity alongside its
existing `components` and `docs`. When the selected Vite host becomes ready, the
desktop main process merges valid non-empty overrides into the automatic
identity, persists the record, and broadcasts the updated state. The automatic
label remains visible while Vite is starting or if config loading fails.

Browser-manager mode consumes the same manifest identity directly, so configured
labels remain consistent across desktop and browser surfaces.

## Monorepo-root discovery

The add flow accepts either a workspace folder or a repository root.

1. If the selected folder contains `openstory.config.ts` or
   `openstory.config.js`, add it as one workspace immediately.
2. Otherwise, inspect declared pnpm, npm, Yarn, and Bun workspace patterns below
   the selected repository root.
3. Keep candidate directories that contain an OpenStory config file. Ignore
   `node_modules`, VCS folders, build output, paths outside the selected root, and
   duplicate real paths.
4. With no candidates, preserve today's behavior and add the selected folder as
   a zero-config workspace.
5. With one candidate, add it directly.
6. With multiple candidates, show a focused workspace chooser. Candidates are
   selected by default; the user may uncheck any of them and confirms with
   `Add N workspaces`.

Adding multiple workspaces is one IPC operation so state is broadcast once. The
first newly added workspace becomes active; existing path-idempotency prevents
duplicates.

The discovery dialog is not a general filesystem browser. It shows only the
repository label, workspace label, relative path, and selection state.

## Picker design

The first titlebar control remains one project-context picker. It does not add a
second titlebar nesting level.

At wide widths the trigger renders:

```text
[GB] GoBrand · Web App  chevron  /  Design System
```

The middle dot joins repository and workspace inside one project identity. The
existing slash remains reserved for the transition from project identity to
working mode. At compact widths the trigger retains the repository monogram and
its full accessible label.

Automatic identity without overrides renders, for example:

```text
[GB] gb-monorepo · app  /  Design System
```

The menu groups workspaces by repository:

```text
GOBRAND                         go-brand/gb-monorepo
  Web App                       apps/app
  Admin                         apps/admin

OPENSTORY                       openstory
  Desktop                       apps/desktop
```

Each workspace row uses its resolved label as the primary text and its relative
path as secondary text. The active row retains selected semantics. The remove
action becomes `Remove workspace`, and the footer action becomes
`Add repository or workspace…`.

The command palette uses the same resolved project display name and searches the
repository label, repository slug, workspace label, and relative path. It calls
the entries `Switch project` instead of `Switch repo`.

The popup grows from 256px to a fixed 320px so repository, workspace, and path
context remain readable when the trigger collapses.

Accessible names always contain the full resolved identity, for example
`Switch project: GoBrand, Web App`. Repository group labels and workspace paths
are available to assistive technology without being repeated in every visible
label.

## Agent context

Add a read-only MCP tool named `get_project_context`. It returns the exact
workspace served by that MCP endpoint:

```json
{
  "displayName": "GoBrand · Web App",
  "repository": {
    "label": "GoBrand",
    "slug": "go-brand/gb-monorepo",
    "rootPath": "/repo"
  },
  "workspace": {
    "label": "Web App",
    "relativePath": "apps/app",
    "rootPath": "/repo/apps/app"
  }
}
```

This prevents an agent connected to several `app` workspaces from guessing which
one it is inspecting. The tool is descriptive and read-only; it grants no new
filesystem authority.

## Data flow

```text
folder selection
  -> main-process repository/workspace inspection
  -> zero, one, or many workspace candidates
  -> optional workspace chooser
  -> persist ProjectRecord identity
  -> select workspace and start Vite at ProjectRecord.path
  -> manifest returns optional config identity
  -> merge display overrides and broadcast state
  -> titlebar, grouped menu, browser manager, and MCP use resolved identity
```

## Error handling

- Git missing, a missing remote, or a non-Git folder falls back to filesystem
  names without blocking the add flow.
- Unreadable or malformed package/workspace manifests are skipped; selecting the
  exact workspace folder continues to work.
- Discovery never follows a candidate outside the selected repository root.
- Empty or non-string config identity fields are ignored at runtime.
- A config-load failure keeps automatic identity and follows the existing Vite
  error path.
- A moved or deleted workspace remains removable from the picker and does not
  corrupt other records.
- Canonical real paths prevent the same workspace from being added through
  symlink and non-symlink paths.

## Testing

### Identity resolution

- GitHub HTTPS, SSH, generic SSH, local, missing-remote, and non-Git fallbacks.
- Scoped and unscoped package names, missing package manifests, root workspaces,
  and Windows/POSIX relative-path normalization.
- Same workspace label across different repositories and duplicate labels inside
  one repository.

### Discovery and persistence

- pnpm and package-json workspace patterns.
- ignored directories, out-of-root patterns, symlink duplicates, zero/one/many
  candidates, add-many idempotency, and existing-record migration.
- No selection-id or workspace-cache changes during identity backfill.

### Config, plugin, and agents

- `OpenStoryConfig.identity` type and manifest serialization.
- Automatic fallback before config load and persisted override after load.
- `get_project_context` output and read-only MCP registration.

### UI

- Grouping and ordering by repository and workspace.
- `repository · workspace` trigger label, relative-path secondary text, collision
  disambiguation, selected semantics, remove behavior, and accessible names.
- Existing responsive trigger behavior and fixed popup width at wide, medium,
  and 720px Electron widths.
- Workspace chooser keyboard behavior and multi-select confirmation.

### Completion gates

Run `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build`, followed by a
built Electron smoke check covering an existing migrated project, a directly
selected workspace, a discovered monorepo root, duplicate `app` workspaces, and
compact titlebar presentation.

## Rollout

This is an additive persisted-state migration. Existing project ids, paths,
selection, and workspace cache keys remain stable. The main process persists the
identity backfill before broadcasting its first complete state, so the renderer
continues to receive one complete `ProjectRecord` contract.

No config change is required. Teams may add explicit identity metadata when the
automatic repository or workspace labels are not the names humans use.
