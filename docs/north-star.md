# North Star: a better Storybook

OpenStory started as a live preview tool for social-media post components. The
goal now is broader: **be the Storybook people actually want** — a component
workbench that is _simple as hell by default_, automatic to set up, and fully
configurable when a picky user needs it. Social-platform previews become one
preset pack on top of a general component workbench, not the whole product.

## The bet

Storybook is the default, but people complain about it constantly and keep
reaching for lighter tools (Ladle, Histoire, StoryLite, "a hidden page in the
app"). OpenStory wins by deleting the tax Storybook charges — config, addons,
yearly breaking upgrades — while keeping the one thing that matters: an isolated,
live, navigable view of every component state.

## Storybook pains we exist to kill

Every item here is a thing real users complain about. We tackle all of them.
When we add a feature, it should move one of these from ❌ to ✅.

| # | Storybook pain | OpenStory answer | Status |
|---|----------------|------------------|--------|
| 1 | **Config tax** — `.storybook/`, bundler config, addon wiring before you see anything | One config file + one Vite plugin. Zero-config default; deep config only if you ask. | 🟡 partial |
| 2 | **Slow HMR / build** — 1–2s typical, 10–15s in big repos | Reuse the project's own Vite dev server + native HMR. No second bundler. | ✅ |
| 3 | **Maintenance drift** — a story per state goes stale as the app grows | Fixtures are plain prop objects; controls are _derived_ from them, not hand-declared. | 🟡 partial |
| 4 | **Yearly breaking majors** — CSF rewrites, MDX 1→2→3, storiesOf removal | Pre-1.0 we change the surface freely to get it right; post-1.0, a small stable authoring API we earn upgrades on, not force. | 🟡 goal |
| 5 | **Addon dependency hell** — addons break across majors, lockfile churn | No addon ecosystem to version-match. Core features are built in. | ✅ |
| 6 | **Boilerplate** — verbose `argTypes`, imperative CSF | `defineStories({ component, stories: { Name: props } })`. Controls inferred. | ✅ |
| 7 | **"Overkill" / separate environment** — people ditch SB for a hidden in-app page | Point the desktop app at any repo; no app to host, no route to wire. | ✅ |
| 8 | **Rigid taxonomy** — our own old sin: a hardcoded social `platform` enum | Free-form nested `group` hierarchy + optional render `preset` (viewport/chrome). | 🔴 in design |
| 9 | **Docs are a second system** — MDX, separate tooling | (Later) notes/markdown per story inline, no separate docs pipeline. | ⚪ later |

Legend: ✅ done · 🟡 partial · 🔴 actively building · ⚪ not started · 🟢 goal

## Design principles

1. **Zero-config default, full-config escape hatch.** A button with no metadata
   must Just Work. A 500-component design system must be able to control
   grouping, viewports, chrome, and ordering.
2. **Plain data over DSL.** Stories are prop objects. Grouping is a string.
   Nothing requires learning an imperative API.
3. **No new bundler, no addon registry.** Inherit the project's Vite, Tailwind,
   aliases, and providers. Features ship in core.
4. **Social is a preset, not the model.** LinkedIn/X/etc. are built-in presets
   (viewport + chrome). They must keep working unchanged through the refactor.
