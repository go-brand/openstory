# OpenStory

OpenStory is an open-source tool that compiles your **design system and docs**
through your project's real Vite or Next.js development pipeline into a desktop
app — Storybook without the config tax. Point it at any repo.

Drop `*.stories.{ts,tsx}` next to your components and `*.stories.md` anywhere
under `src`, install the matching adapter, and OpenStory boots the project's own
development server, discovers everything, and renders your real components —
with your CSS, your providers, your React — on its own themed canvas. Vite uses
`openStory()`; Next.js 16 App Router projects need only the Next adapter.

> Today this is a component workbench plus living docs. Compiling _more_ than
> design systems is on the roadmap.

## How it works

OpenStory is not a single library. It is a **manager** plus a **harness**, and
they run in two different places:

- **The manager** is the Electron app — the sidebar, toolbar, controls panel,
  and the canvas you look at. You run it. It is _not_ published and _not_
  installed into your project.
- **The harness** is a small React app that runs **inside your own Vite or Next
  development server**, in an iframe. It imports your _real_ components and
  renders them with your CSS, your React version, and your providers.

```
  Electron MANAGER                         YOUR development server
  (chrome you click)                       (Vite plugin / Next adapter)
  ┌────────────────────┐   postMessage   ┌─────────────────────────┐
  │ sidebar / toolbar  │ ◄─────────────► │ harness renders YOUR     │
  │ <iframe /__pl__/ ──┼─────────────────┼─► components, posts size  │
  └────────────────────┘                 └─────────────────────────┘
        not published                       installed as @gobrand/*
```

The manager **cannot** import your components directly — they need your bundler,
your Tailwind, your providers. So the part that renders components has to live in
your project and run in your Vite. The manager just points an iframe at `/__pl__/`
and talks over `postMessage`. That single boundary is the reason OpenStory is
split into the packages below.

### The request flow

1. The manager detects the installed Vite or Next adapter and starts it.
2. The adapter discovers `*.stories.{ts,tsx}` and `*.stories.md`, builds a manifest
   (components, stories, docs), and serves the harness HTML at `/__pl__/`.
3. The manager loads `/__pl__/` from the project server in the canvas iframe.
4. You click a story. The manager sends a `postMessage` (`pl:render`) with the
   selection + theme.
5. The harness renders that component, measures it, and posts its size back
   (`pl:size`) so the manager can fit the iframe to the component and frame it on
   OpenStory's own light/dark themed canvas.

## Packages

OpenStory is a Turborepo monorepo. The **manager** (`apps/desktop`, Electron) is
not published. **Five packages** are, and the split is about **where code runs**,
not arbitrary modularity:

| Package                      | Runs in                     | Job                                                                                                                                                                                                           |
| ---------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@gobrand/openstory-config`  | everywhere (Node + browser) | the authoring API (`defineOpenStoryConfig` / `defineStories`) + the component/story types and the viewport presets. **Zero dependencies**, so the Node tooling can import the types without pulling in React. |
| `@gobrand/openstory-runtime` | the **browser** harness     | the React app in the iframe — renders the component, the doc prose, and the size/manifest bridge.                                                                                                             |
| `@gobrand/openstory-node`    | **Node**                    | builder-independent discovery, manifest, Git, docs, project identity, and MCP services shared by adapters.                                                                                                    |
| `@gobrand/openstory-vite`    | **Node** (your Vite server) | serves the harness, discovers `*.stories.{ts,tsx}` + `*.stories.md`, extracts prop types from TypeScript.                                                                                                     |
| `@gobrand/openstory-next`    | **Node** (your Next server) | generates a shadow App Router application and runs it through Next.js 16 and Turbopack.                                                                                                                       |

The hard line is **Node vs Browser**: the Vite plugin and the harness literally
cannot be one package. `config` stays dependency-free so the Node side imports
shared types without dragging React along.

## Vocabulary

OpenStory follows Storybook's terms:

- **Component** — one `defineStories(...)` result. Shows up under **Design
  System** in the sidebar.
- **Story** — one prop combination of a component (`Primary`, `Disabled`, …).
- **Design System** — the components + their stories, taken together.
- **Docs** — `*.stories.md` markdown pages. Show up under **Docs**.
- **Preset** — a named render setting: canvas width(s) + a background painted
  behind the component. Core ships only a neutral `default` (600px desktop /
  360px mobile, background `#f4f4f5`). Projects declare their own presets in
  `openstory.config.ts`.

## Using it in a project

A repository opts in with **two things**. Stories are auto-discovered from
`*.stories.{ts,tsx}` and docs from `*.stories.md` — no manual registration.

### 1. Author stories with `defineStories`

Drop a `*.stories.tsx` next to your component. Each key becomes both the story
id (kebab-cased) and the human label (Title Cased); the value is the props.

```ts
// Button.stories.ts
import { defineStories } from "@gobrand/openstory-config";
import { Button } from "./Button";

export default defineStories({
  component: Button,
  // preset is optional, string-named; omit for the neutral default
  // preset: 'docs',
  stories: {
    Primary: { variant: "primary", children: "Save" },
    Disabled: {
      args: { variant: "primary", children: "Save", disabled: true },
      label: "Primary (disabled)",
    },
  },
});
```

A docs page is just a `*.stories.md` with frontmatter (`title`, `group`,
`status`, `owner`) for the sidebar, plus `:::story <componentId>--<storyId>`
directives to embed the **real** story live, inline in the prose — edit the story
and the doc updates with it.

An `openstory.config.ts` at the project root is optional: use it to declare
shared `providers`, global `styles`, or custom `presets`.

```ts
// openstory.config.ts
import { defineOpenStoryConfig } from "@gobrand/openstory-config";

export default defineOpenStoryConfig({
  // wrap every story (theme, query client, i18n, …)
  // providers: AppProviders,
  // a named render setting: canvas width(s) + background
  presets: {
    docs: {
      viewport: { desktop: { width: 720 }, mobile: { width: 360 } },
      chrome: { background: "#ffffff" },
    },
  },
});
```

### 2. Install a project adapter

For Vite, add `openStory()` before framework and runtime adapters. OpenStory
starts the project's Vite server with `mode: "openstory"` and automatically
isolates the preview harness from supported pipeline owners such as TanStack
Start and the Cloudflare runtime plugin.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { openStory } from "@gobrand/openstory-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), openStory(), tanstackStart(), cloudflare()],
});
```

TanStack Start is a framework plugin. Cloudflare is a platform/runtime, and
`@cloudflare/vite-plugin` is its runtime adapter. Both own parts of Vite's
development pipeline, so OpenStory detects their instantiated plugin families
and disables them only in `openstory` mode. Normal development and builds are
unchanged.

For an unsupported adapter, use exact Vite plugin names as an advanced escape
hatch:

```ts
openStory({
  compatibility: {
    disable: ["my-runtime:dev-server"],
    keep: ["vite-plugin-cloudflare:debug"],
  },
});
```

Unknown plugins stay enabled by default, and `keep` wins over built-in or custom
disabling.

For a Next.js 16 App Router project using Turbopack:

```bash
pnpm add -D @gobrand/openstory-config @gobrand/openstory-next
```

No `next.config` wrapper or application route is required. The adapter runs the
real Next pipeline and supports client-compatible stories using Next images,
links, navigation, aliases, providers, and CSS. Pages Router, webpack mode, RSC
stories, and Server Actions are outside the v1 contract. See
[`packages/next/README.md`](packages/next/README.md).

Then in OpenStory: **Open a project…** → pick the folder. The sidebar fills with
every discovered component (under **Design System**) and doc (under **Docs**).

## For agents

OpenStory is drivable headlessly — no Electron, no clicking. Run the project's
Vite or Next adapter and an AI agent gets two surfaces,
both mounted under `/__pl__/`:

**1. Headless render route** — a versioned, stateless URL contract that renders
**one** story, identical to what the desktop manager shows (same renderer, two
triggers):

```
/__pl__/?component=<id>&story=<id>&viewport=desktop|mobile&theme=light|dark
```

`component`, `story`, `viewport` are required; `theme` (default `light`) is
optional. Point a
browser MCP (Chrome DevTools, Playwright, claude-in-chrome) at the URL and take
an accessibility-tree snapshot — that's the agent's "eyes" — plus a screenshot to
verify. The render is the naked component (no OpenStory chrome in the AX tree).

**2. MCP server** — a **read-only** Model Context Protocol server over HTTP at
`/__pl__/mcp` (mounted in your dev server, like `@storybook/addon-mcp`). Point any
MCP client at it:

```
npx mcp-add --type http --url 'http://localhost:5180/__pl__/mcp'   # your port may differ
```

Six tools, all reading the same manifest the sidebar uses:

| Tool                  | Returns                                                               |
| --------------------- | --------------------------------------------------------------------- |
| `list_components`     | every component: id, name, group, section, story ids/labels           |
| `list_stories`        | one component's stories with props                                    |
| `get_component_props` | a component's derived controls (its prop API)                         |
| `get_story_source`    | a component's stories file path + contents                            |
| `get_changed_stories` | stories whose source changed (git diff; default working tree vs HEAD) |
| `get_render_url`      | a navigable render URL (structured object) for a story                |

The tight loop: **edit a component → `get_changed_stories` → `get_render_url` →
browser-MCP snapshot the result.** No re-scanning the whole design system each
turn.

> Screenshots are an agent's own browser MCP's job — core ships **no Chromium**.
> A server-side screenshot tool for browser-less agents is a planned opt-in
> package. The manifest and the render-route query params are versioned by
> `schemaVersion` (currently `1`).

## Development

```bash
nvm use            # Node >= 22
corepack enable
pnpm install
pnpm dev           # turbo: builds packages, launches the Electron app
```

Other tasks:

```bash
pnpm build         # build all packages + the desktop app
pnpm typecheck     # tsc across the monorepo
pnpm test          # vitest across packages
pnpm lint          # oxlint
pnpm format        # oxfmt
```

The desktop app is `electron-vite` (`apps/desktop/electron.vite.config.ts`),
split into `main` / `preload` / `renderer`. The renderer is sandboxed
(`contextIsolation: true`, `sandbox: true`); the only renderer↔main surface is
the typed `openStory` bridge in `electron/preload.ts`.

### Dogfooding

OpenStory documents its own design system with itself. `apps/desktop` carries a
plain `vite.config.ts` (separate from the electron-vite build) plus `*.stories.tsx`
next to its real Base UI primitives and `*.stories.md` docs under `src/docs/`
(including **How the MCP works**). Run `pnpm dev`, then **Open a project… →
`apps/desktop`** — the harness renders OpenStory's own components, on its own
canvas, through OpenStory. The same project also exposes the agent surface
(`/__pl__/mcp`, `/__pl__/?component=…`).

### Diagnostics

The main process mirrors Node `process` warnings to
`<userData>/logs/warnings.log` (stderr can be a closed pipe when launched from a
terminal that has since exited, so the default console path is unreliable). EPIPE
on stdout/stderr is swallowed by design — it only ever meant "the terminal that
launched me went away," never a real fault.

## Status & roadmap

Pre-alpha. It is a component workbench plus living docs. Working today:

- project open/switch
- live preview via the project's own Vite or Turbopack HMR — the actual component, not a
  snapshot
- story + viewport switching
- markdown docs with live `:::story` embeds
- a light/dark themed canvas that fits itself to each component

The Next adapter currently targets Next.js 16 App Router and client-compatible
stories. React Server Component stories and production harness export remain
future work.

### Official app launch (distribution checklist)

`pnpm --filter openstory-desktop package` now produces a real, **unsigned**
`OpenStory.app` + `.dmg` (arm64) that boots clean. What's left before it's an app
others can install without friction:

- [x] `electron-builder` config (appId, productName, icon, arm64 dmg).
- [x] Packaged build boots (smoke-launched, no crash).
- [x] **Runtime verification** — opening a real project in the _packaged_ app
      starts the Vite host and serves `/__pl__/manifest.json`. Required
      `asar: false`: the bundled Vite spawns the esbuild binary, and a path
      inside `app.asar` can't be spawned (`spawn ENOTDIR`). esbuild reads
      `ESBUILD_BINARY_PATH` once at module-init, before our main code runs, so
      pointing it at an unpacked copy was unreliable; disabling asar (so the
      binary is a real on-disk file, like the dev app) is the robust fix.
- [ ] **Code signing** — Apple Developer ID Application cert; set `mac.identity`
      (drop `identity:null`) + hardened runtime + entitlements. Needed or macOS
      Gatekeeper blocks it.
- [ ] **Notarization** — `notarytool` (Apple ID + app-specific password / API key) + staple, so Gatekeeper passes with no warning.
- [ ] **Universal build** — add `x64` to `mac.target` arch for Intel Macs (arm64
      only today).
- [ ] **Auto-update** — `electron-updater` + a publish target (GitHub Releases or
      S3); generates `latest-mac.yml`.
- [ ] **Release CI** — build + sign + notarize + publish on a version tag, the way
      packages publish today (see `scripts/release.sh`). Keep signing secrets in CI.
- [ ] **Prod vs Dev distinction** — a non-"Dev" icon/name so the installed app and
      the local `OpenStory Dev` dock launcher are visually distinct.
- [ ] **Versioning** — drive the app version from the release tag instead of the
      hardcoded `0.4.0` in `apps/desktop/package.json`.

> The **OpenStory Dev** dock app (built by `apps/desktop/scripts/make-dev-app.sh`)
> is unrelated to distribution — it just runs `pnpm dev` cleanly for local work.
