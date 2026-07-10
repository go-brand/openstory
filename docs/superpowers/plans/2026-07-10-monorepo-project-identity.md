# Monorepo Project Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every saved OpenStory workspace a collision-resistant repository/workspace identity, discover OpenStory workspaces from monorepo roots, present them coherently to humans, and expose the same context to MCP agents.

**Architecture:** `@gobrand/openstory-config` owns the browser-safe identity configuration and data types. A Node-only identity resolver exported from `@gobrand/openstory-vite/project-identity` supplies the canonical automatic identity to both Electron and the Vite manifest. Electron persists that identity, discovers workspace candidates, and exposes batch-add IPC; the renderer consumes one complete contract for the grouped picker, discovery dialog, titlebar, and command palette. MCP reads the identity embedded in the same manifest as components and docs.

**Tech Stack:** TypeScript 5.9, Node.js filesystem/path/child-process APIs, React 19, Electron 38, Base UI, Tailwind CSS 4, Vite 8, MCP SDK 1.29, Vitest 4, tinyglobby, yaml.

## Global Constraints

- Keep `ProjectRecord.path` as the Vite/config/story/source trust boundary.
- Preserve existing project ids, active selection, and workspace-cache keys during migration.
- Git and package metadata are optional; all failures fall back to filesystem names.
- Never construct a shell command. Invoke Git with `execFileSync` and a trusted `cwd`.
- Config identity changes display labels only and never change paths, ids, or file authority.
- Treat an OpenStory workspace as the runnable unit and a repository as its grouping context.
- Use `repository · workspace / mode` in the titlebar; the slash remains reserved for working mode.
- Keep the project menu fixed at 320px in both expanded and compact titlebar states.
- Work in the current dirty `staging` checkout without staging or committing any files.

---

### Task 1: Shared identity contract, automatic resolver, and persisted migration

**Files:**

- Create: `packages/config/src/identity.ts`
- Create: `packages/vite-plugin/src/project-identity.ts`
- Create: `packages/vite-plugin/src/project-identity.test.ts`
- Modify: `packages/config/src/define.ts`
- Modify: `packages/config/src/index.ts`
- Modify: `packages/config/src/define.test.ts`
- Modify: `packages/vite-plugin/package.json`
- Modify: `apps/desktop/electron/types.ts`
- Modify: `apps/desktop/electron/store.ts`
- Create: `apps/desktop/electron/project-records.ts`
- Create: `apps/desktop/electron/project-records.test.ts`
- Modify: `apps/desktop/electron/workspace-cache.test.ts`
- Modify: `apps/desktop/src/components/titlebar.test.ts`

**Interfaces:**

- Produces `OpenStoryIdentityConfig`, `ProjectIdentity`, and `formatProjectIdentity(identity)` from `@gobrand/openstory-config`.
- Produces `resolveProjectIdentity(workspaceRoot, override?)` and `normalizeGitRemote(remote)` from `@gobrand/openstory-vite/project-identity`.
- Produces `createProjectRecord(path, now?, id?)` and `backfillProjectRecords(records)` in Electron.
- Changes `ProjectRecord.identity` from nonexistent to required after store hydration.

- [x] **Step 1: Add failing config and identity-resolver tests**

Add a config type fixture that accepts:

```ts
defineOpenStoryConfig({
  identity: { repository: "GoBrand", workspace: "Web App" },
  components: [],
});
```

Create resolver tests covering remote normalization and automatic/config labels:

```ts
expect(normalizeGitRemote("https://github.com/go-brand/gb-monorepo.git")).toBe(
  "go-brand/gb-monorepo",
);
expect(normalizeGitRemote("git@github.com:go-brand/gb-monorepo.git")).toBe("go-brand/gb-monorepo");

const identity = resolveProjectIdentity(workspaceRoot, {
  repository: "GoBrand",
  workspace: "Web App",
});
expect(identity.repository.label).toBe("GoBrand");
expect(identity.workspace.label).toBe("Web App");
expect(identity.workspace.relativePath).toBe("apps/app");
expect(identity.workspace.rootPath).toBe(workspaceRoot);
expect(identity.source).toBe("config");
```

Use temporary Git repositories created with `mkdtempSync`, `mkdirSync`, `writeFileSync`, and `execFileSync("git", gitArgs)`; clean them with `rmSync(root, { recursive: true, force: true })` in `afterEach`.

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```bash
pnpm -F @gobrand/openstory-config exec vitest run src/define.test.ts
pnpm -F @gobrand/openstory-vite exec vitest run src/project-identity.test.ts
```

Expected: config test fails because `identity` is not in `OpenStoryConfig`; resolver test fails because the module does not exist.

- [x] **Step 3: Add the browser-safe identity contract**

Create `packages/config/src/identity.ts` with:

```ts
export type OpenStoryIdentityConfig = {
  repository?: string;
  workspace?: string;
};

export type ProjectIdentity = {
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

export function formatProjectIdentity(identity: ProjectIdentity): string {
  const { repository, workspace } = identity;
  if (workspace.relativePath === "." && repository.label === workspace.label) {
    return repository.label;
  }
  return `${repository.label} · ${workspace.label}`;
}
```

Add `identity?: OpenStoryIdentityConfig` to `OpenStoryConfig`, export all three symbols from `packages/config/src/index.ts`, and ignore blank override strings at resolution time.

- [x] **Step 4: Implement the Node identity resolver**

Create `packages/vite-plugin/src/project-identity.ts` with focused helpers:

```ts
export function normalizeGitRemote(remote: string): string | null;
export function resolveProjectIdentity(
  workspaceRoot: string,
  override?: OpenStoryIdentityConfig | null,
): ProjectIdentity;
```

Implementation requirements:

- Canonicalize the workspace with `realpathSync.native`, falling back to `resolve`.
- Run `git rev-parse --show-toplevel` and `git remote get-url origin` with `execFileSync` and `cwd: workspaceRoot`.
- Normalize `https://host/owner/repo.git`, `ssh://git@host/owner/repo.git`, and `git@host:owner/repo.git` to `owner/repo`.
- Fall back to the Git-root basename and then workspace basename.
- Read `package.json`, strip npm scope from `name`, and fall back to workspace basename.
- Convert `relative(repositoryRoot, workspaceRoot)` separators to `/`; use `.` at the root.
- Apply trimmed non-empty config labels last and set `source: "config"` when either applies.

Add a package export:

```json
"./project-identity": {
  "types": "./dist/project-identity.d.ts",
  "import": "./dist/project-identity.js"
}
```

- [x] **Step 5: Add failing ProjectRecord migration tests**

Create `apps/desktop/electron/project-records.test.ts`:

```ts
it("creates a record with canonical identity", () => {
  const record = createProjectRecord(workspaceRoot, "2026-07-10", "fixed-id");
  expect(record.id).toBe("fixed-id");
  expect(record.path).toBe(record.identity.workspace.rootPath);
  expect(record.name).toBe(record.identity.workspace.label);
});

it("backfills identity without changing ids or paths", () => {
  const [record] = backfillProjectRecords([
    { id: "saved", name: "app", path: workspaceRoot, addedAt: "then" },
  ]);
  expect(record.id).toBe("saved");
  expect(record.addedAt).toBe("then");
  expect(record.identity.repository.label).toBeTruthy();
});
```

- [x] **Step 6: Implement ProjectRecord creation and migration**

Create `apps/desktop/electron/project-records.ts`:

```ts
export type LegacyProjectRecord = Omit<ProjectRecord, "identity"> & {
  identity?: ProjectIdentity;
};

export function createProjectRecord(
  path: string,
  addedAt = new Date().toISOString(),
  id = randomUUID(),
): ProjectRecord;

export function backfillProjectRecords(records: LegacyProjectRecord[]): ProjectRecord[];
```

`createProjectRecord` resolves identity once, uses the canonical workspace root as `path`, and mirrors `identity.workspace.label` into `name`. `backfillProjectRecords` preserves a complete existing identity; otherwise it resolves one without changing `id` or `addedAt`.

Change the persisted store's internal project type to `LegacyProjectRecord[]`, backfill once in the `AppStore` constructor, and expose `ProjectRecord[]` after hydration. Update existing test fixtures to include complete identities through one local helper instead of repeated object literals.

- [x] **Step 7: Run Task 1 verification**

Run:

```bash
pnpm -F @gobrand/openstory-config test
pnpm -F @gobrand/openstory-vite exec vitest run src/project-identity.test.ts
pnpm -F openstory-desktop exec vitest run electron/project-records.test.ts electron/workspace-cache.test.ts src/components/titlebar.test.ts
pnpm -F @gobrand/openstory-config typecheck
pnpm -F @gobrand/openstory-vite typecheck
pnpm -F openstory-desktop typecheck
```

Expected: all focused tests and package typechecks pass.

### Task 2: Manifest identity, persisted config overrides, and MCP project context

**Files:**

- Modify: `packages/vite-plugin/src/assemble-manifest.ts`
- Modify: `packages/vite-plugin/src/plugin.test.ts`
- Modify: `packages/vite-plugin/src/mcp-server.ts`
- Modify: `packages/vite-plugin/src/mcp-server.test.ts`
- Modify: `apps/desktop/electron/ipc.ts`
- Modify: `apps/desktop/electron/store.ts`
- Modify: `apps/desktop/electron/types.ts`
- Modify: `apps/desktop/electron/selection.test.ts`
- Modify: `apps/desktop/electron/vite-host.test.ts`

**Interfaces:**

- `Manifest.identity` is a required `ProjectIdentity` resolved from `projectRoot` and `config.identity`.
- `AppStore.updateProjectIdentity(id, identity)` persists labels without changing the project id/path.
- MCP registers `get_project_context` and returns manifest identity plus the exact workspace root.

- [x] **Step 1: Add failing manifest identity tests**

Extend `plugin.test.ts` or `assemble-manifest.test.ts`:

```ts
const manifest = buildManifest(
  { identity: { repository: "GoBrand", workspace: "Web App" }, components: [] },
  workspaceRoot,
);
expect(manifest.identity.repository.label).toBe("GoBrand");
expect(manifest.identity.workspace.label).toBe("Web App");
```

Add an `assembleManifest` test proving config overrides survive SSR config loading.

- [x] **Step 2: Run the manifest test and verify RED**

Run:

```bash
pnpm -F @gobrand/openstory-vite exec vitest run src/plugin.test.ts src/assemble-manifest.test.ts
```

Expected: failure because manifests do not expose `identity`.

- [x] **Step 3: Resolve identity in the manifest contract**

In `buildManifest`, add:

```ts
identity: resolveProjectIdentity(projectRoot ?? process.cwd(), config.identity),
```

Keep `schemaVersion: 1` because this is an additive field. `assembleManifest` already passes the loaded config into `buildManifest`, so HMR-driven manifest refreshes pick up identity changes automatically.

- [x] **Step 4: Add failing desktop identity-refresh and MCP tests**

Add an MCP tool test:

```ts
const result = await buildMcpTools(makeCtx()).get_project_context.handler({});
expect(result).toEqual({
  displayName: "GoBrand · Web App",
  repository: manifest.identity.repository,
  workspace: manifest.identity.workspace,
});
```

Change the round-trip tool count expectation from eight to nine and include `get_project_context`.

Add a pure store test for `updateProjectIdentity` or extract a helper proving it preserves id/path and mirrors the workspace label into `name`.

- [x] **Step 5: Persist manifest identity and expose MCP context**

Add to `buildMcpTools`:

```ts
get_project_context: {
  description:
    "Identify the exact repository and workspace served by this OpenStory MCP endpoint.",
  inputSchema: {},
  handler: async () => {
    const { identity } = await ctx.getManifest();
    return {
      displayName: formatProjectIdentity(identity),
      repository: identity.repository,
      workspace: identity.workspace,
    };
  },
},
```

Add `AppStore.updateProjectIdentity(id, identity)`. In `fetchManifest`, parse `identity`, update only the active project when the manifest workspace root matches `project.path`, and then cache workspace data. Invalid or absent identity falls back to the persisted automatic identity.

- [x] **Step 6: Run Task 2 verification**

Run:

```bash
pnpm -F @gobrand/openstory-vite exec vitest run src/assemble-manifest.test.ts src/plugin.test.ts src/mcp-server.test.ts
pnpm -F openstory-desktop exec vitest run electron/project-records.test.ts electron/selection.test.ts electron/vite-host.test.ts
pnpm -F @gobrand/openstory-vite typecheck
pnpm -F openstory-desktop typecheck
```

Expected: manifest, MCP, desktop tests, and both typechecks pass.

### Task 3: Monorepo workspace discovery and batch-add IPC

**Files:**

- Modify: `apps/desktop/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/desktop/electron/workspace-discovery.ts`
- Create: `apps/desktop/electron/workspace-discovery.test.ts`
- Modify: `apps/desktop/electron/types.ts`
- Modify: `apps/desktop/electron/store.ts`
- Modify: `apps/desktop/electron/ipc.ts`
- Create: `apps/desktop/electron/ipc-projects.test.ts`

**Interfaces:**

- Produces `WorkspaceCandidate` and `WorkspaceInspection` renderer-safe types.
- Produces `inspectWorkspaceSelection(selectedPath): Promise<WorkspaceInspection>`.
- Adds IPC `project:inspectPath(path)` and `project:addMany(paths)` while keeping `project:add(path)` compatible.

- [x] **Step 1: Install direct discovery dependencies**

Run:

```bash
pnpm --filter openstory-desktop add tinyglobby yaml
```

Expected: `apps/desktop/package.json` and `pnpm-lock.yaml` add direct runtime dependencies.

- [x] **Step 2: Write failing discovery tests**

Build temporary fixtures for:

```text
repo/
  pnpm-workspace.yaml       packages: ["apps/*", "packages/*"]
  package.json
  apps/app/openstory.config.ts
  apps/admin/openstory.config.js
  packages/ui/package.json
  node_modules/ignored/openstory.config.ts
```

Assert:

```ts
const result = await inspectWorkspaceSelection(repo);
expect(result.candidates.map((candidate) => candidate.identity.workspace.relativePath)).toEqual([
  "apps/admin",
  "apps/app",
]);
```

Also cover an exact configured workspace, package-json `workspaces` array and object forms, zero-config fallback, out-of-root patterns, and canonical-path deduplication.

- [x] **Step 3: Run discovery tests and verify RED**

Run:

```bash
pnpm -F openstory-desktop exec vitest run electron/workspace-discovery.test.ts
```

Expected: failure because the discovery module does not exist.

- [x] **Step 4: Implement bounded workspace discovery**

Create:

```ts
export type WorkspaceCandidate = {
  path: string;
  identity: ProjectIdentity;
};

export type WorkspaceInspection = {
  repository: ProjectIdentity["repository"];
  candidates: WorkspaceCandidate[];
};

export async function inspectWorkspaceSelection(selectedPath: string): Promise<WorkspaceInspection>;
```

Implementation order:

1. Canonicalize the selected path and resolve its automatic identity.
2. Return it directly if it contains `openstory.config.ts` or `.js`.
3. Read `pnpm-workspace.yaml` `packages` and package-json `workspaces` array or `{ packages }`.
4. Expand only those patterns with `tinyglobby`, `cwd: selectedPath`, `absolute: true`, `onlyDirectories: true`, and ignores for VCS, dependencies, and build output.
5. Reject candidates whose canonical real path is outside `selectedPath`.
6. Keep candidates with an OpenStory config, dedupe by canonical path, resolve identity, and sort by relative path.
7. Fall back to the selected path when discovery returns none.

- [x] **Step 5: Add failing store and IPC contract tests**

Test `addProjects` idempotency:

```ts
const records = addProjectRecords(existing, [appPath, adminPath], () => "now");
expect(records.projects).toHaveLength(2);
expect(records.added).toHaveLength(2);
expect(addProjectRecords(records.projects, [appPath], () => "later").projects).toHaveLength(2);
```

Test IPC handlers through extracted project-handler functions rather than booting Electron. Verify `project:addMany` returns records in requested order and causes one state broadcast.

- [x] **Step 6: Implement batch-add IPC**

Add:

```ts
"project:inspectPath": (path: string) => WorkspaceInspection;
"project:addMany": (paths: string[]) => ProjectRecord[];
```

Keep `project:add` as a one-path wrapper over the same record creation. Add `AppStore.addProjects(records)` so one store write handles a batch and returns existing records for already-saved canonical paths. Broadcast only after the batch is persisted.

- [x] **Step 7: Run Task 3 verification**

Run:

```bash
pnpm -F openstory-desktop exec vitest run electron/workspace-discovery.test.ts electron/ipc-projects.test.ts electron/project-records.test.ts
pnpm -F openstory-desktop typecheck
```

Expected: discovery, batch persistence, IPC contract tests, and desktop typecheck pass.

### Task 4: Grouped project picker, discovery dialog, and command-palette identity

**Files:**

- Create: `apps/desktop/src/lib/project-identity.ts`
- Create: `apps/desktop/src/lib/project-identity.test.ts`
- Create: `apps/desktop/src/components/workspace-discovery-dialog.tsx`
- Create: `apps/desktop/src/components/workspace-discovery-dialog.test.ts`
- Modify: `apps/desktop/src/components/repo-switcher.tsx`
- Create: `apps/desktop/src/components/repo-switcher.test.ts`
- Modify: `apps/desktop/src/components/titlebar.test.ts`
- Modify: `apps/desktop/src/components/command-palette.tsx`
- Create: `apps/desktop/src/components/command-palette.test.ts`
- Modify: `apps/desktop/src/lib/icons.ts`

**Interfaces:**

- Produces `projectDisplayName(project, projects)` with within-repository collision disambiguation.
- Produces `groupProjectsByRepository(projects)` in deterministic label/path order.
- `WorkspaceDiscoveryDialog` consumes one `WorkspaceInspection` and confirms selected paths.
- `RepoSwitcher` performs inspect → direct add or chooser → batch add → select.

- [x] **Step 1: Add failing project-label and grouping tests**

Cover:

```ts
expect(projectDisplayName(goBrandApp, [goBrandApp, openStoryApp])).toBe("gb-monorepo · app");
expect(projectDisplayName(firstApp, [firstApp, secondApp])).toBe("gb-monorepo · apps/app");
expect(groupProjectsByRepository(projects).map((group) => group.label)).toEqual([
  "GoBrand",
  "OpenStory",
]);
```

The collision case uses two workspaces in the same repository with label `app` and different relative paths.

- [x] **Step 2: Run label tests and verify RED**

Run:

```bash
pnpm -F openstory-desktop exec vitest run src/lib/project-identity.test.ts
```

Expected: failure because the renderer helper does not exist.

- [x] **Step 3: Implement pure renderer identity helpers**

Create:

```ts
export function projectDisplayName(project: ProjectRecord, allProjects: ProjectRecord[]): string;

export function projectAccessibleName(project: ProjectRecord, allProjects: ProjectRecord[]): string;

export function groupProjectsByRepository(projects: ProjectRecord[]): Array<{
  key: string;
  label: string;
  slug: string | null;
  projects: ProjectRecord[];
}>;
```

Group by canonical repository root, sort groups by label then root, and sort workspaces by label then relative path. Use `repository · workspace` normally and `repository · relative/path` only for a within-repository label collision.

- [x] **Step 4: Add failing discovery-dialog and picker markup tests**

Render the dialog to static markup and assert repository label, both workspace labels/paths, checked inputs, and `Add 2 workspaces` copy. Render `RepoSwitcher` with multiple repositories and assert:

- Full trigger accessible name includes repository and workspace.
- Repository group labels precede their workspace rows.
- Relative paths are visible.
- `Remove workspace` and `Add repository or workspace…` replace repository-only copy.
- Popup class contains `w-80`.

- [x] **Step 5: Implement the workspace discovery dialog**

Use Base UI's Dialog primitives with controlled `open`, an accessible title
`Choose OpenStory workspaces`, native checkbox inputs for candidates, Cancel, and
the confirmation label `Add N workspaces`. Reset selection to all candidate paths
whenever a new inspection opens. Disable confirmation when none are selected.

The public props are:

```ts
type WorkspaceDiscoveryDialogProps = {
  inspection: WorkspaceInspection | null;
  onCancel: () => void;
  onConfirm: (paths: string[]) => void;
};
```

- [x] **Step 6: Rebuild the picker around project identity**

Change the trigger to use the repository monogram and a `max-w-[210px]` visible
`projectDisplayName`; keep the current 960px icon-only breakpoint. Change the
popup to `w-80` and render repository groups with visible labels and optional
slugs. Each workspace row shows its resolved/disambiguated workspace label and
relative path on two lines.

Implement the add flow:

```ts
const path = await api.invoke("project:pickFolder");
if (!path) return;
const inspection = await api.invoke("project:inspectPath", path);
if (inspection.candidates.length === 1) {
  await addAndSelect([inspection.candidates[0].path]);
} else {
  setInspection(inspection);
}
```

`addAndSelect` invokes `project:addMany`, marks the first record's workspace load,
selects it, and closes the chooser. Render `WorkspaceDiscoveryDialog` beside the
menu root so it survives menu dismissal.

- [x] **Step 7: Update command-palette identity**

Use `projectDisplayName` for project entries and fuzzy-search this combined text:

```ts
[
  identity.repository.label,
  identity.repository.slug,
  identity.workspace.label,
  identity.workspace.relativePath,
]
  .filter(Boolean)
  .join(" ");
```

Change the item metadata from `Switch repo` to `Switch project` and add a focused
static/render-helper test proving two `app` workspaces remain distinguishable.

- [x] **Step 8: Run Task 4 verification**

Run:

```bash
pnpm -F openstory-desktop exec vitest run src/lib/project-identity.test.ts src/components/workspace-discovery-dialog.test.ts src/components/repo-switcher.test.ts src/components/titlebar.test.ts src/components/command-palette.test.ts
pnpm -F openstory-desktop typecheck
```

Expected: all identity UI tests and desktop typecheck pass.

### Task 5: Documentation, full gates, Electron smoke, and review

**Files:**

- Modify: `docs/superpowers/specs/2026-07-10-monorepo-project-identity-design.md`
- Modify: `docs/superpowers/plans/2026-07-10-monorepo-project-identity.md`
- Temporary only: `apps/desktop/.project-identity-smoke.mjs` (delete before completion)
- Evidence: `.superpowers/sdd/project-identity-wide.png`
- Evidence: `.superpowers/sdd/project-identity-narrow.png`

**Interfaces:**

- No new production interface; this task proves the prior four tasks satisfy the approved design.

- [x] **Step 1: Mark the design and plan implementation state**

Change the design status from `Proposed` to `Implemented`. Check every completed
plan checkbox only after its corresponding verification command has passed.

- [x] **Step 2: Run format, lint, and diff hygiene on touched files**

Run `pnpm exec oxfmt --write` over every touched TypeScript, TSX, JSON, and Markdown
file, then:

```bash
pnpm exec oxlint \
  packages/config/src/identity.ts \
  packages/vite-plugin/src/project-identity.ts \
  apps/desktop/electron/project-records.ts \
  apps/desktop/electron/workspace-discovery.ts \
  apps/desktop/src/lib/project-identity.ts \
  apps/desktop/src/components/workspace-discovery-dialog.tsx \
  apps/desktop/src/components/repo-switcher.tsx \
  apps/desktop/src/components/command-palette.tsx
git diff --check
```

Expected: zero warnings/errors and no whitespace errors.

- [x] **Step 3: Run full repository gates**

Run separately and require exit code 0 from each:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

Expected: every Turbo task succeeds.

- [x] **Step 4: Run built Electron smoke verification**

Use Playwright's Electron launcher against `apps/desktop/out/main/main.js`. Seed or
add two projects whose workspace label is `app` but whose repository labels differ.
Verify:

- Wide titlebar shows `repository · workspace / Design System`.
- Menu groups the two workspaces under distinct repository headers and shows their relative paths.
- The menu is 320px wide.
- At 720px the project and mode controls are icon-only with unchanged accessible names.
- Search and right-side controls do not overlap either left state.
- Settings remains immediately before Inspector.

Save screenshots to the two evidence paths and restore the original Electron
window bounds in `finally`.

- [x] **Step 5: Request focused code review**

Review the identity contract, Git/path fallbacks, migration, manifest/MCP
integration, discovery trust boundary, grouped UI, accessibility, tests, and
responsive smoke evidence. Fix every Critical and Important issue, evaluate Minor
issues, rerun the affected focused tests, and finish with `git diff --check`.

- [x] **Step 6: Confirm checkout hygiene**

Verify the temporary smoke harness is deleted, no files are staged, unrelated
dirty-tree changes remain untouched, and all new identity files are present.
