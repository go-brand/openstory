# Localhost Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-accessible OpenStory manager served from a consumer project's `vite --mode openstory` dev server at `/__pl__/manager`, while keeping the Electron manager UI shared.

**Architecture:** Introduce a published `@gobrand/openstory-manager` package that contains the shared React manager UI, shared manager types, Electron adapter helpers, and browser adapter. The Electron app imports that package for its renderer; `@gobrand/openstory-vite` serves the manager package's browser entry plus a scoped source route. Existing `/__pl__/` preview harness, `/__pl__/manifest.json`, `/__pl__/mcp`, and headless render URL behavior remain intact.

**Tech Stack:** pnpm workspace, Turborepo, TypeScript 5.9, React 19, Vite 8 in the desktop app, Vite 7/8 peer support in the plugin, Vitest, Electron 38, Tailwind CSS 4.

## Global Constraints

- The local project command is `vite --mode openstory`; users may add normal Vite flags such as `--port 4000`.
- The browser manager route is `/__pl__/manager`.
- The existing preview harness route remains `/__pl__/`.
- The existing agent render URL contract at `/__pl__/?component=...` must not change.
- Browser mode has one active project with `projectId: "local"`.
- Browser mode must hide repository add/remove/select controls and pop-out/detached overlay controls.
- Browser source reads must only return files inside the active Vite project root and must keep the existing 256 KiB source cap.
- Do not revert or overwrite unrelated dirty work. At the time this plan was written, `apps/desktop/src/lib/use-harness-bridge.ts` and `apps/desktop/src/styles.css` were already modified.
- Use `apply_patch` for manual edits.

---

## File Structure

Create:

- `packages/manager/package.json` - published package manifest for `@gobrand/openstory-manager`.
- `packages/manager/tsconfig.json` - package build config.
- `packages/manager/vitest.config.ts` - jsdom-capable tests for manager code.
- `packages/manager/src/index.ts` - package exports for shared types and app entry helpers.
- `packages/manager/src/types.ts` - shared `AppState`, manifest, selection, IPC-like channel, and `ManagerApi` types.
- `packages/manager/src/selection.ts` - moved shared `reconcileSelection` and `defaultMode`.
- `packages/manager/src/api.ts` - `ManagerSurface`, `ManagerApi`, `getElectronApi`.
- `packages/manager/src/browser-api.ts` - browser manager state adapter.
- `packages/manager/src/browser-api.test.ts` - browser adapter tests.
- `packages/manager/src/main.tsx` - browser manager React entry.
- `packages/manager/src/App.tsx` - moved shared app root.
- `packages/manager/src/**/*.tsx` and `packages/manager/src/**/*.ts` - moved shared UI/components/libs from `apps/desktop/src`.
- `packages/vite-plugin/src/manager-loader.ts` - manager HTML shell and module entry helpers.
- `packages/vite-plugin/src/manager-source.ts` - scoped source route helper.
- `packages/vite-plugin/src/manager-source.test.ts` - source route helper tests.

Modify:

- `apps/desktop/src/main.tsx` - import `App` and CSS from the manager package.
- `apps/desktop/src/App.tsx` - delete after the manager package owns the shared app root.
- `apps/desktop/src/lib/api.ts` - delete after the manager package owns the shared API type.
- `apps/desktop/electron/types.ts` - re-export shared manager types or import them from `@gobrand/openstory-manager`.
- `apps/desktop/electron/selection.ts` - re-export from `@gobrand/openstory-manager/selection` or delete after updating imports.
- `apps/desktop/electron/ipc.ts` - import shared types and selection helpers from manager package.
- `apps/desktop/tsconfig.json` - include only Electron renderer entry files that remain in the desktop app.
- `apps/desktop/package.json` - depend on `@gobrand/openstory-manager`.
- `apps/desktop/electron.vite.config.ts` - keep renderer build pointed at `apps/desktop/index.html`; no plugin route changes here.
- `packages/vite-plugin/package.json` - depend on `@gobrand/openstory-manager`.
- `packages/vite-plugin/src/plugin.ts` - serve `/__pl__/manager` and `/__pl__/manager/source`.
- `packages/vite-plugin/src/plugin.test.ts` - add manager-loader assertions.
- `README.md` - document `story:dev` and `/__pl__/manager`.

---

### Task 1: Create Shared Manager Package Skeleton And Types

**Files:**
- Create: `packages/manager/package.json`
- Create: `packages/manager/tsconfig.json`
- Create: `packages/manager/vitest.config.ts`
- Create: `packages/manager/src/types.ts`
- Create: `packages/manager/src/selection.ts`
- Create: `packages/manager/src/api.ts`
- Create: `packages/manager/src/index.ts`
- Create: `packages/manager/src/selection.test.ts`
- Modify: `apps/desktop/electron/types.ts`
- Modify: `apps/desktop/electron/selection.ts`
- Modify: `apps/desktop/electron/ipc.ts`
- Modify: `apps/desktop/package.json`

**Interfaces:**
- Consumes: current shapes from `apps/desktop/electron/types.ts` and current helpers from `apps/desktop/electron/selection.ts`.
- Produces:
  - `ManagerSurface = "desktop" | "browser"`
  - `ManagerApi`
  - shared `AppState`, `IpcInvoke`, `IpcEvents`, `ManifestComponent`, `ManifestDoc`, `ActiveSelection`, `ProjectRecord`, `PreviewSource`
  - `reconcileSelection(manifest: ManifestComponent[], selection: Pick<ActiveSelection, "componentId" | "storyId">): SelectionPatch | null`
  - `defaultMode(current: "design" | "docs", componentCount: number, docCount: number): "design" | "docs"`

- [ ] **Step 1: Write the package manifest**

Create `packages/manager/package.json`:

```json
{
  "name": "@gobrand/openstory-manager",
  "version": "0.5.0",
  "description": "Shared OpenStory manager UI for Electron and browser-hosted project mode",
  "private": false,
  "publishConfig": {
    "access": "public"
  },
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./selection": {
      "types": "./dist/selection.d.ts",
      "import": "./dist/selection.js"
    },
    "./styles.css": "./dist/styles.css"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/go-brand/openstory.git",
    "directory": "packages/manager"
  },
  "bugs": {
    "url": "https://github.com/go-brand/openstory/issues"
  },
  "homepage": "https://github.com/go-brand/openstory#readme",
  "keywords": [
    "openstory",
    "manager",
    "storybook",
    "component-preview"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "dev": "tsc -p tsconfig.json --watch",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@base-ui/react": "1.5.0",
    "@hugeicons/core-free-icons": "^4.2.0",
    "@hugeicons/react": "^1.1.6",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.6.0"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "19.2.7",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "6.0.3",
    "jsdom": "^29.1.1",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "typescript": "5.9.3",
    "vitest": "4.0.18"
  }
}
```

- [ ] **Step 2: Write package TypeScript and Vitest config**

Create `packages/manager/tsconfig.json`:

```json
{
  "extends": "../../tooling/tsconfig/react.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["**/*.test.ts", "**/*.test.tsx"]
}
```

Create `packages/manager/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
  },
});
```

- [ ] **Step 3: Write the shared type test first**

Create `packages/manager/src/selection.test.ts` by copying the behavioral tests from `apps/desktop/electron/selection.test.ts`, changing imports to local package files:

```ts
import { describe, it, expect } from "vitest";
import type { ManifestComponent } from "./types";
import { reconcileSelection, defaultMode } from "./selection";

const manifest: ManifestComponent[] = [
  {
    id: "button",
    name: "Button",
    group: "",
    section: null,
    background: "#fff",
    layout: "padded",
    stories: [
      { id: "primary", label: "Primary", props: {} },
      { id: "secondary", label: "Secondary", props: {} },
    ],
    controls: [],
    sourcePath: "/project/src/button.tsx",
  },
  {
    id: "card",
    name: "Card",
    group: "",
    section: null,
    background: "#fff",
    layout: "padded",
    stories: [{ id: "basic", label: "Basic", props: {} }],
    controls: [],
    sourcePath: "/project/src/card.tsx",
  },
];

describe("reconcileSelection", () => {
  it("keeps a valid selection", () => {
    expect(reconcileSelection(manifest, { componentId: "button", storyId: "primary" })).toBeNull();
  });

  it("falls back to the first story when the component is missing", () => {
    expect(reconcileSelection(manifest, { componentId: "missing", storyId: "primary" })).toEqual({
      componentId: "button",
      storyId: "primary",
      docsComponentId: null,
      pageId: null,
      propOverrides: {},
      layout: null,
    });
  });

  it("falls back to the first story when the story is missing", () => {
    expect(reconcileSelection(manifest, { componentId: "button", storyId: "missing" })).toEqual({
      componentId: "button",
      storyId: "primary",
      docsComponentId: null,
      pageId: null,
      propOverrides: {},
      layout: null,
    });
  });

  it("clears preview selection when there are no stories", () => {
    expect(reconcileSelection([], { componentId: "button", storyId: "primary" })).toEqual({
      componentId: null,
      storyId: null,
      docsComponentId: null,
      pageId: null,
      propOverrides: {},
      layout: null,
    });
  });
});

describe("defaultMode", () => {
  it("keeps design mode when components exist", () => {
    expect(defaultMode("design", 1, 1)).toBe("design");
  });

  it("moves to docs when there are docs but no components", () => {
    expect(defaultMode("design", 0, 1)).toBe("docs");
  });

  it("moves to design when there are components but no docs", () => {
    expect(defaultMode("docs", 1, 0)).toBe("design");
  });
});
```

- [ ] **Step 4: Run the new test to verify it fails**

Run:

```bash
pnpm --filter @gobrand/openstory-manager test -- selection.test.ts
```

Expected: FAIL because `packages/manager/src/types.ts` and `packages/manager/src/selection.ts` do not exist yet.

- [ ] **Step 5: Move shared types into the manager package**

Create `packages/manager/src/types.ts` from the contents of `apps/desktop/electron/types.ts`, and append the manager surface/API types:

```ts
export type ProjectRecord = {
  id: string;
  name: string;
  path: string;
  addedAt: string;
};

export type Theme = "light" | "dark";

export type Layout = "padded" | "centered" | "fullscreen";

export type OverlayState = {
  opacity: number;
  clickThrough: boolean;
  blendMode: "normal" | "difference";
  visible: boolean;
  alwaysOnTop: boolean;
};

export type ActiveSelection = {
  projectId: string | null;
  componentId: string | null;
  storyId: string | null;
  docsComponentId: string | null;
  pageId: string | null;
  viewport: "desktop" | "mobile";
  mode: "design" | "docs";
  layout: Layout | null;
  propOverrides: Record<string, unknown>;
};

export type ManifestControl = {
  name: string;
  kind: "text" | "boolean" | "number" | "select" | "radio";
  options?: string[];
};

export type ManifestComponent = {
  id: string;
  name: string;
  group: string;
  section: string | null;
  background: string;
  layout: Layout;
  stories: Array<{
    id: string;
    label: string;
    props: Record<string, unknown>;
  }>;
  controls: ManifestControl[];
  sourcePath: string | null;
};

export type ManifestDoc = {
  id: string;
  title: string;
  group: string;
  section: string | null;
  html: string;
  embeds: string[];
  sourcePath: string;
  status?: "shipped" | "beta" | "planned";
  owner?: string;
};

export type PreviewSource = {
  path: string;
  code: string;
};

export type ViteStatus =
  | { status: "idle"; port: null; error: null }
  | { status: "starting"; port: null; error: null }
  | { status: "ready"; port: number | null; error: null }
  | { status: "error"; port: null; error: string };

export type AppState = {
  projects: ProjectRecord[];
  selection: ActiveSelection;
  overlay: OverlayState;
  theme: Theme;
  manifest: ManifestComponent[];
  docs: ManifestDoc[];
  iframeUrl: string | null;
  detachedOpen: boolean;
  vite: {
    status: "idle" | "starting" | "ready" | "error";
    port: number | null;
    error: string | null;
  };
};

export type IpcInvoke = {
  "project:add": (path: string) => ProjectRecord;
  "project:pickFolder": () => string | null;
  "project:select": (projectId: string) => void;
  "project:remove": (projectId: string) => void;
  "preview:set": (input: {
    componentId: string;
    storyId: string;
    viewport: "desktop" | "mobile";
  }) => void;
  "preview:setProps": (overrides: Record<string, unknown>) => void;
  "preview:setLayout": (layout: Layout | null) => void;
  "preview:setDocs": (componentId: string | null) => void;
  "preview:setPage": (pageId: string | null) => void;
  "preview:setMode": (mode: "design" | "docs") => void;
  "preview:refreshManifest": () => void;
  "shell:openExternal": (href: string) => void;
  "preview:getSource": (componentId: string) => PreviewSource | null;
  "preview:popOut": () => void;
  "preview:popIn": () => void;
  "overlay:setOpacity": (value: number) => void;
  "overlay:setClickThrough": (enabled: boolean) => void;
  "overlay:setBlendMode": (mode: "normal" | "difference") => void;
  "overlay:setVisible": (visible: boolean) => void;
  "window:setAlwaysOnTop": (enabled: boolean) => void;
  "theme:set": (theme: Theme) => void;
  "state:get": () => AppState;
};

export type IpcEvents = {
  "state:update": (state: AppState) => void;
};

export type ManagerSurface = "desktop" | "browser";

export type ManagerApi = {
  surface: ManagerSurface;
  invoke<K extends keyof IpcInvoke>(
    channel: K,
    ...args: Parameters<IpcInvoke[K]>
  ): Promise<ReturnType<IpcInvoke[K]>>;
  on<K extends keyof IpcEvents>(channel: K, listener: IpcEvents[K]): () => void;
};
```

- [ ] **Step 6: Move selection helpers into the manager package**

Create `packages/manager/src/selection.ts` from the current `apps/desktop/electron/selection.ts` behavior:

```ts
import type { ActiveSelection, ManifestComponent } from "./types";

export type SelectionPatch = Pick<
  ActiveSelection,
  "componentId" | "storyId" | "docsComponentId" | "pageId" | "propOverrides" | "layout"
>;

export function reconcileSelection(
  manifest: ManifestComponent[],
  selection: Pick<ActiveSelection, "componentId" | "storyId">,
): SelectionPatch | null {
  const current = manifest.find((p) => p.id === selection.componentId);
  const hasCurrentStory = current?.stories.some((s) => s.id === selection.storyId) ?? false;
  if (current && hasCurrentStory) return null;

  const firstComponent = manifest.find((p) => p.stories.length > 0);
  const firstStory = firstComponent?.stories[0];
  return {
    componentId: firstComponent?.id ?? null,
    storyId: firstStory?.id ?? null,
    docsComponentId: null,
    pageId: null,
    propOverrides: {},
    layout: null,
  };
}

export function defaultMode(
  current: ActiveSelection["mode"],
  componentCount: number,
  docCount: number,
): ActiveSelection["mode"] {
  if (current === "design" && componentCount === 0 && docCount > 0) return "docs";
  if (current === "docs" && docCount === 0 && componentCount > 0) return "design";
  return current;
}
```

- [ ] **Step 7: Add API exports**

Create `packages/manager/src/api.ts`:

```ts
import type { ManagerApi } from "./types";

export type { ManagerApi, ManagerSurface } from "./types";

export function getElectronApi(): ManagerApi | undefined {
  const candidate =
    typeof window !== "undefined" ? (window as typeof window & { openStory?: ManagerApi }).openStory : undefined;
  return candidate ? { ...candidate, surface: "desktop" } : undefined;
}
```

Create `packages/manager/src/index.ts`:

```ts
export type {
  ActiveSelection,
  AppState,
  IpcEvents,
  IpcInvoke,
  Layout,
  ManagerApi,
  ManagerSurface,
  ManifestComponent,
  ManifestDoc,
  OverlayState,
  PreviewSource,
  ProjectRecord,
  Theme,
} from "./types";
export { defaultMode, reconcileSelection, type SelectionPatch } from "./selection";
export { getElectronApi } from "./api";
```

- [ ] **Step 8: Update desktop imports to shared types without moving UI yet**

Replace `apps/desktop/electron/types.ts` with:

```ts
export type {
  ActiveSelection,
  AppState,
  IpcEvents,
  IpcInvoke,
  Layout,
  ManifestComponent,
  ManifestDoc,
  OverlayState,
  PreviewSource,
  ProjectRecord,
  Theme,
} from "@gobrand/openstory-manager";
```

Replace `apps/desktop/electron/selection.ts` with:

```ts
export { defaultMode, reconcileSelection, type SelectionPatch } from "@gobrand/openstory-manager/selection";
```

In `apps/desktop/package.json`, add:

```json
"@gobrand/openstory-manager": "workspace:*"
```

inside `dependencies`.

- [ ] **Step 9: Run tests and typechecks for this boundary**

Run:

```bash
pnpm --filter @gobrand/openstory-manager test
pnpm --filter openstory-desktop test -- selection.test.ts
pnpm --filter openstory-desktop typecheck
```

Expected: all pass. If TypeScript reports that `window.openStory` is not structurally compatible with `ManagerApi` because it lacks `surface`, keep `getElectronApi()` as the only place that wraps it and do not change the preload type yet.

- [ ] **Step 10: Commit**

Run:

```bash
git add packages/manager apps/desktop/electron/types.ts apps/desktop/electron/selection.ts apps/desktop/electron/ipc.ts apps/desktop/package.json pnpm-lock.yaml
git commit -m "refactor: share manager state types"
```

---

### Task 2: Move Shared Renderer UI Into `@gobrand/openstory-manager`

**Files:**
- Move: `apps/desktop/src/App.tsx` to `packages/manager/src/App.tsx`
- Move: `apps/desktop/src/views/**` to `packages/manager/src/views/**`
- Move: `apps/desktop/src/components/**` to `packages/manager/src/components/**`
- Move: `apps/desktop/src/lib/**` to `packages/manager/src/lib/**`
- Move: `apps/desktop/src/styles.css` to `packages/manager/src/styles.css`
- Move: `apps/desktop/src/docs/**` to `packages/manager/src/docs/**`
- Modify: `apps/desktop/src/main.tsx`
- Modify: `apps/desktop/src/global.d.ts`
- Modify: `apps/desktop/tsconfig.json`
- Modify: `README.md` dogfooding instructions to point at `packages/manager`

**Interfaces:**
- Consumes: `ManagerApi`, `AppState`, `IpcInvoke`, `IpcEvents` from Task 1.
- Produces: `App`, `MainApp`, `DetachedPreview`, styles, and shared component exports from `@gobrand/openstory-manager`.

- [ ] **Step 1: Move the shared files**

Use `git mv` so history is preserved:

```bash
mkdir -p packages/manager/src
git mv apps/desktop/src/App.tsx packages/manager/src/App.tsx
git mv apps/desktop/src/views packages/manager/src/views
git mv apps/desktop/src/components packages/manager/src/components
git mv apps/desktop/src/lib packages/manager/src/lib
git mv apps/desktop/src/styles.css packages/manager/src/styles.css
git mv apps/desktop/src/docs packages/manager/src/docs
```

- [ ] **Step 2: Update imports in moved files**

Apply these import rules across `packages/manager/src`:

```text
../../electron/types        -> ../types or ../../types depending on file depth
../../../electron/types     -> ../../types depending on file depth
../lib/api                  -> ../api or ../../api depending on file depth
../../lib/api               -> ../../api or ../../../api depending on file depth
```

Concrete high-risk replacements:

In `packages/manager/src/App.tsx`, replace:

```ts
import type { AppState } from "../electron/types";
```

with:

```ts
import type { AppState } from "./types";
```

Replace its local `getApi()` with:

```ts
import type { ManagerApi } from "./types";
import { getElectronApi } from "./api";

function getApi(): ManagerApi | undefined {
  return getElectronApi();
}
```

In `packages/manager/src/views/main-app.tsx`, replace:

```ts
import type { AppState } from "../../electron/types";
import type { Api } from "../lib/api";
```

with:

```ts
import type { AppState, ManagerApi } from "../types";
```

and change the component signature to:

```ts
export function MainApp({ state, api }: { state: AppState; api: ManagerApi | undefined }) {
```

In every moved file that used `type Api`, use:

```ts
import type { ManagerApi } from "../types";
type Api = ManagerApi | undefined;
```

or import from `../../types` at deeper paths.

- [ ] **Step 3: Export the moved app and styles**

Update `packages/manager/src/index.ts`:

```ts
export { App } from "./App";
export type {
  ActiveSelection,
  AppState,
  IpcEvents,
  IpcInvoke,
  Layout,
  ManagerApi,
  ManagerSurface,
  ManifestComponent,
  ManifestDoc,
  OverlayState,
  PreviewSource,
  ProjectRecord,
  Theme,
} from "./types";
export { defaultMode, reconcileSelection, type SelectionPatch } from "./selection";
export { getElectronApi } from "./api";
```

- [ ] **Step 4: Update desktop renderer entry**

Replace `apps/desktop/src/main.tsx` with:

```ts
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@gobrand/openstory-manager";
import "@gobrand/openstory-manager/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Replace `apps/desktop/src/global.d.ts` with:

```ts
import type { OpenStoryApi } from "../electron/preload";

declare global {
  interface Window {
    openStory?: OpenStoryApi;
  }
}

export {};
```

Update `apps/desktop/tsconfig.json`:

```json
{
  "extends": "../../tooling/tsconfig/react.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src/**/*", "electron/types.ts"]
}
```

- [ ] **Step 5: Leave desktop dogfooding config unchanged in this task**

Keep `apps/desktop/vite.config.ts` as the desktop-app harness config for now:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { openStory } from "@gobrand/openstory-vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), openStory()],
});
```

After this move, the shared manager stories live under `packages/manager`, so
the README dogfooding section will be updated in Task 6 to open
`packages/manager` instead of `apps/desktop`.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
pnpm --filter @gobrand/openstory-manager typecheck
pnpm --filter openstory-desktop typecheck
pnpm --filter openstory-desktop test -- use-harness-bridge.test.ts
```

Expected: all pass. If tests moved with the files, run:

```bash
pnpm --filter @gobrand/openstory-manager test -- use-harness-bridge.test.ts
```

- [ ] **Step 7: Commit**

Run:

```bash
git add packages/manager apps/desktop/src apps/desktop/tsconfig.json apps/desktop/vite.config.ts apps/desktop/package.json pnpm-lock.yaml
git commit -m "refactor: move manager renderer to package"
```

---

### Task 3: Implement Browser Manager API

**Files:**
- Create: `packages/manager/src/browser-api.ts`
- Create: `packages/manager/src/browser-api.test.ts`
- Modify: `packages/manager/src/index.ts`

**Interfaces:**
- Consumes: `ManagerApi`, `AppState`, `ManifestComponent`, `ManifestDoc`, `PreviewSource`, `reconcileSelection`, `defaultMode`.
- Produces:
  - `BrowserManagerConfig`
  - `createBrowserManagerApi(config: BrowserManagerConfig, deps?: BrowserManagerDeps): ManagerApi`
  - `readBrowserManagerConfig(): BrowserManagerConfig`

- [ ] **Step 1: Write browser adapter tests first**

Create `packages/manager/src/browser-api.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createBrowserManagerApi, type BrowserManagerConfig } from "./browser-api";

const config: BrowserManagerConfig = {
  projectName: "app",
  projectRootDisplay: "/Users/me/Desktop/tanstack-start/apps/app",
  manifestUrl: "/__pl__/manifest.json",
  harnessUrl: "/__pl__/",
  sourceUrl: "/__pl__/manager/source",
};

const manifest = {
  schemaVersion: 1,
  components: [
    {
      id: "button",
      name: "Button",
      group: "",
      section: null,
      background: "#fff",
      layout: "padded",
      stories: [{ id: "primary", label: "Primary", props: { children: "Save" } }],
      controls: [],
      sourcePath: "/project/src/Button.tsx",
    },
  ],
  docs: [
    {
      id: "intro",
      title: "Intro",
      group: "",
      section: null,
      html: "<h1>Intro</h1>",
      embeds: [],
      sourcePath: "/project/src/intro.stories.md",
    },
  ],
};

describe("createBrowserManagerApi", () => {
  it("initializes a single local project from manifest data", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(manifest), { status: 200 }));
    const api = createBrowserManagerApi(config, { fetch });

    const state = await api.invoke("state:get");

    expect(fetch).toHaveBeenCalledWith("/__pl__/manifest.json");
    expect(state.projects).toEqual([
      {
        id: "local",
        name: "app",
        path: "/Users/me/Desktop/tanstack-start/apps/app",
        addedAt: expect.any(String),
      },
    ]);
    expect(state.selection.projectId).toBe("local");
    expect(state.selection.componentId).toBe("button");
    expect(state.selection.storyId).toBe("primary");
    expect(state.iframeUrl).toBe("/__pl__/");
    expect(state.vite.status).toBe("ready");
  });

  it("emits state updates after selection changes", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(manifest), { status: 200 }));
    const api = createBrowserManagerApi(config, { fetch });
    const listener = vi.fn();
    api.on("state:update", listener);

    await api.invoke("state:get");
    await api.invoke("preview:setPage", "intro");

    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({
        selection: expect.objectContaining({
          mode: "docs",
          pageId: "intro",
          componentId: null,
          storyId: null,
        }),
      }),
    );
  });

  it("refreshes the manifest on preview:refreshManifest", async () => {
    const nextManifest = {
      ...manifest,
      components: [
        {
          ...manifest.components[0],
          id: "card",
          name: "Card",
          stories: [{ id: "basic", label: "Basic", props: {} }],
        },
      ],
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(manifest), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(nextManifest), { status: 200 }));
    const api = createBrowserManagerApi(config, { fetch });

    await api.invoke("state:get");
    await api.invoke("preview:refreshManifest");
    const state = await api.invoke("state:get");

    expect(state.manifest[0]?.id).toBe("card");
    expect(state.selection.componentId).toBe("card");
  });

  it("fetches source through the source route", async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url === "/__pl__/manifest.json") return new Response(JSON.stringify(manifest), { status: 200 });
      return new Response(JSON.stringify({ path: "/project/src/Button.tsx", code: "export function Button() {}" }), {
        status: 200,
      });
    });
    const api = createBrowserManagerApi(config, { fetch });

    await api.invoke("state:get");
    const source = await api.invoke("preview:getSource", "button");

    expect(fetch).toHaveBeenCalledWith("/__pl__/manager/source?component=button");
    expect(source).toEqual({ path: "/project/src/Button.tsx", code: "export function Button() {}" });
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pnpm --filter @gobrand/openstory-manager test -- browser-api.test.ts
```

Expected: FAIL because `browser-api.ts` does not exist.

- [ ] **Step 3: Implement the browser API**

Create `packages/manager/src/browser-api.ts`:

```ts
import { defaultMode, reconcileSelection } from "./selection";
import type {
  AppState,
  IpcEvents,
  IpcInvoke,
  ManagerApi,
  ManifestComponent,
  ManifestDoc,
  PreviewSource,
  Theme,
} from "./types";

export type BrowserManagerConfig = {
  projectName: string;
  projectRootDisplay: string;
  manifestUrl: string;
  harnessUrl: string;
  sourceUrl: string;
};

export type BrowserManagerDeps = {
  fetch?: typeof fetch;
  openExternal?: (href: string) => void;
  now?: () => string;
};

type ManifestResponse = {
  components?: ManifestComponent[];
  docs?: ManifestDoc[];
};

const LOCAL_PROJECT_ID = "local";

function initialState(config: BrowserManagerConfig, now: () => string): AppState {
  return {
    projects: [
      {
        id: LOCAL_PROJECT_ID,
        name: config.projectName,
        path: config.projectRootDisplay,
        addedAt: now(),
      },
    ],
    selection: {
      projectId: LOCAL_PROJECT_ID,
      componentId: null,
      storyId: null,
      docsComponentId: null,
      pageId: null,
      viewport: "desktop",
      mode: "design",
      layout: null,
      propOverrides: {},
    },
    overlay: {
      opacity: 1,
      clickThrough: false,
      blendMode: "normal",
      visible: true,
      alwaysOnTop: false,
    },
    theme: "light",
    manifest: [],
    docs: [],
    iframeUrl: config.harnessUrl,
    detachedOpen: false,
    vite: { status: "starting", port: null, error: null },
  };
}

export function readBrowserManagerConfig(): BrowserManagerConfig {
  const raw = document.getElementById("openstory-manager-config")?.textContent;
  if (!raw) throw new Error("OpenStory manager config script missing");
  return JSON.parse(raw) as BrowserManagerConfig;
}

export function createBrowserManagerApi(
  config: BrowserManagerConfig,
  deps: BrowserManagerDeps = {},
): ManagerApi {
  const doFetch = deps.fetch ?? fetch.bind(globalThis);
  const openExternal =
    deps.openExternal ??
    ((href: string) => {
      window.open(href, "_blank", "noopener,noreferrer");
    });
  const now = deps.now ?? (() => new Date().toISOString());
  const listeners = new Set<IpcEvents["state:update"]>();
  let state = initialState(config, now);
  let loaded: Promise<void> | null = null;

  function emit() {
    for (const listener of listeners) listener(state);
  }

  function patchSelection(patch: Partial<AppState["selection"]>) {
    state = { ...state, selection: { ...state.selection, ...patch } };
    emit();
  }

  async function loadManifest() {
    state = { ...state, vite: { status: "starting", port: null, error: null } };
    emit();
    try {
      const res = await doFetch(config.manifestUrl);
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as ManifestResponse;
      const manifest = body.components ?? [];
      const docs = body.docs ?? [];
      let selection = state.selection;
      const patch = reconcileSelection(manifest, selection);
      if (patch) selection = { ...selection, ...patch };
      const mode = defaultMode(selection.mode, manifest.length, docs.length);
      selection = { ...selection, mode };
      state = {
        ...state,
        manifest,
        docs,
        selection,
        iframeUrl: config.harnessUrl,
        vite: { status: "ready", port: null, error: null },
      };
      emit();
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      state = { ...state, manifest: [], docs: [], vite: { status: "error", port: null, error } };
      emit();
    }
  }

  async function ensureLoaded() {
    loaded ??= loadManifest();
    await loaded;
  }

  async function getSource(componentId: string): Promise<PreviewSource | null> {
    const url = `${config.sourceUrl}?component=${encodeURIComponent(componentId)}`;
    const res = await doFetch(url);
    if (!res.ok) return null;
    return (await res.json()) as PreviewSource;
  }

  const api: ManagerApi = {
    surface: "browser",
    async invoke(channel, ...args) {
      if (channel === "state:get") {
        await ensureLoaded();
        return state as ReturnType<IpcInvoke[typeof channel]>;
      }
      if (channel === "preview:refreshManifest") {
        loaded = loadManifest();
        await loaded;
        return undefined as ReturnType<IpcInvoke[typeof channel]>;
      }
      await ensureLoaded();
      switch (channel) {
        case "preview:set": {
          const [input] = args as Parameters<IpcInvoke["preview:set"]>;
          patchSelection({
            ...input,
            propOverrides: {},
            layout: null,
            docsComponentId: null,
            pageId: null,
            mode: "design",
          });
          break;
        }
        case "preview:setProps": {
          const [overrides] = args as Parameters<IpcInvoke["preview:setProps"]>;
          patchSelection({ propOverrides: overrides });
          break;
        }
        case "preview:setLayout": {
          const [layout] = args as Parameters<IpcInvoke["preview:setLayout"]>;
          patchSelection({ layout });
          break;
        }
        case "preview:setDocs": {
          const [componentId] = args as Parameters<IpcInvoke["preview:setDocs"]>;
          patchSelection({ docsComponentId: componentId, pageId: null, mode: "design" });
          break;
        }
        case "preview:setPage": {
          const [pageId] = args as Parameters<IpcInvoke["preview:setPage"]>;
          patchSelection({
            pageId,
            componentId: null,
            storyId: null,
            docsComponentId: null,
            propOverrides: {},
            layout: null,
            mode: "docs",
          });
          break;
        }
        case "preview:setMode": {
          const [mode] = args as Parameters<IpcInvoke["preview:setMode"]>;
          patchSelection({ mode });
          break;
        }
        case "theme:set": {
          const [theme] = args as [Theme];
          state = { ...state, theme };
          emit();
          break;
        }
        case "preview:getSource": {
          const [componentId] = args as Parameters<IpcInvoke["preview:getSource"]>;
          return (await getSource(componentId)) as ReturnType<IpcInvoke[typeof channel]>;
        }
        case "shell:openExternal": {
          const [href] = args as Parameters<IpcInvoke["shell:openExternal"]>;
          const protocol = new URL(href).protocol;
          if (protocol === "http:" || protocol === "https:" || protocol === "mailto:") openExternal(href);
          break;
        }
        default:
          console.warn(`[openstory] ${channel} is not available in browser manager mode`);
      }
      return undefined as ReturnType<IpcInvoke[typeof channel]>;
    },
    on(channel, listener) {
      if (channel !== "state:update") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  return api;
}
```

- [ ] **Step 4: Export browser API**

Update `packages/manager/src/index.ts`:

```ts
export {
  createBrowserManagerApi,
  readBrowserManagerConfig,
  type BrowserManagerConfig,
  type BrowserManagerDeps,
} from "./browser-api";
```

Keep the existing exports from Task 2 in the same file.

- [ ] **Step 5: Run browser adapter tests**

Run:

```bash
pnpm --filter @gobrand/openstory-manager test -- browser-api.test.ts
pnpm --filter @gobrand/openstory-manager typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

Run:

```bash
git add packages/manager/src/browser-api.ts packages/manager/src/browser-api.test.ts packages/manager/src/index.ts
git commit -m "feat: add browser manager api"
```

---

### Task 4: Add Browser Manager Entry And Surface-Aware App Boot

**Files:**
- Create: `packages/manager/src/main.tsx`
- Modify: `packages/manager/src/App.tsx`
- Modify: `packages/manager/src/components/sidebar/repo-switcher.tsx`
- Modify: `packages/manager/src/components/toolbar.tsx`
- Modify: `packages/manager/src/components/settings-menu.tsx`
- Modify: `packages/manager/src/components/titlebar.tsx`
- Create: `packages/manager/src/components/toolbar.test.tsx`

**Interfaces:**
- Consumes: `createBrowserManagerApi`, `readBrowserManagerConfig`, `getElectronApi`.
- Produces: browser entry module importable as `@gobrand/openstory-manager/main`.

- [ ] **Step 1: Add package export for browser entry**

Modify `packages/manager/package.json` exports:

```json
"./main": {
  "types": "./dist/main.d.ts",
  "import": "./dist/main.js"
}
```

The `exports` object should contain `.`, `./main`, `./selection`, and `./styles.css`.

- [ ] **Step 2: Create the browser React entry**

Create `packages/manager/src/main.tsx`:

```ts
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { createBrowserManagerApi, readBrowserManagerConfig } from "./browser-api";
import "./styles.css";

const api = createBrowserManagerApi(readBrowserManagerConfig());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App apiOverride={api} />
  </StrictMode>,
);
```

- [ ] **Step 3: Let App accept a browser API override**

Modify `packages/manager/src/App.tsx` so the signature and API selection are:

```ts
export function App({ apiOverride }: { apiOverride?: ManagerApi }) {
  const api = apiOverride ?? getApi();
  const [state, setState] = useState<AppState>(FALLBACK_STATE);
```

Keep the existing Electron `role=detached` logic, but compute role safely:

```ts
const ROLE =
  typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("role") ?? "main"
    : "main";
```

- [ ] **Step 4: Gate repository menu in browser mode**

In `packages/manager/src/components/sidebar/repo-switcher.tsx`, add a browser branch near the top of the component:

```tsx
if (api?.surface === "browser") {
  return (
    <div className="no-drag px-3 pt-3">
      <div className="flex h-11 w-full items-center gap-2.5 rounded-lg px-1.5 text-[13px] font-medium text-foreground">
        {active ? (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand/15 text-[11px] font-semibold uppercase text-brand">
            {monogram(active.name)}
          </span>
        ) : (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground/[0.06] text-muted-foreground">
            <HugeiconsIcon icon={Folder01Icon} className="size-3.5" />
          </span>
        )}
        <span className="truncate">{active?.name ?? "Local project"}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Gate pop-out toolbar button in browser mode**

In `packages/manager/src/components/toolbar.tsx`, wrap the final divider and pop-out button:

```tsx
{api?.surface === "desktop" && (
  <>
    <Divider />
    <ToolButton
      title={state.detachedOpen ? "Pop in" : "Open in new window"}
      icon={state.detachedOpen ? ArrowShrink02Icon : LinkSquare02Icon}
      onClick={() => api?.invoke(state.detachedOpen ? "preview:popIn" : "preview:popOut")}
    />
  </>
)}
```

- [ ] **Step 6: Keep settings desktop-safe**

Inspect `packages/manager/src/components/settings-menu.tsx`. Any overlay/window-only controls must be wrapped with:

```tsx
{api?.surface === "desktop" && (
  // existing overlay or window controls
)}
```

Theme controls stay visible in both modes because browser API implements `theme:set`.

- [ ] **Step 7: Add UI gating tests**

Create `packages/manager/src/components/toolbar.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Toolbar } from "./toolbar";
import type { AppState, ManagerApi, ManifestComponent } from "../types";
import { NO_ADDONS } from "../lib/preview-view";

const component: ManifestComponent = {
  id: "button",
  name: "Button",
  group: "",
  section: null,
  background: "#fff",
  layout: "padded",
  stories: [{ id: "primary", label: "Primary", props: {} }],
  controls: [],
  sourcePath: null,
};

const state: AppState = {
  projects: [{ id: "local", name: "app", path: "/app", addedAt: "now" }],
  selection: {
    projectId: "local",
    componentId: "button",
    storyId: "primary",
    docsComponentId: null,
    pageId: null,
    viewport: "desktop",
    mode: "design",
    layout: null,
    propOverrides: {},
  },
  overlay: { opacity: 1, clickThrough: false, blendMode: "normal", visible: true, alwaysOnTop: false },
  theme: "light",
  manifest: [component],
  docs: [],
  iframeUrl: "/__pl__/",
  detachedOpen: false,
  vite: { status: "ready", port: null, error: null },
};

function api(surface: "desktop" | "browser"): ManagerApi {
  return { surface, invoke: vi.fn() as never, on: vi.fn() as never };
}

describe("Toolbar surface gating", () => {
  it("shows pop-out in desktop mode", () => {
    render(
      <Toolbar
        state={state}
        api={api("desktop")}
        component={component}
        story={component.stories[0]}
        zoom={1}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        onZoomReset={() => {}}
        addons={NO_ADDONS}
        onToggleAddon={() => {}}
        onReload={() => {}}
      />,
    );
    expect(screen.getByTitle("Open in new window")).toBeTruthy();
  });

  it("hides pop-out in browser mode", () => {
    render(
      <Toolbar
        state={state}
        api={api("browser")}
        component={component}
        story={component.stories[0]}
        zoom={1}
        onZoomIn={() => {}}
        onZoomOut={() => {}}
        onZoomReset={() => {}}
        addons={NO_ADDONS}
        onToggleAddon={() => {}}
        onReload={() => {}}
      />,
    );
    expect(screen.queryByTitle("Open in new window")).toBeNull();
  });
});
```

If `@testing-library/react` is not installed, add it to `packages/manager/devDependencies`:

```json
"@testing-library/react": "^16.0.0"
```

- [ ] **Step 8: Run tests and typecheck**

Run:

```bash
pnpm --filter @gobrand/openstory-manager test
pnpm --filter @gobrand/openstory-manager typecheck
pnpm --filter openstory-desktop typecheck
```

Expected: all pass.

- [ ] **Step 9: Commit**

Run:

```bash
git add packages/manager apps/desktop/src/main.tsx apps/desktop/package.json pnpm-lock.yaml
git commit -m "feat: add browser manager entry"
```

---

### Task 5: Serve Manager HTML And Browser Source Route From Vite Plugin

**Files:**
- Create: `packages/vite-plugin/src/manager-loader.ts`
- Create: `packages/vite-plugin/src/manager-source.ts`
- Create: `packages/vite-plugin/src/manager-source.test.ts`
- Modify: `packages/vite-plugin/src/plugin.ts`
- Modify: `packages/vite-plugin/src/plugin.test.ts`
- Modify: `packages/vite-plugin/package.json`

**Interfaces:**
- Consumes: `@gobrand/openstory-manager/main`, `@gobrand/openstory-manager/styles.css`, manifest assembly.
- Produces:
  - `buildManagerHtml(config: BrowserManagerConfig): string`
  - `readPreviewSource(input): PreviewSourceResult`
  - Vite routes `/__pl__/manager` and `/__pl__/manager/source?component=<id>`

- [ ] **Step 1: Add dependency**

In `packages/vite-plugin/package.json`, add:

```json
"@gobrand/openstory-manager": "workspace:^"
```

inside `dependencies`.

- [ ] **Step 2: Write manager loader tests**

Add to `packages/vite-plugin/src/plugin.test.ts`:

```ts
import { buildManagerHtml } from "./manager-loader";

describe("buildManagerHtml", () => {
  it("embeds manager config and imports the manager browser entry", () => {
    const html = buildManagerHtml({
      projectName: "app",
      projectRootDisplay: "/project/app",
      manifestUrl: "/__pl__/manifest.json",
      harnessUrl: "/__pl__/",
      sourceUrl: "/__pl__/manager/source",
    });

    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('id="openstory-manager-config"');
    expect(html).toContain('"projectName":"app"');
    expect(html).toContain("/@id/@gobrand/openstory-manager/main");
  });
});
```

- [ ] **Step 3: Implement manager loader**

Create `packages/vite-plugin/src/manager-loader.ts`:

```ts
import type { BrowserManagerConfig } from "@gobrand/openstory-manager";

function escapeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function buildManagerHtml(config: BrowserManagerConfig): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OpenStory</title>
  </head>
  <body>
    <div id="root"></div>
    <script id="openstory-manager-config" type="application/json">${escapeJson(config)}</script>
    <script type="module" src="/@id/@gobrand/openstory-manager/main"></script>
  </body>
</html>`;
}
```

- [ ] **Step 4: Write source route helper tests**

Create `packages/vite-plugin/src/manager-source.test.ts`:

```ts
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readPreviewSource } from "./manager-source";
import type { Manifest } from "./assemble-manifest";

let root: string | null = null;

function makeRoot() {
  root = mkdtempSync(join(tmpdir(), "openstory-manager-source-"));
  mkdirSync(join(root, "src"), { recursive: true });
  return root;
}

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
  root = null;
});

describe("readPreviewSource", () => {
  it("returns component source inside the project root", () => {
    const projectRoot = makeRoot();
    const file = join(projectRoot, "src/Button.tsx");
    writeFileSync(file, "export function Button() { return null }");
    const manifest = {
      schemaVersion: 1,
      components: [{ id: "button", sourcePath: file }],
      docs: [],
    } as unknown as Manifest;

    expect(readPreviewSource({ projectRoot, manifest, componentId: "button" })).toEqual({
      status: 200,
      body: { path: file, code: "export function Button() { return null }" },
    });
  });

  it("returns doc source when no component matches", () => {
    const projectRoot = makeRoot();
    const file = join(projectRoot, "src/intro.stories.md");
    writeFileSync(file, "# Intro");
    const manifest = {
      schemaVersion: 1,
      components: [],
      docs: [{ id: "intro", sourcePath: file }],
    } as unknown as Manifest;

    expect(readPreviewSource({ projectRoot, manifest, componentId: "intro" })).toEqual({
      status: 200,
      body: { path: file, code: "# Intro" },
    });
  });

  it("rejects files outside the project root", () => {
    const projectRoot = makeRoot();
    const outside = resolve(projectRoot, "..", "outside.tsx");
    writeFileSync(outside, "secret");
    const manifest = {
      schemaVersion: 1,
      components: [{ id: "escape", sourcePath: outside }],
      docs: [],
    } as unknown as Manifest;

    expect(readPreviewSource({ projectRoot, manifest, componentId: "escape" })).toEqual({
      status: 403,
      body: { error: "Source path escapes project root" },
    });
  });

  it("returns 404 for missing ids", () => {
    const projectRoot = makeRoot();
    const manifest = { schemaVersion: 1, components: [], docs: [] } as unknown as Manifest;

    expect(readPreviewSource({ projectRoot, manifest, componentId: "missing" })).toEqual({
      status: 404,
      body: { error: "Source not found" },
    });
  });
});
```

- [ ] **Step 5: Implement source helper**

Create `packages/vite-plugin/src/manager-source.ts`:

```ts
import { readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import type { Manifest } from "./assemble-manifest";

const MAX_SOURCE_BYTES = 256 * 1024;

type SourceBody = { path: string; code: string } | { error: string };

export type PreviewSourceResult = {
  status: 200 | 403 | 404 | 413;
  body: SourceBody;
};

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel.length > 0 && !rel.startsWith("..") && !rel.startsWith(`..${sep}`);
}

export function readPreviewSource(input: {
  projectRoot: string;
  manifest: Manifest;
  componentId: string;
}): PreviewSourceResult {
  const sourcePath =
    input.manifest.components.find((p) => p.id === input.componentId)?.sourcePath ??
    input.manifest.docs.find((d) => d.id === input.componentId)?.sourcePath ??
    null;

  if (!sourcePath) return { status: 404, body: { error: "Source not found" } };

  const root = resolve(input.projectRoot);
  const path = resolve(sourcePath);
  if (!isInside(root, path)) return { status: 403, body: { error: "Source path escapes project root" } };

  try {
    if (statSync(path).size > MAX_SOURCE_BYTES) {
      return { status: 413, body: { error: "Source file too large" } };
    }
    return { status: 200, body: { path, code: readFileSync(path, "utf8") } };
  } catch {
    return { status: 404, body: { error: "Source not found" } };
  }
}
```

- [ ] **Step 6: Wire plugin routes**

In `packages/vite-plugin/src/plugin.ts`, import:

```ts
import { basename } from "node:path";
import { buildManagerHtml } from "./manager-loader.js";
import { readPreviewSource } from "./manager-source.js";
```

If `basename` conflicts with existing imports, merge it into the existing `node:path` import.

Add constants:

```ts
const MANAGER_ROUTE = "/__pl__/manager";
const MANAGER_SOURCE_ROUTE = "/__pl__/manager/source";
```

Inside `configureServer`, before the existing `server.middlewares.use(ROUTE, ...)` handler or at the top of that handler before the harness root branch, add:

```ts
server.middlewares.use(MANAGER_ROUTE, async (req, res, next) => {
  if (!req.url) return next();
  const parsed = new URL(req.url, "http://openstory.local");
  const path = parsed.pathname;
  if (path === "/" || path === "") {
    res.setHeader("content-type", "text/html; charset=utf-8");
    const html = await server.transformIndexHtml(
      MANAGER_ROUTE,
      buildManagerHtml({
        projectName: basename(projectRoot),
        projectRootDisplay: projectRoot,
        manifestUrl: MANIFEST_ROUTE,
        harnessUrl: `${ROUTE}/`,
        sourceUrl: MANAGER_SOURCE_ROUTE,
      }),
    );
    res.end(html);
    return;
  }
  if (path === "/source") {
    const componentId = parsed.searchParams.get("component");
    if (!componentId) {
      res.statusCode = 400;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "Missing component query parameter" }));
      return;
    }
    const manifest = await assembleManifest({
      projectRoot,
      resolvedConfigPath,
      ssrLoadModule: (p) => server.ssrLoadModule(p),
      readFile: (abs) => readFileSync(abs, "utf8"),
    });
    const result = readPreviewSource({ projectRoot, manifest, componentId });
    res.statusCode = result.status;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(result.body));
    return;
  }
  next();
});
```

Verify route ordering: `/__pl__/manager` must be registered before the broad `/__pl__` middleware, otherwise it may fall through incorrectly.

- [ ] **Step 7: Run plugin tests**

Run:

```bash
pnpm --filter @gobrand/openstory-vite test -- plugin.test.ts manager-source.test.ts
pnpm --filter @gobrand/openstory-vite typecheck
```

Expected: all pass.

- [ ] **Step 8: Commit**

Run:

```bash
git add packages/vite-plugin packages/manager/package.json pnpm-lock.yaml
git commit -m "feat: serve browser manager from vite plugin"
```

---

### Task 6: End-To-End Localhost Smoke And Documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: `/__pl__/manager`, browser manager API, source route.
- Produces: documented `story:dev` flow and verified local URL.

- [ ] **Step 1: Update README usage docs**

In `README.md`, after the existing Vite plugin setup section, add:

```md
### Local browser manager

You can also run OpenStory directly from a project folder without the desktop
app. Add a script that starts your existing Vite app in OpenStory mode:

```json
{
  "scripts": {
    "story:dev": "vite --mode openstory"
  }
}
```

Then run it from that project:

```bash
pnpm run story:dev
```

Open the manager at:

```text
http://localhost:<vite-port>/__pl__/manager
```

Use normal Vite flags if you want a fixed port:

```json
{
  "scripts": {
    "story:dev": "vite --mode openstory --port 4000"
  }
}
```

The browser manager loads only the project whose Vite server is running. The
desktop app is still the multi-project workspace manager and keeps native
features such as repository switching and detached preview windows.
```

In the existing Dogfooding section, replace references to opening
`apps/desktop` with `packages/manager`, because the reusable manager components
and `*.stories.*` files now live in the published manager package.

- [ ] **Step 2: Run full package verification**

Run:

```bash
pnpm --filter @gobrand/openstory-manager test
pnpm --filter @gobrand/openstory-manager typecheck
pnpm --filter @gobrand/openstory-vite test
pnpm --filter @gobrand/openstory-vite typecheck
pnpm --filter openstory-desktop test
pnpm --filter openstory-desktop typecheck
```

Expected: all pass.

- [ ] **Step 3: Run build verification**

Run:

```bash
pnpm build
```

Expected: Turbo completes successfully for config, runtime, manager, vite-plugin, and desktop.

- [ ] **Step 4: Manual smoke the browser manager**

Start the dogfood project on a fixed port:

```bash
pnpm --filter openstory-desktop exec vite --mode openstory --port 4000
```

Open:

```text
http://localhost:4000/__pl__/manager
```

Verify:

- The page loads the OpenStory manager, not the raw preview harness.
- The sidebar shows exactly one local project label.
- There is no repository add/remove/select menu.
- Selecting a component story renders it in the iframe.
- Docs mode still works.
- The pop-out button is not visible.
- The Code panel can load source for a selected story.

Stop the Vite server after verification.

- [ ] **Step 5: Commit**

Run:

```bash
git add README.md
git commit -m "docs: document localhost manager mode"
```

---

## Final Verification

- [ ] Run `git status --short` and confirm only intentional files are modified.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm build`.
- [ ] Launch the browser manager at `http://localhost:4000/__pl__/manager` from a real Vite project.
- [ ] Launch the Electron app with `pnpm --filter openstory-desktop dev` and confirm the desktop project picker and pop-out still exist.

## Self-Review Notes

- Spec coverage: the plan covers the consumer `vite --mode openstory` command, `/__pl__/manager`, shared UI, browser adapter, desktop-only UI gating, scoped source route, tests, docs, and unchanged agent render contract.
- Placeholder scan: no `TBD`, `TODO`, `implement later`, or unspecified package boundary remains. The package name is fixed as `@gobrand/openstory-manager`.
- Type consistency: all later tasks consume the `ManagerApi`, `BrowserManagerConfig`, `createBrowserManagerApi`, `reconcileSelection`, and source route names introduced in earlier tasks.
