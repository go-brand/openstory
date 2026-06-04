# Story-file auto-discovery (zero-config)

**Date:** 2026-06-03
**Status:** Approved design, pre-implementation
**Builds on:** [grouping-presets](./2026-06-02-general-storybook-grouping-presets-design.md) (`group`/`preset`), [sidebar nav tree](./2026-06-03-sidebar-nav-tree-design.md) (sections from `sourcePath`), [vocabulary rename](./2026-06-03-storybook-parity-north-star.md) (component/story)

## Problem

OpenStory requires every component to be hand-registered in a central
`openstory.config.ts` `components: [...]` array. That doesn't scale and is the
opposite of the "super simple API" north star — Storybook auto-discovers stories
by glob. We adopt that model: **co-located `*.stories.tsx` files, discovered
automatically, zero config required.** Mirror Storybook's core now; branch into
more unique territory (e.g. zero-story component inference) later.

## Decisions (settled in brainstorm)

1. **Zero-config discovery.** The plugin auto-globs `*.stories.tsx`; no config
   file is required. Each file default-exports a `defineStories(...)`.
2. **`*.stories.tsx` convention** — Storybook-identical (familiar). Non-`defineStories`
   default exports (e.g. a real Storybook CSF `Meta`) are skipped with a dev warning,
   so OpenStory can coexist with Storybook during migration.
3. **`openstory.config.ts` is optional**, used only for overrides (`stories` globs,
   `styles`, `presets`, `providers`) and the **`components: [...]` escape hatch**,
   which merges with discovered stories (de-duped by id; explicit wins).
4. **Discovery runs on both sides from the same patterns** — Node `fast-glob` for
   the authoritative manifest, Vite `import.meta.glob` for the renderable harness.

## Non-goals

- Zero-story component inference (render a component with no story file, inferring
  controls from prop types) — the next, bigger leap. Deferred.
- CSF compatibility (loading Storybook `Meta`/`StoryObj` files). We skip them.
- A second bundler or `.storybook/main.ts`-style config module.

## Architecture (Approach 1)

Discovery answers two questions from one set of glob patterns:

- **Node** ("what stories exist?" → sidebar metadata): in the manifest pipeline,
  `fast-glob` the patterns under the project root → `ssrLoadModule` each match →
  take `.default` → validate → merge `config.components` → `buildManifest`.
- **Harness** ("give me the component functions to render"): the plugin generates
  the harness entry with `import.meta.glob([<literal patterns>], { eager: true })`
  (patterns are known at build time) → collect defaults → merge `config.components`
  → `mountPreviewHost`. Vite provides HMR.

Same patterns → the two sides cannot disagree.

### A. Config shape

```ts
export type OpenStoryConfig = {
  /** Glob patterns (relative to project root) for story files. Default:
   *  ["**\/*.stories.{ts,tsx}"]. */
  stories?: string[];
  /** Explicit escape hatch — merges with discovered stories (de-duped by id). */
  components?: RegisteredComponent[];
  providers?: ComponentType<{ children: ReactNode }>;
  styles?: string[];
  presets?: Record<string, Preset>;
};
```

- The config file and every field are optional. No file → pure zero-config:
  default glob, no styles override (style auto-detection still runs), no presets.
- **Default glob:** `["**/*.stories.{ts,tsx}"]`. **Always-excluded:**
  `node_modules`, `dist`, `build`, `out`, `.git` (passed as `fast-glob` `ignore`
  and as negative patterns to `import.meta.glob`).
- **Merge/dedupe:** build a map keyed by manifest `id` from discovered stories, then
  apply `config.components` over it (explicit wins); a collision dev-warns with both
  sources.

### B. Discovery module

New `packages/vite-plugin/src/discover.ts` — pure-ish, Node side:

```ts
// Resolve the effective glob patterns from an (optional) config.
export function resolvePatterns(config: OpenStoryConfig | null): string[];

// Glob + load + validate (via shared isRegisteredComponent) + default sourcePath,
// returning discovered components. `load(absPath)` injects ssrLoadModule (so this
// stays unit-testable with a fake loader). Uses `tinyglobby` (Vite's globber).
export async function discoverComponents(
  projectRoot: string,
  patterns: string[],
  load: (absPath: string) => Promise<unknown>,
): Promise<RegisteredComponent[]>;
```

`discoverComponents`: `glob(patterns, { cwd: projectRoot, absolute: true, ignore })`
→ for each file `m = await load(path)`; `def = m.default`; skip + warn if
`!isRegisteredComponent(def)`; else default `sourcePath` to the file path when unset
(id is left as the module declared it — see C); collect.

The manifest route + `buildManifest` call this, then `mergeComponents(discovered,
config.components)`. `isRegisteredComponent` and `mergeComponents` live in the pure
`@gobrand/openstory-config` package so the Node plugin and the browser harness share
one validate + dedupe implementation.

### C. id / name / sourcePath defaulting

`ManifestComponent` and `RegisteredComponent` gain **`name: string`** (display label),
separate from **`id`** (unique key):

- **`name`** = `def.component.displayName ?? def.component.name ?? "Component"`,
  set by `defineStories`. The sidebar tree labels by `name`, not `humanize(id)`.
- **`id`** = `def.id` if set, else `kebab(componentName)` — **unchanged from today**,
  derived from the module so Node and harness always agree (a path-derived id can't:
  Node has an absolute FS path, the harness an `import.meta.glob` key, and the browser
  can't reconcile them). A duplicate id across files **dev-warns** ("two components
  resolve to id X; set an explicit `id`"); the merge keeps the first. Same-named
  components in different packages need an explicit `id` — exactly as Storybook
  requires unique `title`s.
- **`sourcePath`**: if unset, default to the story file's own path — **Node side only**
  (`discover.ts` has the glob path). It drives section derivation and the Code panel,
  both Node-only; the harness never reads `sourcePath`, so it isn't defaulted there.
  Author may override to point at the component file.

### D. Skip rule

```ts
export function isRegisteredComponent(v: unknown): v is RegisteredComponent {
  return typeof v === "object" && v !== null
    && "component" in v && typeof (v as any).component === "function"
    && "fixtures" in v && Array.isArray((v as any).fixtures);
}
```
A Storybook CSF default export (a `Meta` object, no `fixtures`) fails → skipped with
`console.warn("[openstory] skipped <file>: default export is not defineStories(...)")`.

### E. Live updates

The harness already posts `pl:manifest` on (re)load; Vite re-runs `import.meta.glob`
when a `*.stories.tsx` is added/edited/removed and re-posts. **The desktop consumes
`pl:manifest` to refresh `AppState.manifest` live**, so a new story file appears
without relaunching (and softens the existing manifest-refetch gap). The HTTP
`/__pl__/manifest.json` remains the authoritative initial load.

The `pl:manifest` message must carry the fields the sidebar needs that it currently
omits — extend it to include `name`, `section`, `background`, `controls`,
`sourcePath`, and per-story `props` (or have the desktop keep using HTTP for the
heavy fields and only treat `pl:manifest` as a "refetch now" trigger). **Chosen:
treat `pl:manifest` as a refetch trigger** — on receipt, the desktop re-fetches
`/__pl__/manifest.json` (one authoritative shape, no bridge-message bloat).

### F. Harness entry

`buildHarnessEntry(configPath | null, styles, patterns)` generates:

```js
// styles first (unchanged)
import '<style>'
import { mountPreviewHost } from '@gobrand/openstory-runtime'
import { isRegisteredComponent, mergeComponents } from '@gobrand/openstory-config'
const userConfig = <configPath ? `(await import('<configPath>')).default` : `{}`>
const modules = import.meta.glob([<...literal patterns>], { eager: true })
const discovered = Object.values(modules)
  .map((m) => m.default)
  .filter(isRegisteredComponent)
const components = mergeComponents(discovered, userConfig.components ?? [])
mountPreviewHost(target, { ...userConfig, components })
```

The harness imports the shared `isRegisteredComponent` + `mergeComponents` from
`@gobrand/openstory-config` (same functions `discover.ts` uses), so both sides agree.
The harness does NOT default `sourcePath` (not needed for rendering). Patterns are
emitted as literals (Vite statically analyzes `import.meta.glob`); the plugin reads
them from the config at generation time.

## Touch-points

| Layer | File | Change |
|-------|------|--------|
| Config types | `packages/config/src/define.ts` | `OpenStoryConfig.stories?`; `RegisteredComponent.name`; `defineStories` sets `name` |
| Shared discovery helpers | `packages/config/src/discover.ts` (new) | `isRegisteredComponent`, `mergeComponents` (pure; used by Node plugin AND browser harness) |
| Discovery (Node) | `packages/vite-plugin/src/discover.ts` (new) | `resolvePatterns`, `discoverComponents` (glob + load + sourcePath default); adds `tinyglobby` dep |
| Manifest | `packages/vite-plugin/src/plugin.ts` | manifest route + `buildManifest` glob-discover + merge; pass patterns to harness entry; emit `name` |
| Harness | `packages/vite-plugin/src/harness-loader.ts` | generate `import.meta.glob` entry; config optional |
| Host | `packages/runtime/src/preview-host.tsx` | thread `name` into the `pl:manifest` message |
| Desktop types | `apps/desktop/electron/types.ts` | `ManifestComponent.name` |
| Desktop refetch | `apps/desktop/electron/ipc.ts` (+ renderer bridge) | on `pl:manifest`, re-fetch manifest + broadcast |
| Tree label | `apps/desktop/src/components/sidebar/build-tree.ts` | label by `name` |
| Example | `examples/linkedin-starter/` | drop the explicit import; rely on discovery (keep `linkedin.stories.tsx`) |

## Testing

- **config** (`define.test.ts` + `discover.test.ts`): `stories` field present/typed;
  `defineStories` sets `name` from displayName/name; `isRegisteredComponent` accepts a
  `defineStories` result, rejects a `Meta`-like object; `mergeComponents` dedupes by id
  (explicit wins), warns on a discovered-vs-discovered dup.
- **vite-plugin** (`discover.test.ts`): `resolvePatterns` default + override;
  `discoverComponents` with a fake `load` — globs fixture files, skips invalid,
  defaults sourcePath to file path, honors ignores.
- **vite-plugin** (`plugin.test.ts`): `buildManifest` merges discovered + `components`
  (explicit wins on dup id); emits `name`; sourcePath/section flow intact.
- **harness-loader** (`plugin.test.ts`): generated entry contains
  `import.meta.glob([...])` with resolved literal patterns + still imports styles first.
- **desktop**: `build-tree` labels by `name` (extend existing tests with a `name`);
  manifest refetch fires on `pl:manifest` (unit-test the handler logic if extracted).
- **example**: `examples/linkedin-starter` renders via discovery (no explicit import).

## Risks

- **Two discovery sites** (Node `tinyglobby` vs Vite `import.meta.glob`) could drift —
  mitigated by sharing the validate/default/merge logic (`mergeDiscovered`) and the
  same patterns; tested on both.
- **`import.meta.glob` needs literal patterns** — the plugin emits them as literals
  from the resolved config; dynamic per-request patterns are not supported (fine —
  patterns are build-time config).
- **id path-slug churn** if files move — acceptable; selection is reconciled on
  manifest load already. Explicit `id` is the stable escape hatch.
- **`ssrLoadModule` cost** for many story files on each manifest fetch — acceptable at
  current scale; Vite caches modules. Revisit with caching if it bites.
