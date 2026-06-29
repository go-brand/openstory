# OpenStory

A desktop overlay for previewing React components live, in isolation, against
real social-media platform chrome — and comparing them pixel-for-pixel with a
reference design.

Point it at any repository, pick a component, and OpenStory renders it inside
a floating, always-on-top window you can fade, blend, and click through over a
mockup in Figma, a screenshot, or the real platform.

## What we want this to be

The goal is a **single desktop app you can aim at _any_ repository** and start
previewing components in seconds — no per-project app to build, no Storybook to
host, no route to wire up.

Concretely:

1. **Universal.** Open any folder that has a `openstory.config.ts`. OpenStory
   boots that project's own Vite dev server, so components render with the
   project's real aliases, Tailwind config, providers, and styles.
2. **Live.** Edits hot-reload through the project's normal Vite HMR. What you see
   is the actual component, not a snapshot.
3. **Comparison-first.** The preview is a frameless, transparent overlay with
   opacity, `difference` blend mode, and click-through — built for pixel-diffing
   a render against a design.
4. **Platform-accurate.** Previews declare a `platform` (LinkedIn, X, Instagram…)
   and render at that platform's canonical post width with the right background.
5. **Low-friction to adopt.** A project opts in with one config file and one Vite
   plugin. Authoring a preview is Storybook-CSF-like (`defineStories`).

## How it works

OpenStory is a Turborepo monorepo. Two halves:

```
┌─────────────────────────────────────────────────────────────┐
│  apps/desktop  (Electron)                                    │
│                                                              │
│   main process                     renderer (HUD, React)     │
│   ├─ ViteHost ──spawns──┐          ├─ project / variant pick  │
│   ├─ AppStore (persist) │          └─ overlay controls        │
│   └─ IPC bridge ────────┼──── state:update ──▶                │
│                         │                                     │
└─────────────────────────┼────────────────────────────────────┘
                          │ createServer({ root: <project> })
                          ▼
        target repo's Vite dev server (mode: 'openstory')
        └─ @gobrand/openstory-vite plugin serves:
             /__pl__/              → harness HTML + entry
             /__pl__/manifest.json → list of previews + variants
                          │
                          ▼  (rendered in an <iframe> in the HUD)
        @gobrand/openstory-runtime mounts the selected preview
```

- The **desktop main process** owns no bundler of its own. When you select a
  project it calls Vite's programmatic `createServer({ root })` against the
  target repo (`apps/desktop/electron/vite-host.ts`). One project = one Vite
  server; switching projects tears the old one down first.
- The server runs in **`mode: 'openstory'`**. The `@gobrand/openstory-vite` plugin
  injects a harness at `/__pl__/` and a manifest at `/__pl__/manifest.json`. The
  HUD reads the manifest to populate the preview/variant lists, then loads the
  harness URL in an `<iframe>`, passing the selection via query params.
- `@gobrand/openstory-runtime` mounts inside that iframe, looks up the selected preview
  + variant from the project's config, wraps it in the project's `providers`, and
  renders it at the platform's viewport width.
- The HUD (`apps/desktop/src`) is a React app talking to the main process over a
  typed, context-isolated `contextBridge` (`electron/preload.ts`). All app state
  (projects, selection, overlay settings, window bounds) lives in the main
  process and is pushed to the renderer via a single `state:update` event.

### Packages

| Package                 | Role                                                                   |
| ----------------------- | --------------------------------------------------------------------- |
| `apps/desktop`          | The Electron app: HUD UI, IPC, window + Vite lifecycle, persistence.  |
| `@gobrand/openstory-vite`      | Vite plugin: serves the `/__pl__/` harness + manifest in a project.   |
| `@gobrand/openstory-runtime`   | The in-iframe harness: mounts the selected preview, the parent bridge.|
| `@gobrand/openstory-config`    | `defineStories` / `defineOpenStoryConfig` authoring API + types.     |

## Using it in a project

A repository opts in with **two things**.

### 1. A `openstory.config.ts` at the project root

```ts
import { defineOpenStoryConfig } from '@gobrand/openstory-config';
import myComponentStories from './src/components/MyComponent.stories';

export default defineOpenStoryConfig({
  previews: [myComponentStories],
  // optional: wrap every preview (theme, query client, i18n, …)
  // providers: AppProviders,
});
```

Author previews Storybook-style with `defineStories`:

```ts
// MyComponent.stories.ts
import { defineStories } from '@gobrand/openstory-config';
import { MyComponent } from './MyComponent';

export default defineStories({
  component: MyComponent,
  platform: 'linkedin',
  stories: {
    // key → id (kebab-case) + label (Title Case); value is the props
    Default: { title: 'Hello', author: { name: 'Ada' } },
    LongPost: {
      args: { title: 'A'.repeat(400), author: { name: 'Ada' } },
      label: 'Long (truncated)',
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
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { openStory } from '@gobrand/openstory-vite';

export default defineConfig(({ mode }) => {
  const isOpenStory = mode === 'openstory';
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

Then in OpenStory: **Open a project…** → pick the folder. The dropdown lists
every preview from the config; the variant list comes from each preview's
stories.

## Keyboard shortcuts (HUD focused)

| Shortcut      | Action                    |
| ------------- | ------------------------- |
| `F8` / `⌘⌥T`  | Toggle click-through      |
| `⌘↑` / `⌘↓`   | Opacity ±10%              |
| `⌘⇧↑` / `⌘⇧↓` | Opacity ±1%               |
| `⌘B`          | Toggle `difference` blend |
| `⌘R`          | Reload the HUD            |

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

Pre-alpha. Working today: project open/switch, live preview, variant + viewport
switching, the comparison overlay (opacity / blend / click-through), persisted
window bounds and selection.

Next:

- **Reduce integration to zero-config** — auto-detect and neutralize framework
  plugins instead of asking projects to gate them on `mode`.
- **Reference images** — load a design file / screenshot directly into the
  overlay to diff against, instead of floating over another app.
- **Packaged builds** — `electron-builder` is wired (`pnpm --filter
  openstory-desktop package`) but unsigned and untested for distribution.
