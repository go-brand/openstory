# OpenStory Homepage Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the decorative OpenStory homepage with a flat, restrained Tiempo-style landing page while preserving the existing docs and website infrastructure.

**Architecture:** Keep the existing Fumadocs `HomeLayout` and three focused landing components. Delete the fabricated product-window component, simplify each remaining component to direct copy and real installation code, and replace the bespoke 960-line landing stylesheet with a small set of flat layout rules layered on Fumadocs.

**Tech Stack:** React 19, TanStack Router, Fumadocs, Tailwind CSS 4, plain CSS

## Global Constraints

- The homepage uses one flat background per theme.
- No grid texture, gradient, perspective transform, fabricated mockup, decorative terminal, statistics strip, or ornamental feature card.
- Use a conventional responsive heading scale comparable to Tiempo: `2.5rem` through `3.75rem`.
- Preserve the real headline, direct install command, documentation link, three-step workflow, and secondary agent explanation.
- Keep the desktop download labeled **Coming soon**.
- Do not change documentation content, routes, build configuration, or deployment configuration.
- Preserve keyboard focus, copy-button labeling, reduced-motion handling, and zero horizontal overflow at 320 CSS pixels.

---

### Task 1: Remove the fabricated product surface

**Files:**

- Delete: `apps/www/src/components/landing/openstory-window.tsx`
- Modify: `apps/www/src/components/landing/hero.tsx`
- Modify: `apps/www/src/components/landing/agent-callout.tsx`

**Interfaces:**

- Produces: `Hero` with the install command and primary docs link; `AgentCallout` as plain text without decorative UI.

- [ ] **Step 1: Delete the product-window component**

Remove `openstory-window.tsx` and every import or class reference associated with the fabricated manager UI.

- [ ] **Step 2: Simplify the hero**

Render a constrained hero containing the existing headline, one explanatory paragraph, a real command block for `pnpm add -D @gobrand/openstory-config @gobrand/openstory-vite`, a labeled copy button, a **Read the docs** link to the installation page, and one quiet availability line. Do not render a mockup, eyebrow decoration, buttons styled as large CTAs, or background effects.

- [ ] **Step 3: Simplify the agent section**

Keep the agent heading, one paragraph, and the documentation link. Delete the fake terminal and all decorative status dots or command output.

- [ ] **Step 4: Confirm the removed surface has no references**

Run: `rg -n "OpenStoryWindow|product-window|agent-terminal|terminal-bar" apps/www/src || true`

Expected: no matches.

### Task 2: Flatten the workflow section and stylesheet

**Files:**

- Modify: `apps/www/src/components/landing/getting-started.tsx`
- Replace: `apps/www/src/styles/app.css`
- Modify: `docs/superpowers/specs/2026-07-11-openstory-www-design.md`

**Interfaces:**

- Consumes: the simplified landing components from Task 1.
- Produces: a flat responsive homepage with Fumadocs theme support.

- [ ] **Step 1: Simplify the workflow component**

Keep the three real steps and their filenames, but render them as a plain bordered list under a compact heading. Remove floating code pills and multi-column editorial layout.

- [ ] **Step 2: Replace the landing CSS**

Keep the three Fumadocs imports and define only the shared wordmark, flat page shell, constrained sections, conventional type scale, install command, simple link/focus states, bordered workflow rows, plain agent section, manager status callout, not-found view, mobile layout, reduced motion, and `html.dark` color overrides. Keep the file below 400 lines.

- [ ] **Step 3: Correct the responsive design spec**

Replace the stale requirement “Mobile layout collapses the hero into copy followed by the product window” with “Mobile layout keeps the hero, install command, workflow, and agent copy in one readable column.”

- [ ] **Step 4: Format and typecheck**

Run: `pnpm exec oxfmt apps/www/src docs/superpowers/specs/2026-07-11-openstory-www-design.md docs/superpowers/plans/2026-07-11-openstory-homepage-simplification.md && pnpm --filter @gobrand/openstory-www typecheck`

Expected: formatting succeeds and TypeScript exits 0.

### Task 3: Verify and commit the redesign

**Files:**

- Modify only files with issues found during verification.

**Interfaces:**

- Consumes: the complete simplified homepage.
- Produces: verified browser behavior and a committed redesign on `staging`.

- [ ] **Step 1: Build and run repository checks**

Run: `pnpm --filter @gobrand/openstory-www build && pnpm test && pnpm lint && git diff --check`

Expected: the build prerenders the homepage and three docs routes, 291 existing tests pass, and lint reports zero warnings and zero errors.

- [ ] **Step 2: Inspect desktop and mobile layouts**

Run the website at `http://localhost:3002/openstory/`. At 1280×720 and 320×800, verify the flat background, readable type scale, absence of fabricated UI, no horizontal overflow, visible focus, both themes, and correct installation/docs links.

- [ ] **Step 3: Verify the copy command**

Activate **Copy install command** and confirm the clipboard contains `pnpm add -D @gobrand/openstory-config @gobrand/openstory-vite`.

- [ ] **Step 4: Review scope and CSS size**

Run: `wc -l apps/www/src/styles/app.css && git diff --stat && git diff --check`

Expected: CSS is below 400 lines and changes are limited to the homepage, revised spec, and implementation plan.

- [ ] **Step 5: Commit**

```bash
git add apps/www/src docs/superpowers/specs/2026-07-11-openstory-www-design.md docs/superpowers/plans/2026-07-11-openstory-homepage-simplification.md
git commit -m "refactor: simplify OpenStory homepage"
```
