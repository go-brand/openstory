# OpenStory website design

## Goal

Create a small public website that explains OpenStory and gives developers a credible path from discovery to their first rendered story. The first release should be easy to maintain and honest about the desktop manager not yet having a public installer.

## Audience and job

The primary audience is a frontend developer using Vite who wants a lighter component workbench and living-docs workflow than Storybook. The homepage has one job: make the product legible enough that the developer chooses **Get started**. The documentation then gets them from an existing Vite project to a first story with the fewest necessary concepts.

## Architecture

Add `apps/www` to the existing pnpm/Turborepo workspace. Reuse the established website stack from Tiempo and Temporal Calendar:

- TanStack Start for routing and rendering
- Fumadocs for MDX content, documentation layout, and search-ready structure
- Tailwind CSS for styling
- Cloudflare's Vite plugin and Wrangler configuration for deployment

The website remains its own workspace package and does not import desktop application code. Shared visual language is reproduced through website tokens so the marketing surface cannot destabilize the desktop app.

Initial routes:

- `/` — product landing page
- `/docs` — introduction and documentation index
- `/docs/installation` — installation and Vite setup
- `/docs/first-story` — create and open the first story
- `/api/search` — Fumadocs search endpoint, included by the shared scaffold

Deployment should support a configurable base path. The initial Cloudflare configuration may target `eng.gobrand.app/openstory`, matching the existing GoBrand engineering sites, but deployment is not required for the first implementation unless explicitly requested.

## Homepage

The homepage uses the Fumadocs home layout for consistent navigation and a custom, compact landing body.

### Navigation

- OpenStory wordmark
- Docs
- GitHub
- Primary **Get started** action

No pricing, blog, changelog, testimonials, newsletter, or account actions are included.

### Hero

Headline:

> Your components, stories, and docs—running in your real Vite app.

Supporting copy explains that OpenStory discovers colocated stories and Markdown docs, renders real project components with their existing CSS and providers, and presents them in a dedicated desktop workbench.

Actions:

- **Get started** → `/docs/installation`
- **View on GitHub** → the OpenStory repository

The hero visual is a simplified OpenStory window: compact graphite application chrome around a component canvas, sidebar tree, and controls edge. It is a faithful static product illustration, not a fake interactive demo or a screenshot that can quickly become stale.

### Explanation

Below the hero, one short section explains the real architecture in user terms:

1. Add the Vite plugin.
2. Write a colocated story.
3. Open the project in OpenStory.

A final narrow callout introduces the agent surface: the same stories are available through render URLs and a read-only MCP server. This stays secondary to the human workflow and links to the introduction rather than expanding into a large feature grid.

## Documentation

The first documentation hierarchy is deliberately shallow.

### Introduction

Explain what OpenStory is, when it is useful, and the manager/harness boundary in plain language. State current constraints: Vite is required, framework plugins may need to be disabled in `openstory` mode, and the desktop manager is not yet publicly distributed.

### Installation

Show a mocked but technically accurate package install command for the two direct project dependencies:

- `@gobrand/openstory-config`
- `@gobrand/openstory-vite`

`@gobrand/openstory-runtime` is installed transitively by the Vite plugin and should be explained in the architecture page, not presented as a third dependency users must manage.

Then show the minimal `vite.config.ts` integration, including the `openstory` mode gate for framework plugins. A clearly labeled manager step says the public desktop download is coming soon and gives a source-development path only if it is already valid in the repository.

The page must not claim that a public desktop installer, Homebrew formula, or standalone CLI exists until one is actually published.

### Your first story

Show a small `Button.stories.tsx` using `defineStories`, explain discovery conventions, then finish with **Open a project…** and the expected sidebar result. Optional project configuration is linked or briefly noted, not introduced before the first success state.

## Visual direction

The website should feel like the OpenStory desktop tool:

- **App graphite** `#1b1c1d` — primary dark chrome and hero field
- **Raised graphite** `#222425` — panels and code surfaces
- **Canvas white** `#ffffff` — component preview canvas
- **Focus blue** `#3b82f6` — primary action and active state
- **Cool border** `#e3e8ee` — light separators
- **Muted steel** `#9aa4ad` — secondary text on dark surfaces

Typography uses a clean, compact sans-serif for content and a monospaced utility face for file names, commands, and small application labels. The product-window illustration is the single signature element; surrounding sections remain quiet and typographic. Motion is limited to subtle entrance or hover treatment and must respect `prefers-reduced-motion`.

The site supports dark and light documentation surfaces through Fumadocs, while the hero illustration retains OpenStory's graphite chrome in either theme.

## Content and state boundaries

All launch content is local MDX or route content. There is no database, CMS, analytics integration, authentication, form submission, or runtime dependency on the desktop app. External links are limited to GitHub and, when available, the real download artifact.

The website should use precise present-tense claims only for features confirmed by the repository. Unreleased distribution steps are labeled **Coming soon**. Code blocks are copyable and use commands that do not imply unpublished package versions are available.

## Accessibility and responsive behavior

- One visible heading hierarchy per page
- Keyboard-visible focus states for navigation, actions, and copy controls
- Sufficient text and control contrast
- Semantic navigation, main, section, and code structures
- Mobile layout collapses the hero into copy followed by the product window
- No horizontal page overflow at 320 CSS pixels
- Motion disabled or simplified for reduced-motion users

## Verification

The implementation is complete when:

- the website workspace installs within the existing monorepo
- Fumadocs content generation and TypeScript checks pass
- the production build succeeds
- `/`, `/docs`, `/docs/installation`, and `/docs/first-story` render directly
- internal links and configured base-path assets resolve correctly
- the landing page is usable at desktop and mobile widths
- install copy distinguishes working repository setup from mocked public distribution

Automated UI behavior is intentionally minimal. Verification should emphasize build/type correctness, route rendering, link integrity, and a manual responsive/accessibility pass rather than adding a large browser-test suite for a mostly static first release.

## Out of scope

- Publishing or signing the desktop manager
- Creating a Homebrew formula or installer service
- Interactive component rendering on the marketing site
- Full API reference generation
- Versioned documentation
- Blog, changelog, pricing, accounts, analytics, or CMS
- Deployment unless separately requested
