# Next.js App Router and Turbopack Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a native Next.js 16 App Router adapter that compiles OpenStory's client-compatible stories through the consumer's Turbopack runtime while preserving the existing harness, manifest, MCP, and desktop contracts.

**Architecture:** Extract builder-independent Node services from the Vite package, expose the runtime as a reusable React component, and create `@gobrand/openstory-next`. The Next adapter generates a cache-only App Router application with static client/server story registries, starts it through Next's custom development server, and is selected by a generalized desktop preview-server controller.

**Tech Stack:** TypeScript 5.9, React 19.2, Next.js 16.2.10, Turbopack, Node.js 22+, Electron, Vitest 4, MCP SDK 1.29, pnpm/Turborepo.

## Global Constraints

- Support Next.js `>=16 <17`, App Router, Turbopack, React 19, and client-compatible stories only.
- Do not support Pages Router, webpack mode, React Server Components, Server Actions, or production harness export in v1.
- Render through the consumer's installed Next.js and Turbopack; do not start Vite for Next projects.
- Write generated files only under `<project>/.openstory/cache/next/<project-hash>`.
- Never modify tracked consumer source/configuration and never install dependencies automatically.
- Preserve `/__pl__/`, `/__pl__/manifest.json`, `/__pl__/mcp`, and the existing manifest schema.
- Keep existing Vite behavior and public exports backward-compatible.
- Bind generated servers to `127.0.0.1` and preserve source-read/project-root guards.
- Every behavior change follows red-green TDD and each task ends in a focused commit.

---

### Task 1: Extract builder-independent Node services

**Files:**

- Create: `packages/node/package.json`
- Create: `packages/node/tsconfig.json`
- Create: `packages/node/README.md`
- Create: `packages/node/LICENSE`
- Move: builder-independent modules from `packages/vite-plugin/src/` into `packages/node/src/`
- Create: `packages/node/src/index.ts`
- Create: `packages/node/src/assemble-manifest.test.ts`
- Modify: `packages/vite-plugin/package.json`
- Modify: `packages/vite-plugin/src/*.ts` imports and public compatibility re-exports

**Interfaces:**

- Produces: `buildManifest(config, projectRoot?, docs?)` and `Manifest`.
- Produces: `assembleLoadedManifest({ projectRoot, loaded, readFile })`.
- Produces: discovery, docs, identity, Git, prop-type, doc-sync, and MCP helpers currently imported inside the Vite package.
- Preserves: `buildManifest` re-export from `packages/vite-plugin/src/plugin.ts` and `@gobrand/openstory-vite/project-identity`.

- [ ] **Step 1: Write the failing loaded-manifest test**

Create `packages/node/src/assemble-manifest.test.ts` with a loaded config and
component whose fixture, source path, docs embed, identity, and controls are
asserted through this API:

```ts
const manifest = assembleLoadedManifest({
  projectRoot: "/repo/apps/web",
  loaded: { config: defineOpenStoryConfig({ components: [] }), components: [button] },
  readFile: () => "# Button",
});
expect(manifest.schemaVersion).toBe(1);
expect(manifest.components[0]?.id).toBe("button");
```

- [ ] **Step 2: Run the test and confirm red**

Run: `pnpm --filter @gobrand/openstory-node test`
Expected: fail because the package and `assembleLoadedManifest` do not exist.

- [ ] **Step 3: Create the package and move code without semantic changes**

Use the same `tsconfig` shape as `packages/vite-plugin`. The package exports
`./project-identity` as a public subpath and declares dependencies on
`@gobrand/openstory-config`, `@modelcontextprotocol/sdk`, and `marked`. Move
`assemble-manifest`, discovery/docs, identity, prop types, doc links/sync,
changed stories, section derivation, and MCP server modules with their tests.

- [ ] **Step 4: Split loading from shaping**

Implement:

```ts
export type LoadedProject = {
  config: OpenStoryConfig | null;
  components: RegisteredComponent[];
};

export function assembleLoadedManifest({
  projectRoot,
  loaded,
  readFile,
}: {
  projectRoot: string;
  loaded: LoadedProject;
  readFile: (path: string) => string;
}): Manifest;
```

The existing Vite `assembleManifest` continues to load config/story modules with
`ssrLoadModule`, then delegates to `assembleLoadedManifest`.

- [ ] **Step 5: Rewire Vite imports and retain compatibility exports**

Add `@gobrand/openstory-node: workspace:^` to the Vite package, re-export
`buildManifest` from `plugin.ts`, and point the `./project-identity` export at a
small source shim that re-exports the Node implementation.

- [ ] **Step 6: Verify Node and Vite packages**

Run:

```bash
pnpm --filter @gobrand/openstory-node test
pnpm --filter @gobrand/openstory-node typecheck
pnpm --filter @gobrand/openstory-vite test
pnpm --filter @gobrand/openstory-vite typecheck
```

Expected: all existing and new tests pass with unchanged Vite manifest fixtures.

- [ ] **Step 7: Commit**

```bash
git add packages/node packages/vite-plugin pnpm-lock.yaml
git commit -m "refactor: extract OpenStory Node core"
```

### Task 2: Export the shared React preview component

**Files:**

- Modify: `packages/runtime/src/preview-host.tsx`
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/runtime/src/preview-host.test.tsx`

**Interfaces:**

- Produces: `OpenStoryPreview({ config }: { config: OpenStoryConfig })`.
- Preserves: `mountPreviewHost(target, config)` as a wrapper around the component.

- [ ] **Step 1: Write the failing direct-render parity test**

Render `<OpenStoryPreview config={config} />` with React DOM in jsdom, send the
same `pl:render` message used by `mountPreviewHost`, and assert identical story
content and `pl:ready`/`pl:size` behavior.

- [ ] **Step 2: Confirm red**

Run: `pnpm --filter @gobrand/openstory-runtime exec vitest run src/preview-host.test.tsx`
Expected: fail because `OpenStoryPreview` is not exported.

- [ ] **Step 3: Extract the component**

Move the hook-bearing application body currently created inside
`mountPreviewHost` to:

```tsx
export function OpenStoryPreview({ config }: { config: OpenStoryConfig }) {
  return <PreviewHost config={config} />;
}

export function mountPreviewHost(target: HTMLElement, config: OpenStoryConfig) {
  createRoot(target).render(<OpenStoryPreview config={config} />);
}
```

Keep the existing bridge and renderer implementation single-sourced.

- [ ] **Step 4: Verify runtime and Vite harness tests**

Run:

```bash
pnpm --filter @gobrand/openstory-runtime test
pnpm --filter @gobrand/openstory-runtime typecheck
pnpm --filter @gobrand/openstory-vite test
```

- [ ] **Step 5: Commit**

```bash
git add packages/runtime
git commit -m "refactor: export shared preview component"
```

### Task 3: Generate deterministic Next story registries

**Files:**

- Create: `packages/next/package.json`
- Create: `packages/next/tsconfig.json`
- Create: `packages/next/README.md`
- Create: `packages/next/LICENSE`
- Create: `packages/next/src/index.ts`
- Create: `packages/next/src/project.ts`
- Create: `packages/next/src/registry.ts`
- Create: `packages/next/src/registry.test.ts`
- Create: `packages/next/src/cache.ts`
- Create: `packages/next/src/cache.test.ts`

**Interfaces:**

- Produces: `inspectNextProject(root): NextProjectInspection`.
- Produces: `generateRegistries({ projectRoot, cacheRoot, configPath, storyFiles })`.
- Produces: `resolveNextCacheRoot(projectRoot)` and containment guards.

- [ ] **Step 1: Write failing inspection and registry tests**

Cover Next version `<16`, missing App Router, `app/` and `src/app/`, missing
adapter dependency, deterministic POSIX ordering, Windows path escaping,
duplicate imports, and a realpath escape. Assert generated client code begins
with `"use client"` and generated server code has no client directive.

- [ ] **Step 2: Confirm red**

Run: `pnpm --filter @gobrand/openstory-next test`
Expected: fail because the adapter package does not exist.

- [ ] **Step 3: Create package metadata**

Declare `next: ">=16 <17"`, `react: "^19"`, and `react-dom: "^19"` as peers;
workspace dependencies on config/runtime/node; `chokidar: "^4.0.3"` as a runtime
dependency; Next `16.2.10` and React `19.2.3` as development dependencies; and:

```json
"bin": { "openstory-next": "./dist/cli.js" }
```

- [ ] **Step 4: Implement inspection and cache containment**

Resolve packages from the consumer root with `createRequire`, parse Next's major
version, locate `app/` or `src/app/`, and return typed errors with remediation.
Build the cache at `.openstory/cache/next/<stable-project-hash>` and
reject discovered realpaths outside the project/workspace roots.

- [ ] **Step 5: Implement atomic dual registries**

Generate static imports named `story0`, `story1`, etc. The client registry merges
validated modules/config and exports a Client Component rendering
`OpenStoryPreview`. The server registry exports `loadedProject` for the manifest
route. Write only when content changes, using sibling temporary files and rename.

- [ ] **Step 6: Verify adapter generator tests**

Run:

```bash
pnpm install
pnpm --filter @gobrand/openstory-next test
pnpm --filter @gobrand/openstory-next typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/next pnpm-lock.yaml
git commit -m "feat: generate Next story registries"
```

### Task 4: Generate and run the shadow App Router application

**Files:**

- Create: `packages/next/src/shadow-app.ts`
- Create: `packages/next/src/shadow-app.test.ts`
- Create: `packages/next/src/next-config.ts`
- Create: `packages/next/src/next-config.test.ts`
- Create: `packages/next/src/server.ts`
- Create: `packages/next/src/server.test.ts`
- Create: `packages/next/src/cli.ts`
- Create: `packages/next/src/protocol.ts`
- Create: `packages/next/src/protocol.test.ts`

**Interfaces:**

- Produces: `generateShadowApp(options): Promise<GeneratedNextApp>`.
- Produces: `startNextPreview(options): Promise<NextPreviewServer>`.
- Produces stdout events `{"type":"ready","adapter":"next","port":number}`,
  `{"type":"manifest-changed","adapter":"next"}`, and
  `{"type":"error","adapter":"next","message":string}`.

- [ ] **Step 1: Write failing shadow-config tests**

Assert exact generated files for absent/object/function/async consumer Next
configs, `turbopack.root`, isolated `distDir`, TypeScript extension, PostCSS
delegation, explicit/detected style imports, and preserved image/alias options.

- [ ] **Step 2: Write failing lifecycle/protocol tests**

Inject a fake Next factory and HTTP server. Assert loopback + ephemeral port,
request delegation, MCP interception, one ready event, structured pre-ready
errors, and idempotent SIGTERM/close cleanup.

- [ ] **Step 3: Confirm red**

Run: `pnpm --filter @gobrand/openstory-next exec vitest run src/shadow-app.test.ts src/server.test.ts src/protocol.test.ts`
Expected: fail because generators/server do not exist.

- [ ] **Step 4: Generate the App Router files**

Generate `app/layout.tsx`, `app/%5F_pl__/page.tsx`, and
`app/%5F_pl__/manifest.json/route.ts`. The encoded leading underscore is Next's
filesystem form of the public `/__pl__` route. The page renders the generated client
registry. The route imports `loadedProject` and calls
`assembleLoadedManifest`, returning `Response.json(manifest)` or a JSON 500.

- [ ] **Step 5: Implement custom Next server and MCP route**

Load the consumer's Next peer, create `next({ dev: true, dir: cacheRoot,
turbopack: true })`, await `prepare()`, and delegate the HTTP request handler.
Intercept only `/__pl__/mcp`; its tools fetch the server's own manifest route.
Return `{ port, close }` and close watcher, Next, and HTTP resources on every
failure path.

- [ ] **Step 6: Implement CLI and registry watcher**

The CLI defaults to `process.cwd()`, watches configured story/doc patterns with
Chokidar, atomically regenerates registries on membership changes, and prints a
`manifest-changed` event after the atomic rename. Existing file edits remain
Turbopack HMR events.

- [ ] **Step 7: Verify package tests/typecheck/build**

Run:

```bash
pnpm --filter @gobrand/openstory-next test
pnpm --filter @gobrand/openstory-next typecheck
pnpm --filter @gobrand/openstory-next build
```

- [ ] **Step 8: Commit**

```bash
git add packages/next
git commit -m "feat: run OpenStory through Next Turbopack"
```

### Task 5: Generalize the desktop preview server

**Files:**

- Create: `apps/desktop/electron/preview-server.ts`
- Create: `apps/desktop/electron/preview-server.test.ts`
- Create: `apps/desktop/electron/preview-adapter.ts`
- Create: `apps/desktop/electron/preview-adapter.test.ts`
- Modify/Delete: `apps/desktop/electron/vite-host.ts` and its tests
- Modify: `apps/desktop/electron/main.ts`
- Modify: `apps/desktop/electron/ipc.ts`
- Modify: `apps/desktop/electron/manifest-request.ts`
- Modify: `apps/desktop/electron/types.ts`
- Modify: renderer consumers/tests of `AppState.vite`

**Interfaces:**

- Produces: `PreviewAdapter = "vite" | "next"`.
- Produces: `PreviewServerStatus` from the approved spec.
- Produces: `PreviewServer.start(root)` / `stop()` / `generation()` / `subscribe()`.

- [ ] **Step 1: Write failing adapter-detection tests**

Cover valid Next, valid Vite, missing Next adapter, unsupported Next version,
both adapters, neither adapter, monorepo-hoisted resolution, and App Router
directory detection. Ambiguous states must return an actionable error.

- [ ] **Step 2: Write failing Next child lifecycle tests**

Use an injected `spawn` implementation to emit fragmented JSON lines, ready,
manifest-changed, stderr, early exit, overlapping starts, and stop. Assert the
existing token prevents stale readiness, manifest-changed re-fetches the
manifest without changing the selected project, and every superseded child is
terminated.

- [ ] **Step 3: Confirm red**

Run: `pnpm --filter openstory-desktop exec vitest run electron/preview-adapter.test.ts electron/preview-server.test.ts`
Expected: fail because the generic host does not exist.

- [ ] **Step 4: Implement the generic controller**

Keep embedded Vite startup in a Vite adapter implementation. Spawn the
consumer-resolved `openstory-next` executable for Next. Parse only stdout JSON
protocol lines; retain stderr for the error summary. Share start-token,
subscription, cleanup, and status logic in `PreviewServer`.

- [ ] **Step 5: Rename product state from `vite` to `previewServer`**

Update `AppState`, IPC state building, manifest staleness checks, loading/error
UI, and tests. Include `adapter` in starting/ready/error states. Do not leave a
second Vite-specific state path.

- [ ] **Step 6: Verify desktop and adapter packages**

Run:

```bash
pnpm --filter openstory-desktop test
pnpm --filter openstory-desktop typecheck
pnpm --filter @gobrand/openstory-next test
```

- [ ] **Step 7: Commit**

```bash
git add apps/desktop
git commit -m "feat: launch framework preview adapters"
```

### Task 6: Prove the real Next 16/Turbopack integration

**Files:**

- Create: `packages/next/src/__fixtures__/next-app/` fixture files
- Create: `packages/next/src/next-integration.test.ts`
- Modify: `packages/next/package.json` test configuration if required

**Interfaces:**

- Consumes: `startNextPreview` and the public HTTP contracts.
- Verifies: real Next 16.2.10/Turbopack, not injected fakes.

- [ ] **Step 1: Create the real fixture**

Include an App Router layout, aliased Client Component, `next/image`,
`next/link`, `next/navigation`, global CSS, PostCSS/Tailwind, provider,
`*.stories.tsx`, `*.stories.md`, and a separate server-only negative fixture.

- [ ] **Step 2: Write the failing end-to-end test**

Start on port 0 and assert:

```ts
expect((await fetch(`${base}/__pl__/`)).status).toBe(200);
expect(await fetch(`${base}/__pl__/manifest.json`).then((r) => r.json())).toMatchObject({
  schemaVersion: 1,
});
```

Use Playwright for the headless render URL and navigation/image assertions.
Call MCP initialize/list-components over HTTP. Add/delete a story and assert the
manifest changes; edit an existing label and assert HMR without server restart.

- [ ] **Step 3: Confirm red, then fix only integration gaps**

Run: `pnpm --filter @gobrand/openstory-next exec vitest run src/next-integration.test.ts`
Expected initially: fail at the first missing/incompatible real behavior. For
each gap, add the narrowest regression assertion before changing adapter code.

- [ ] **Step 4: Verify cleanup and negative boundary**

Assert the server-only fixture returns an error mentioning
`client-compatible stories`, then close and prove the port can be rebound and
no watcher handles remain.

- [ ] **Step 5: Run package verification**

Run:

```bash
pnpm --filter @gobrand/openstory-next test
pnpm --filter @gobrand/openstory-next typecheck
pnpm --filter @gobrand/openstory-next build
```

- [ ] **Step 6: Commit**

```bash
git add packages/next
git commit -m "test: prove Next Turbopack adapter end to end"
```

### Task 7: Document Next support and finish verification

**Files:**

- Modify: `README.md`
- Modify: `packages/next/README.md`
- Modify: `apps/www/content/docs/installation.mdx`
- Modify: `apps/www/content/docs/index.mdx`
- Create: `apps/www/content/docs/nextjs.mdx`
- Modify: release/package metadata required for the two new public packages

**Interfaces:**

- Documents: install, zero-config desktop detection, `story:dev`, supported Next versions/features, and client-only boundary.

- [ ] **Step 1: Update public documentation**

Keep Vite instructions intact and add a separate Next.js path. State plainly
that rendering uses real App Router/Turbopack, that story graphs must be
client-compatible, and that Pages Router/webpack/RSC/Server Actions are not
supported in v1. Include only shipped identifiers and commands.

- [ ] **Step 2: Check documentation consistency**

Run:

```bash
rg -n "openstory-next|Next.js 16|Turbopack|Server Components|Pages Router" README.md packages/next/README.md apps/www/content/docs
```

Expected: install and limitations agree across all surfaces.

- [ ] **Step 3: Run fresh full verification**

Run:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
pnpm exec oxfmt --check .
```

Expected: every command exits zero; Next integration tests boot real Turbopack.

- [ ] **Step 4: Verify workspace cleanliness and public package contents**

Run `pnpm --filter @gobrand/openstory-node pack --dry-run` and the same for
`@gobrand/openstory-next`; confirm each export/bin target is present. Run
`git diff --check` and ensure no generated shadow app is tracked.

- [ ] **Step 5: Commit**

```bash
git add README.md packages/next apps/www pnpm-lock.yaml
git commit -m "docs: add Next Turbopack setup"
```
