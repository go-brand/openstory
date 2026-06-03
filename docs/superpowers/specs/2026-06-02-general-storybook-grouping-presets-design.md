# General-purpose workbench: free-form `group` + render `preset`

**Date:** 2026-06-02
**Status:** Approved design, pre-implementation
**North star:** [`docs/north-star.md`](../../north-star.md) — pain #8 (rigid taxonomy)

## Problem

OpenStory requires every preview to declare a `platform` from a fixed 8-value
social enum (`linkedin | x | instagram | …`). The `platform` value is
overloaded: it is simultaneously the **sidebar grouping key**, the **viewport
selector**, and the **chrome background**. A user previewing a design-system
`Button` has no honest platform to put it under and must invent one (`'x'`),
which then mis-sizes and mis-colors the render.

We want OpenStory to be a general component workbench — a simpler, faster
Storybook — where social previews are one preset pack, not the whole model.

## Goals

- Author any component with **no platform tax**: a `Button` needs zero metadata.
- **Free-form nested grouping** for design systems (`Design System/Forms/Button`).
- **Named render presets** (viewport + chrome) decoupled from grouping; social
  platforms ship as built-in presets; users can define custom ones.
- Keep the social previews working — re-expressed as `group` + `preset`.
- Stay simpler than Storybook (no second bundler, no `Meta/StoryObj` ceremony,
  no mandatory `argTypes`).

## Non-goals

- MDX / separate docs system (north-star #9, later).
- Subcomponents / multi-component stories.
- Fine-grained control config is **optional only** (see Escape hatches), not MVP.

## Decision: hard replace, no legacy `platform`

Pre-1.0, no external users. We remove `platform` and the `Platform` enum
outright rather than keep deprecated sugar. The one example
(`examples/linkedin-starter`) is rewritten to the new fields.

## Authoring API

`StoriesDef` / `PreviewDef` lose `platform`; gain two optional fields.

```ts
export default defineStories({
  component: Button,
  group: "Design System/Forms/Button", // optional. slash-delimited sidebar path
  preset: "linkedin",                   // optional. named render preset
  viewports: { desktop: { width: 552 } }, // optional. explicit override (existing field)
  stories: {
    Primary: { variant: "primary" },
    Disabled: { disabled: true },
  },
})
```

- **`group?: string`** — slash-delimited path → nested sidebar tree. Omitted →
  the preview sits at the sidebar root, labeled by component name.
- **`preset?: string`** — names a render preset (viewport + chrome). Omitted →
  the neutral default preset (default width, neutral/transparent chrome).
- **`viewports?`** — unchanged; explicit per-preview override.

The social example becomes `group: "LinkedIn"`, `preset: "linkedin"` — explicit,
no implicit coupling between the two.

## Preset registry

Replace the `Platform` union and the two scattered lookup tables
(`DEFAULT_PLATFORM_WIDTHS` in `packages/runtime/src/preview-host.tsx`,
`PLATFORM_BG` in `apps/desktop/src/views/detached-preview.tsx`) with **one**
open registry.

```ts
type Preset = {
  name: string;
  viewport: { desktop: Viewport; mobile?: Viewport };
  chrome?: { background?: string };
};
```

- **Built-in presets** live in a single source of truth in `packages/config`
  (e.g. `presets.ts`): the existing 8 social platforms, each carrying its
  canonical desktop/mobile width + background color, merged from the two old
  tables. No behavior change for those eight.
- **Custom presets**: users register them in `openstory.config.ts`:

  ```ts
  export default defineOpenStoryConfig({
    presets: {
      dashboard: { viewport: { desktop: { width: 1280 } } },
      email:     { viewport: { desktop: { width: 600 } }, chrome: { background: "#f6f6f6" } },
    },
    previews: [buttonStories, linkedinStories],
  });
  ```

  Custom presets merge over built-ins (same name → user wins).

- **Default preset** (when `preset` omitted): a neutral built-in — a sensible
  default desktop width and a neutral chrome background (configurable via a
  `default` key in `presets`).

### Resolution order (per preview, per viewport)

`explicit viewports` > `named preset` > `default preset`.

This is resolved **in the vite-plugin at manifest-build time**, not in the
renderer — so the Electron side and the renderer never import the preset
registry. They consume already-resolved width + background, exactly as the
manifest already carries resolved values today.

## Data flow / manifest changes

`platform: string` is removed from the manifest and bridge message. In its place:

- `group: string` (normalized; empty/absent → `""` meaning root).
- A resolved render block: `{ viewport: { desktop, mobile? }, background?: string }`.

Touch points (from the platform-consumption map):

| Layer | File | Change |
|-------|------|--------|
| Types | `packages/config/src/define.ts` | drop `Platform`, `platform`; add `group?`, `preset?`; add `Preset`, `presets` on config |
| Presets | `packages/config/src/presets.ts` (new) | built-in social + default presets; merge helper |
| Manifest | `packages/vite-plugin/src/plugin.ts` | resolve preset+viewport→render block; emit `group` + render block instead of `platform` |
| Bridge | `packages/runtime/src/bridge.ts` | `ManifestMessage.previews[]`: `platform` → `group` + render block |
| Host | `packages/runtime/src/preview-host.tsx` | delete `DEFAULT_PLATFORM_WIDTHS`; read resolved viewport from manifest |
| Electron types | `apps/desktop/electron/types.ts` | `ManifestPreview.platform` → `group` + render block |
| Sidebar | `apps/desktop/src/components/sidebar.tsx` | `groupByPlatform` → recursive tree from `group` paths |
| Palette | `apps/desktop/src/components/command-palette.tsx` | search/label by `group` + story label, drop `platform` |
| Detached | `apps/desktop/src/views/detached-preview.tsx` | delete `PLATFORM_BG`; background from resolved render block, neutral fallback |
| Platforms pkg | `packages/platforms/*` | re-target to preset metadata or fold into config presets |

## Sidebar nested tree

`group` paths split on `/` into a tree. Rendering becomes recursive: nested
collapsible sections, previews as leaves. Ungrouped previews (`group === ""`)
render at the root level alongside top-level sections. Order: groups first in
first-seen order, then root-level leaves (or a single agreed order — finalize in
the plan).

## Escape hatches (non-MVP, spec'd so we don't lose the capability)

Storybook's one real advantage over our inferred controls is fine-grained
control config (`argTypes`: min/max/step, select options). To honor "fully
configurable for picky users" without taxing the common case, reserve an
**optional** `controls` override on `StoriesDef`:

```ts
controls?: Record<string, Partial<ManifestControl> & {
  min?: number; max?: number; step?: number; options?: string[];
}>;
```

Inferred controls remain the default; `controls` only overrides named props.
Not built in MVP — listed here so the type/shape is reserved.

## Testing

- `packages/config`: preset merge (user over built-in), default fallback,
  resolution order (`viewports` > `preset` > default).
- `packages/vite-plugin` (`plugin.test.ts`): manifest emits `group` + resolved
  render block; no `platform`; custom preset resolves; ungrouped preview → root.
- `apps/desktop`: sidebar builds correct nested tree from `group` paths incl.
  ungrouped; smoke test (`tests/smoke.test.ts`) updated off `platform`.
- Rewrite `examples/linkedin-starter` to `group` + `preset`; existing visual
  behavior (widths, backgrounds) unchanged.

## Risks

- **Broad mechanical change** across 9 files — but each is a direct field swap
  following the resolved-in-plugin boundary; low conceptual risk.
- **Sidebar recursion** is the only genuinely new UI logic; isolate + test it.
- **Default chrome**: social presets had opinionated backgrounds; the neutral
  default must look intentional, not broken-transparent. Pick a concrete value
  in the plan.
