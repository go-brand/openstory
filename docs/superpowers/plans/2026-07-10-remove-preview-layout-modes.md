# Remove Preview Layout Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the padded/centered/fullscreen layout feature end to end while preserving measured story previews and component/story `previewPadding`.

**Architecture:** Collapse runtime rendering onto the existing measured shrink-wrap path and delete layout from every public and internal contract. Keep `PreviewPadding` flowing config -> manifest -> runtime wrapper unchanged. Docs and feature pages retain their full-canvas host behavior because that behavior is selected by render mode, not layout.

**Tech Stack:** TypeScript 5.9, React 19, Electron, Vite, Vitest, pnpm/Turborepo.

## Global Constraints

- `previewPadding` remains supported at component and story level and contributes to measured size.
- This is a clean removal: no deprecated, ignored, or hidden `layout` field remains in active code.
- Historical plans/specs remain unchanged; active README and product documentation are updated.
- Final verification is `pnpm typecheck`, `pnpm test`, `pnpm lint`, and `pnpm build`.

---

### Task 1: Collapse the config, manifest, and runtime contracts

**Files:**
- Modify: `packages/config/src/define.ts`
- Modify: `packages/config/src/index.ts`
- Modify: `packages/runtime/src/bridge.ts`
- Modify: `packages/runtime/src/preview-host.tsx`
- Modify: `packages/runtime/src/preview-host.layout.test.tsx`
- Modify: `packages/runtime/src/preview-host.url.test.tsx`
- Modify: `packages/vite-plugin/src/assemble-manifest.ts`
- Modify: `packages/vite-plugin/src/plugin.test.ts`

**Interfaces:**
- Consumes: existing `PreviewPadding` and `pl:size` contracts.
- Produces: config and render contracts with no `Layout` type/property; `MeasuredStage` always shrink-wraps and applies optional preview padding.

- [ ] **Step 1: Revise runtime tests to require the single measured layout**

Replace layout-variant assertions with assertions that `PreviewStage` always renders an inline-block measuring wrapper, applies component/story padding, reports measured size, and ignores no hidden layout branch. Revise URL tests so `readSelectionFromUrl()` returns only `componentId`, `storyId`, and `viewport` even when a `layout` query parameter is present.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm --filter @gobrand/openstory-runtime test -- preview-host.layout.test.tsx preview-host.url.test.tsx`

Expected: FAIL because runtime/config contracts still expose and interpret layout modes.

- [ ] **Step 3: Remove layout from config and runtime implementation**

Delete `Layout`, all `layout` properties, URL validation, layout bridge fields, and fullscreen/centered rendering branches. Keep `previewPaddingStyle()`. Make `MeasuredStage` unconditionally render:

```tsx
<div ref={ref} style={{ display: "inline-block", verticalAlign: "top", ...paddingStyle }}>
  <div style={{ width, maxWidth: "100%" }}>{children}</div>
</div>
```

Keep docs/page hosts full-canvas based on render mode. Remove manifest layout serialization while retaining both component and fixture `previewPadding` serialization.

- [ ] **Step 4: Run config, runtime, and Vite-plugin tests**

Run: `pnpm --filter @gobrand/openstory-config test && pnpm --filter @gobrand/openstory-runtime test && pnpm --filter @gobrand/openstory-vite test`

Expected: PASS with zero layout-mode assertions and passing preview-padding coverage.

### Task 2: Remove desktop selection and toolbar layout behavior

**Files:**
- Modify: `apps/desktop/electron/types.ts`
- Modify: `apps/desktop/electron/selection.ts`
- Modify: `apps/desktop/electron/ipc.ts`
- Modify: `apps/desktop/electron/store.ts`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/components/toolbar.tsx`
- Modify: `apps/desktop/src/lib/use-harness-bridge.ts`
- Modify: `apps/desktop/src/views/main-app.tsx`
- Modify: affected desktop fixtures/tests returned by `rg -l '\blayout\b|preview:setLayout' apps/desktop`

**Interfaces:**
- Consumes: layout-free manifest and runtime `RenderMessage` from Task 1.
- Produces: layout-free `ActiveSelection`, IPC surface, toolbar, and render bridge.

- [ ] **Step 1: Revise desktop tests to use layout-free fixtures and messages**

Remove fixture defaults such as `layout: "padded"`; add an IPC/selection assertion where appropriate that the only preview mutations are story, viewport, props, docs, and page selection. Preserve tests for `contentSize` measured sizing and the `"fill"` state used by docs/page transitions.

- [ ] **Step 2: Run desktop tests and verify RED**

Run: `pnpm --filter @gobrand/openstory-desktop test`

Expected: FAIL on remaining layout properties/handlers or snapshots.

- [ ] **Step 3: Delete desktop layout state and UI**

Delete the toolbar `<select aria-label="Layout">`, its `Layout` import, effective-layout calculation, and `preview:setLayout` invocation. Remove `selection.layout`, its reset/update logic, the IPC handler, manifest `layout`, and bridge forwarding. Keep measured story sizing; simplify comments so `"fill"` refers only to docs/pages rather than fullscreen layouts.

- [ ] **Step 4: Run desktop tests**

Run: `pnpm --filter @gobrand/openstory-desktop test`

Expected: PASS.

### Task 3: Remove MCP/URL documentation and verify the repository

**Files:**
- Modify: `packages/vite-plugin/src/mcp-server.ts`
- Modify: `packages/vite-plugin/src/mcp-server.test.ts`
- Modify: `README.md`
- Modify: `apps/desktop/src/docs/how-the-mcp-works.stories.md`
- Modify: active source/test fixtures returned by `rg -n '\blayout\b|preview:setLayout|layout=' apps packages README.md`

**Interfaces:**
- Consumes: layout-free headless preview URL from Task 1.
- Produces: MCP render input and URL without a layout option; current documentation matching the API.

- [ ] **Step 1: Revise MCP tests to reject the old contract**

Remove the `layout` input from render tool fixtures and assert generated preview URLs contain component, story, viewport, and theme but no `layout=` parameter.

- [ ] **Step 2: Run Vite-plugin tests and verify RED**

Run: `pnpm --filter @gobrand/openstory-vite test -- mcp-server.test.ts`

Expected: FAIL while `mcp-server.ts` still accepts/appends layout.

- [ ] **Step 3: Remove MCP layout input and active documentation**

Delete layout schema validation, URL construction, and active README/docs references. Use targeted search to remove remaining active code references while leaving historical `docs/superpowers/plans` and `docs/superpowers/specs` intact.

- [ ] **Step 4: Verify absence and preserved padding**

Run: `rg -n '\bLayout\b|preview:setLayout|layout=|\blayout\??:' apps packages README.md`

Expected: no preview-layout feature matches. Then run `rg -n 'previewPadding' packages/config packages/runtime packages/vite-plugin apps/desktop` and confirm config, serialization, runtime application, and tests remain.

- [ ] **Step 5: Run full verification**

Run: `pnpm typecheck && pnpm test && pnpm lint && pnpm build`

Expected: all commands exit 0.

- [ ] **Step 6: Commit implementation**

Run: `git add README.md apps packages docs/superpowers/plans/2026-07-10-remove-preview-layout-modes.md && git commit -m "refactor: remove preview layout modes"`
