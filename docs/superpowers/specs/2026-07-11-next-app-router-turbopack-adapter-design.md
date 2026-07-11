# Next.js App Router and Turbopack adapter

**Date:** 2026-07-11
**Status:** Approved direction

## Goal

Add first-class OpenStory support for Next.js App Router projects using
Turbopack, without running component previews through Vite and without writing
generated routes into the consumer's source tree.

The first release targets:

- Next.js 16 or newer;
- App Router projects;
- Turbopack development mode;
- React 19;
- client-compatible component stories.

Pages Router, Next's webpack mode, React Server Component rendering, Server
Actions, and production export of the harness are explicitly out of scope.

## User experience

A Next.js project installs two development packages:

```bash
pnpm add -D @gobrand/openstory-config @gobrand/openstory-next
```

Story authoring stays unchanged:

```tsx
import { defineStories } from "@gobrand/openstory-config";
import { Button } from "./button";

export default defineStories({
  component: Button,
  stories: {
    Primary: { variant: "primary", children: "Continue" },
  },
});
```

No `next.config` wrapper and no generated `app/__pl__` files are required. The
desktop manager detects the installed adapter and starts it automatically. A
project-local script may run the same adapter directly:

```json
{
  "scripts": {
    "story:dev": "openstory-next"
  }
}
```

The public routes remain identical to the Vite adapter:

- `/__pl__/` — preview harness;
- `/__pl__/manifest.json` — manifest;
- `/__pl__/mcp` — read-only MCP server;
- `/__pl__/?component=...&story=...&viewport=...` — headless render URL.

## Client-compatible story contract

The preview is compiled as a real Next.js Client Component subtree. A story's
component graph may use browser-compatible Next features such as `next/image`,
`next/font`, `next/link`, and `next/navigation`. It must not import `server-only`,
Node-only modules, Server Actions, or data access that is restricted to the
server.

The story file itself should remain environment-neutral: it declares metadata,
fixtures, and a component import, but does not declare `"use server"` or perform
server-side work at module evaluation time. It does not need `"use client"`;
the generated client registry establishes the client boundary.

This is deliberately narrower than claiming React Server Component support.
If Turbopack reports a server-only boundary violation, OpenStory surfaces an
actionable error stating that v1 supports client-compatible stories. Server
Components will require a later request-driven RSC rendering contract.

## Why this differs from Storybook

Storybook's recommended Next.js integration runs its own Vite builder and
emulates Next APIs with framework adapters and mocks. Its RSC mode is
experimental and still requires mocks for filesystem, Node, data, and Server
Action behavior.

OpenStory will instead run a generated App Router application with the
consumer's installed Next.js and Turbopack. This costs more implementation work
but gives stories the real Next module transforms, routing context, image/font
handling, CSS pipeline, and client runtime.

## Architecture

### 1. Builder-independent Node core

Create `@gobrand/openstory-node` for code currently owned by the Vite package
but not inherently tied to Vite:

- file matching and story/doc discovery;
- manifest shaping and prop-type extraction;
- project identity;
- doc link resolution and doc sync;
- changed-story Git helpers;
- MCP tool definitions.

The package exposes two manifest layers:

```ts
type LoadedProject = {
  config: OpenStoryConfig | null;
  components: RegisteredComponent[];
};

assembleLoadedManifest(input: {
  projectRoot: string;
  loaded: LoadedProject;
  readFile: (path: string) => string;
}): Manifest;
```

`@gobrand/openstory-vite` keeps its Vite-specific module loading and routes, but
delegates discovery, shaping, identity, docs, Git operations, and MCP tools to
the Node package. Public Vite behavior must remain unchanged.

### 2. React runtime component boundary

The current runtime mounts itself imperatively with `createRoot`. Extract the
existing application body into an exported React component:

```ts
type OpenStoryPreviewProps = {
  config: OpenStoryConfig;
};

function OpenStoryPreview(props: OpenStoryPreviewProps): React.ReactElement;
```

`mountPreviewHost` remains as the Vite entry point and renders this component.
The generated Next Client Component renders `OpenStoryPreview` directly inside
Next's existing React root. This prevents nested roots and guarantees that Vite
and Next use the same bridge, controls, docs, addons, sizing, and URL behavior.

### 3. `@gobrand/openstory-next`

The new adapter package owns:

- project validation and version checks;
- generated App Router files;
- static story registry generation;
- consumer configuration proxies;
- the Next custom development server;
- file watching for registry changes;
- CLI startup and the desktop process protocol.

`next` and React are peer dependencies. The adapter always resolves them from
the consumer project so the harness runs the same versions as the application.

### 4. Generated shadow application

Generate the adapter under:

```text
<project>/node_modules/.cache/openstory-next/<project-hash>/
```

The generated tree contains:

```text
app/
  layout.tsx
  __pl__/
    page.tsx
    manifest.json/route.ts
generated/
  client-registry.tsx
  server-registry.ts
next.config.mjs
postcss.config.mjs
tsconfig.json
```

Nothing is written to the consumer's tracked `app/` or `src/` directories.
`node_modules/.cache` already has the expected generated-artifact semantics.

The generated Next config loads the consumer's `next.config` export, including
async/function exports, and merges only adapter-owned settings:

- `turbopack.root` points at the consumer workspace root;
- `distDir` stays inside the generated cache;
- the generated App Router directory remains the application entry;
- the user's aliases, image configuration, transpilation settings, and other
  compatible Next options are preserved.

The generated TypeScript config extends the consumer's `tsconfig`. The generated
PostCSS config delegates to the consumer's config when present. Explicit
`styles` from `openstory.config` are imported by the generated layout; otherwise
the existing style candidate detection is reused.

### 5. Dual Turbopack registry

Discovery writes deterministic static imports for each matched story file.
There is no `import.meta.glob` and no runtime filesystem glob in the browser.

The client registry is a `"use client"` module. It imports all story modules and
the optional OpenStory config, validates/merges them, and renders
`OpenStoryPreview`. Components, providers, callbacks, and fixture values stay
inside the client module graph and are never serialized through an RSC boundary.

The server registry imports the same environment-neutral story modules through
Turbopack and projects their `defineStories` results into manifest inputs. The
generated manifest route calls `assembleLoadedManifest`, which discards
component references after reading IDs, labels, fixtures, presets, controls,
source paths, and docs. The HTTP response contains only the existing JSON
manifest schema.

This avoids a hidden Vite server, an unsupported Turbopack module-runner API,
and AST-only story evaluation that would reject legitimate TypeScript
expressions.

### 6. Next development server

The adapter uses Next's custom development-server API with:

- `dev: true`;
- Turbopack enabled;
- the generated shadow application as `dir`;
- a Node HTTP server bound to `127.0.0.1` and an ephemeral port.

Next handles the harness, manifest route, module compilation, HMR, and WebSocket
traffic. The small outer Node server intercepts `/__pl__/mcp` and delegates all
other requests to Next. MCP tools obtain the current manifest through the local
manifest route, keeping one manifest implementation and schema.

The CLI prints one machine-readable ready event containing the selected port
and adapter. Errors are emitted as structured events plus human-readable stderr.
SIGINT, SIGTERM, parent disconnect, and desktop project switches close Next,
the HTTP server, file watchers, and child processes.

### 7. Desktop preview-host abstraction

Replace the Vite-only host boundary with a generic preview server controller:

```ts
type PreviewAdapter = "vite" | "next";

type PreviewServerStatus =
  | { status: "idle"; adapter: null; port: null; error: null }
  | { status: "starting"; adapter: PreviewAdapter; port: null; error: null }
  | { status: "ready"; adapter: PreviewAdapter; port: number; error: null }
  | { status: "error"; adapter: PreviewAdapter | null; port: null; error: string };
```

Detection is based on the selected workspace's resolved dependencies and
filesystem:

1. installed `@gobrand/openstory-next` plus `next` plus an `app/` or `src/app/`
   directory selects the Next adapter;
2. an installed Vite config with `@gobrand/openstory-vite` selects Vite;
3. ambiguous or incomplete setups produce a direct error rather than guessing.

The Next adapter is launched as a child process from the consumer workspace.
The existing start token prevents stale processes from publishing `ready` after
a project switch. Renderer state and IPC use `previewServer` terminology rather
than exposing `vite` as the product abstraction.

## Runtime flow

```text
Open project
  -> detect Next App Router + adapter
  -> discover stories and generate shadow app
  -> start Next custom server with Turbopack
  -> wait for machine-readable ready event
  -> fetch /__pl__/manifest.json
  -> populate manager sidebar
  -> load /__pl__/ in iframe
  -> existing postMessage bridge drives stories/docs/controls
```

Headless agents use the same Next server, manifest, render URL, and MCP tools as
the desktop manager.

## HMR and registry updates

- Editing an existing component, story, config, provider, or stylesheet flows
  through normal Turbopack HMR.
- Adding, deleting, or renaming a story or docs file regenerates both registries
  atomically and invalidates the manifest route.
- Registry writes use content comparison and a temporary-file rename so watchers
  never observe a partial module.
- The adapter ignores its generated cache and all normal build-output folders
  during discovery.
- The manager re-fetches the manifest after registry changes so the sidebar and
  docs update without reconnecting the project.

## Error handling

Errors must name the failing layer and the consumer action:

- missing/unsupported Next version;
- missing adapter package;
- no App Router directory;
- consumer Next config load failure;
- Turbopack compile failure;
- client story importing a server-only module;
- story/config module evaluation failure;
- manifest route failure;
- child process exit before readiness.

Raw Next diagnostics remain available, but the desktop summary explains the
OpenStory constraint. A failed Next start closes every partially-created server
and watcher before publishing the error state.

## Security and filesystem boundaries

- Bind only to `127.0.0.1` by default.
- Reuse the existing project-root source-read guards for MCP tools.
- Resolve all generated imports from discovered absolute paths under the
  selected project/workspace roots.
- Reject registry paths that escape those roots after realpath resolution.
- Never execute package-manager install commands automatically.
- Never modify tracked consumer source or configuration.
- Treat the generated cache as disposable and recreate it when its schema or
  project identity changes.

## Testing

### Unit tests

- framework detection and ambiguous setup errors;
- deterministic, escaped client/server registries on POSIX and Windows paths;
- Next config merging for object, function, async, and absent exports;
- cache path and project-root containment;
- structured ready/error process events;
- start-token cancellation and child cleanup;
- runtime component parity between `mountPreviewHost` and direct React render;
- builder-independent manifest projection preserves the existing schema.

### Integration fixture

Add a real Next 16 App Router fixture using Turbopack with:

- a Client Component story;
- `next/image`, `next/link`, and `next/navigation` usage;
- TypeScript path aliases;
- global CSS and Tailwind/PostCSS coverage;
- an OpenStory provider;
- a docs page with a story embed;
- a deliberately server-only story for the actionable error case.

Boot the adapter on an ephemeral port and verify:

- `/__pl__/` returns the Next-rendered harness;
- `/__pl__/manifest.json` returns the expected component/docs manifest;
- the headless story URL renders through Turbopack;
- `/__pl__/mcp` lists and resolves the same stories;
- an existing story edit uses HMR;
- adding/removing a story regenerates the registry and manifest;
- shutdown leaves no listener, child, or watcher alive.

### Regression verification

The existing Vite fixture, Vite package tests, desktop tests, typecheck, lint,
and builds must remain green. The same manifest fixture should be run through
both adapters and compared after removing adapter-specific transport details.

## Delivery sequence

1. Extract `@gobrand/openstory-node` with no Vite behavior change.
2. Export the React runtime component while preserving `mountPreviewHost`.
3. Build registry generation and manifest projection.
4. Build the generated App Router/Turbopack server and CLI.
5. Generalize desktop host detection and lifecycle.
6. Add real Next integration coverage and public documentation.

Each step must end with its own focused tests and commit. The first public claim
of Next.js support happens only after the real fixture passes end to end.

## Done criteria

- A Next 16 App Router project needs only the two OpenStory development
  dependencies and normal story files.
- The preview is compiled by the consumer's Next.js and Turbopack, not Vite.
- Client-compatible components use real Next routing, image/font, alias, CSS,
  and provider behavior.
- Harness, manifest, MCP, docs, controls, addons, sizing, and headless URLs match
  the Vite adapter's contracts.
- Story edits and registry membership changes update without reconnecting.
- Server-only stories fail with an explicit v1 boundary message.
- The adapter writes no tracked files into the consumer project.
- Full monorepo verification and the real Next fixture pass.
