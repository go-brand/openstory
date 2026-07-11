# Zero-config Framework and Runtime Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `openStory()` automatically isolate its Vite server from supported framework and runtime adapters in `openstory` mode.

**Architecture:** Add a small pure compatibility module that recognizes active adapter families from instantiated Vite plugin names, neutralizes only those families before their hooks execute, and clears application dependency-scan/warmup entries. Wire it into the existing pre-enforced plugin, then replace manual mode-gating documentation with the one-line setup.

**Tech Stack:** TypeScript 5.9, Vite 7/8 plugin API, Vitest 4, pnpm.

## Global Constraints

- Compatibility activates only when `mode === "openstory"`.
- Normal serve/build modes must preserve every consumer plugin and Vite setting.
- Built-in support initially covers TanStack Start and `@cloudflare/vite-plugin`.
- Unknown plugins remain active unless explicitly named in `compatibility.disable`.
- `compatibility.keep` wins over built-in and custom disabling.
- `openStory()` remains argument-free for the default path.
- OpenStory must appear before framework/runtime adapters in the documented plugin list.

---

### Task 1: Detect and neutralize supported plugin families

**Files:**
- Create: `packages/vite-plugin/src/compatibility.ts`
- Create: `packages/vite-plugin/src/compatibility.test.ts`
- Modify: `packages/vite-plugin/src/plugin.ts`

**Interfaces:**
- Produces: `OpenStoryCompatibilityOptions` with `disable?: string[]` and `keep?: string[]`.
- Produces: `applyOpenStoryCompatibility(config: UserConfig, options?: OpenStoryCompatibilityOptions): string[]`, returning disabled plugin names.
- Consumes: the existing `PluginOptions` in `plugin.ts`, extended with `compatibility?: OpenStoryCompatibilityOptions`.

- [ ] **Step 1: Write failing family-detection tests**

Create fixtures with named Vite plugins and hook spies. Assert that a
`tanstack-react-start:config` marker enables suppression of the complete Start
family, including its bundled Router generator/code-splitter names, while those
generic Router names remain active without the Start marker. Assert that
`vite-plugin-cloudflare` enables suppression of itself and every
`vite-plugin-cloudflare:*` sibling. Assert unrelated plugins remain untouched.

- [ ] **Step 2: Write failing option and hook-order tests**

Assert exact names in `compatibility.disable` are suppressed, exact names in
`compatibility.keep` remain active, and `keep` wins. Exercise a captured config
hook to prove a disabled plugin receives a no-op config handler instead of an
undefined handler, while later config/environment/server/transform hooks are
removed.

- [ ] **Step 3: Run the focused tests and confirm red**

Run:

```bash
pnpm --filter @gobrand/openstory-vite exec vitest run src/compatibility.test.ts
```

Expected: failure because `compatibility.ts` and its exports do not exist.

- [ ] **Step 4: Implement the pure compatibility module**

Flatten `config.plugins`, collect plugin names, and activate family rules only
when their marker exists. TanStack Start's marker is
`tanstack-react-start:config`; its owned names include
`tanstack-react-start:*`, `tanstack-start-core:*`, `tanstack-start:*`, and the
Router generator/code-splitter plugins present in the same instantiated list.
Cloudflare's marker is `vite-plugin-cloudflare`; its owned names are the marker
and `vite-plugin-cloudflare:*`.

For each selected plugin object, preserve `name`, replace an existing `config`
hook with a no-op handler, and remove all other enumerable Vite/Rollup hooks so
Vite's already-captured config queue stays callable but later pipelines cannot
run the adapter. Do not mutate plugins selected by `keep`.

- [ ] **Step 5: Wire compatibility into `openStory()`**

Import the module in `plugin.ts`, export `PluginOptions`, add
`compatibility?: OpenStoryCompatibilityOptions`, and add a pre-ordered `config`
hook. Call `applyOpenStoryCompatibility` only for `openstory` mode. Preserve the
current `enforce: "pre"` behavior and all existing harness hooks.

- [ ] **Step 6: Run focused and package tests**

Run:

```bash
pnpm --filter @gobrand/openstory-vite exec vitest run src/compatibility.test.ts src/plugin.test.ts
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/vite-plugin/src/compatibility.ts packages/vite-plugin/src/compatibility.test.ts packages/vite-plugin/src/plugin.ts
git commit -m "feat: isolate OpenStory from Vite pipeline owners"
```

### Task 2: Normalize OpenStory optimizer and warmup config

**Files:**
- Modify: `packages/vite-plugin/src/compatibility.ts`
- Modify: `packages/vite-plugin/src/compatibility.test.ts`

**Interfaces:**
- Extends: `applyOpenStoryCompatibility(config, options)` from Task 1.

- [ ] **Step 1: Write failing config-normalization tests**

Start with root `optimizeDeps.entries`, client environment entries, warmup
client/SSR files, include/exclude arrays, resolve aliases, and unrelated server
settings. Assert entries and warmup files become empty while includes, excludes,
aliases, and unrelated settings remain byte-for-byte equivalent. Assert calling
the OpenStory plugin config hook outside `openstory` mode makes no mutations.

- [ ] **Step 2: Run focused tests and confirm red**

Run:

```bash
pnpm --filter @gobrand/openstory-vite exec vitest run src/compatibility.test.ts
```

Expected: the new normalization assertions fail.

- [ ] **Step 3: Implement direct array normalization**

In `applyOpenStoryCompatibility`, set `config.optimizeDeps.entries = []` when
root optimize-deps config exists; set explicit
`config.environments.client.optimizeDeps.entries = []`; and replace existing
`server.warmup.clientFiles` / `server.warmup.ssrFiles` with empty arrays. Do not
create unrelated config branches and do not modify include/exclude lists.

- [ ] **Step 4: Add a real Vite lifecycle regression test**

Use Vite's `resolveConfig` with `openStory()` placed before fake TanStack Start
and Cloudflare families whose config hooks throw. Assert resolution succeeds in
`openstory` mode, normalized entries are empty, and unrelated plugin hooks still
run. Resolve an equivalent normal-mode config and assert the fake adapter hooks
run, demonstrating OpenStory did not suppress them.

- [ ] **Step 5: Run package tests and typecheck**

Run:

```bash
pnpm --filter @gobrand/openstory-vite test
pnpm --filter @gobrand/openstory-vite typecheck
```

Expected: both commands pass.

- [ ] **Step 6: Commit**

```bash
git add packages/vite-plugin/src/compatibility.ts packages/vite-plugin/src/compatibility.test.ts
git commit -m "fix: disable application scans in OpenStory mode"
```

### Task 3: Simplify setup documentation and verify the real consumer

**Files:**
- Modify: `README.md`
- Modify: `packages/vite-plugin/README.md`
- Modify: `apps/www/src/content/docs/getting-started.mdx` if the setup copy is present there; otherwise update the current website source found by `rg`.

**Interfaces:**
- Documents: `openStory({ compatibility: { disable, keep } })` from Task 1.

- [ ] **Step 1: Locate every public manual-gating instruction**

Run:

```bash
rg -n "isOpenStory|mode.*openstory|optimizeDeps.*entries|tanstackStart\(\)|cloudflare\(\)|framework middleware" README.md packages apps/www
```

Expected: list every public setup example and explanatory note that must agree.

- [ ] **Step 2: Replace setup copy with the one-line integration**

Show a normal Vite config with `openStory()` before TanStack Start and
Cloudflare. Describe TanStack Start as a framework plugin and Cloudflare as a
runtime/platform plugin. State that supported pipeline owners are isolated only
in `openstory` mode. Add a short advanced example using exact plugin names in
`compatibility.disable` and `compatibility.keep`; do not make it part of the
primary path.

- [ ] **Step 3: Run documentation consistency checks**

Run:

```bash
rg -n "isOpenStory|isOpenstory|optimizeDeps:\s*\{\s*entries" README.md packages/vite-plugin/README.md apps/www
```

Expected: no manual OpenStory gating remains in public setup documentation.

- [ ] **Step 4: Verify the real TanStack Start plus Cloudflare checkout**

Temporarily point `/Users/rubencostamartinez/Desktop/tanstack-start/apps/app`
at the local built plugin, simplify its Vite config to the documented plugin
list, and launch Vite in `openstory` mode on an ephemeral port. Request
`/__pl__/` and `/__pl__/manifest.json`; both must return successful OpenStory
responses without optimizer virtual-module errors. Restore the consumer's
original files immediately after the check and confirm its git diff matches the
pre-check state.

- [ ] **Step 5: Run full repository verification**

Run:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add README.md packages/vite-plugin/README.md apps/www
git commit -m "docs: reduce Vite setup to openStory"
```
