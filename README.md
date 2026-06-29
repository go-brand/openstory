# OpenStory

OpenStory is an open-source tool that reads your codebase via a Vite plugin and
compiles your **design system and docs** into a desktop app — Storybook without
the config tax. Point it at any repo.

Drop `*.stories.{ts,tsx}` next to your components and `*.stories.md` anywhere
under `src`, add one Vite plugin, and OpenStory boots the project's own dev
server, discovers everything, and renders your real components — with your CSS,
your providers, your React — on its own themed canvas. No per-project app to
build, no Storybook to host, no route to wire up.

> Today this is a component workbench plus living docs. Compiling _more_ than
> design systems is on the roadmap.

## How it works

OpenStory is not a single library. It is a **manager** plus a **harness**, and
they run in two different places:

- **The manager** is the Electron app — the sidebar, toolbar, controls panel,
  and the canvas you look at. You run it. It is _not_ published and _not_
  installed into your project.
- **The harness** is a small React app that runs **inside your own Vite dev
  server**, in an iframe. It imports your _real_ components and renders them with
  your CSS, your React version, and your providers.

```
  Electron MANAGER                         YOUR Vite dev server
  (chrome you click)                       (openStory() plugin)
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

1. You add `openStory()` to your `vite.config.ts` and run Vite.
2. The plugin globs `*.stories.{ts,tsx}` and `*.stories.md`, builds a manifest
   (components, stories, docs), and serves the harness HTML at `/__pl__/`.
3. The manager starts your Vite server and loads `/__pl__/` in the canvas iframe.
4. You click a story. The manager sends a `postMessage` (`pl:render`) with the
   selection + theme.
5. The harness renders that component, measures it, and posts its size back
   (`pl:size`) so the manager can fit the iframe to the component and frame it on
   OpenStory's own light/dark themed canvas.

## Packages

OpenStory is a Turborepo monorepo. The **manager** (`apps/desktop`, Electron) is
not published. **Three packages** are, and the split is about **where code runs**,
not arbitrary modularity:

| Package                      | Runs in                     | Job                                                                                                                                                                                                           |
| ---------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@gobrand/openstory-config`  | everywhere (Node + browser) | the authoring API (`defineOpenStoryConfig` / `defineStories`) + the component/story types and the viewport presets. **Zero dependencies**, so the Node tooling can import the types without pulling in React. |
| `@gobrand/openstory-runtime` | the **browser** harness     | the React app in the iframe — renders the component, the doc prose, and the size/manifest bridge.                                                                                                             |
| `@gobrand/openstory-vite`    | **Node** (your Vite server) | serves the harness, discovers `*.stories.{ts,tsx}` + `*.stories.md`, extracts prop types from TypeScript.                                                                                                     |

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

### 2. The Vite plugin — gated to `openstory` mode

OpenStory starts the project's Vite server with `mode: 'openstory'`. Add the
plugin, and **disable framework plugins that take over the request pipeline**
(TanStack Start, the Cloudflare plugin, SSR adapters, etc.) in that mode — they
will otherwise swallow the `/__pl__/` harness route.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { openStory } from "@gobrand/openstory-vite";

export default defineConfig(({ mode }) => {
  const isOpenStory = mode === "openstory";
  return {
    plugins: [
      react(),
      openStory(),
      // Framework plugins own the dev server pipeline — skip under OpenStory.
      ...(isOpenStory ? [] : [tanstackStart(), cloudflare()]),
    ],
    // Skip dep pre-bundling that crawls framework-only virtual modules.
    ...(isOpenStory ? { optimizeDeps: { entries: [] } } : {}),
  };
});
```

> **Why the gating?** Framework plugins (TanStack Start, Cloudflare Workers, etc.)
> install middleware that owns `/` and every request, so a plain harness route
> like `/__pl__/` never reaches our plugin. Running them under `openstory` mode
> also drags in framework-only virtual modules that crash dep-optimization.
> Reducing this to truly zero-config is the main item on the roadmap.

Then in OpenStory: **Open a project…** → pick the folder. The sidebar fills with
every discovered component (under **Design System**) and doc (under **Docs**).

## For agents

OpenStory is drivable headlessly — no Electron, no clicking. Run the project's
Vite dev server with the `openStory()` plugin and an AI agent gets two surfaces,
both mounted under `/__pl__/`:

**1. Headless render route** — a versioned, stateless URL contract that renders
**one** story, identical to what the desktop manager shows (same renderer, two
triggers):

```
/__pl__/?component=<id>&story=<id>&viewport=desktop|mobile&theme=light|dark&layout=padded|centered|fullscreen
```

`component`, `story`, `viewport` are required; `theme` (default `light`) and
`layout` (defaults to the component's declared layout) are optional. Point a
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

### Diagnostics

The main process mirrors Node `process` warnings to
`<userData>/logs/warnings.log` (stderr can be a closed pipe when launched from a
terminal that has since exited, so the default console path is unreliable). EPIPE
on stdout/stderr is swallowed by design — it only ever meant "the terminal that
launched me went away," never a real fault.

## Status & roadmap

Pre-alpha. It is a component workbench plus living docs. Working today:

- project open/switch
- live preview via the project's own Vite HMR — the actual component, not a
  snapshot
- story + viewport switching
- markdown docs with live `:::story` embeds
- a light/dark themed canvas that fits itself to each component

Next:

- **Reduce integration to zero-config** — auto-detect and neutralize framework
  plugins instead of asking projects to gate them on `mode`.
- **Packaged builds** — `electron-builder` is wired (`pnpm --filter
openstory-desktop package`) but unsigned and untested for distribution.
