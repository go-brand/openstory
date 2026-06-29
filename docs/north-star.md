# North Star: a better Storybook

> **Mission:** make developers happy and make them fast as hell — a Storybook
> alternative that gets out of the way. Every decision is judged by: does this
> make a dev's day better and their loop tighter?

OpenStory is **the Storybook people actually want** — a tool you point at any
repo to compile its **design system (components + stories)** and **docs
(markdown)** into a desktop app. Simple as hell by default, automatic to set up,
fully configurable when a picky user needs it. It is not tied to any kind of
component or domain; render width + background are just a named `preset`. (Later:
document more than design systems.)

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
| 8 | **Rigid taxonomy** — our own old sin: a hardcoded social `platform` enum | Free-form nested `group` hierarchy + optional render `preset` (viewport/chrome). | ✅ |
| 9 | **Docs are a second system** — MDX, separate tooling | `*.stories.md` discovered alongside stories; live components embed inline via `:::story`. No separate docs pipeline. | ✅ |

Legend: ✅ done · 🟡 partial · 🔴 actively building · ⚪ not started · 🟢 goal

## Design principles

1. **Zero-config default, full-config escape hatch.** A button with no metadata
   must Just Work. A 500-component design system must be able to control
   grouping, viewports, chrome, and ordering.
2. **Plain data over DSL.** Stories are prop objects. Grouping is a string.
   Nothing requires learning an imperative API.
3. **No new bundler, no addon registry.** Inherit the project's Vite, Tailwind,
   aliases, and providers. Features ship in core.
4. **Domain-agnostic core.** OpenStory knows nothing about what it renders.
   Render width + background are a named `preset` a project declares; the core
   ships only a neutral `default`.
