# Localhost manager mode

**Date:** 2026-07-01
**Status:** Approved design, pre-implementation
**Builds on:** [native app shell](./2026-05-31-native-app-shell-design.md), [main app detached preview](./2026-05-29-main-app-detached-preview-design.md), [agent-first MCP render](./2026-06-29-agent-first-mcp-render-design.md)

## Problem

OpenStory currently has one manager surface: the Electron desktop app. That is a
good fit for managing many projects from one place, because the desktop main
process owns the project list, folder picker, persisted selection, Vite server
startup, and detached overlay window.

But a project should also be runnable directly from its own folder:

```bash
cd ~/Desktop/tanstack-start/apps/app
pnpm run story:dev
```

The desired local flow is a normal Vite command:

```json
{
  "scripts": {
    "story:dev": "vite --mode openstory"
  }
}
```

That command should launch one browser-accessible OpenStory manager for only
that cwd project. The UI should be 99% shared with the desktop app. The desktop
app keeps desktop-only affordances: workspace picker, multi-project switching,
and detached popup/overlay window.

## Why this is tractable

The codebase already has the right split:

- The visible manager UI lives in `apps/desktop/src` and receives an `AppState`
  plus an `Api` bridge.
- The Electron-specific behavior is mostly outside the UI, in
  `apps/desktop/electron`: `AppStore`, IPC handlers, `ViteHost`, and window
  creation.
- The consumer project's Vite plugin already serves the harness, manifest,
  headless render route, and MCP endpoint under `/__pl__`.

The main missing piece is a browser implementation of the manager API/state
contract, served by the Vite plugin, so the shared React UI can run without
Electron.

## Decisions

1. **Use the consumer Vite server, not a separate OpenStory CLI server.**
   The supported local command is `vite --mode openstory` from the project root.
2. **Serve the browser manager at `/__pl__/manager`.** The existing harness
   remains at `/__pl__/`, so iframe previews and agent render URLs keep their
   current contract.
3. **Share the React manager UI.** Desktop and browser manager modes should use
   the same `MainApp`, sidebar tree, toolbar, canvas, right panel, docs/design
   modes, controls, theme, layout, viewport, addons, and harness bridge.
4. **Split the manager backend behind an adapter.** Desktop uses the current
   Electron IPC bridge. Browser mode uses a web bridge that fetches plugin
   routes and stores selection locally in the browser.
5. **Hide desktop-only controls in browser mode.** Browser mode has one active
   project and no native windows, so it does not show repository add/remove,
   project switching, or pop-out/detached overlay controls.
6. **Keep source reads server-side and scoped.** The Code panel can still read
   source in browser mode, but the vite-plugin must provide a route that only
   returns files from the active project root and preserves the existing byte
   cap.

## Non-goals

- A separate `openstory dev --port 4000` CLI wrapper.
- Multi-project switching in the browser manager.
- A browser equivalent of the detached transparent overlay window.
- Changing the agent render URL contract at `/__pl__/?component=...`.
- Persisting browser selections across machines or projects. Local browser
  storage is acceptable; cross-project workspace state remains desktop-only.

## Routes

The Vite plugin continues to own `/__pl__`, with these surfaces:

| Route | Purpose |
| --- | --- |
| `/__pl__/` | Existing preview harness loaded inside the manager iframe and by headless render URLs. |
| `/__pl__/manifest.json` | Existing project manifest used by desktop and browser managers. |
| `/__pl__/mcp` | Existing read-only MCP endpoint. |
| `/__pl__/manager` | New browser manager HTML shell. |
| `/__pl__/manager/source?component=<id>` | New source route for the browser Code panel. |

`/__pl__/manager` should be a real browser app entry, not the preview harness.
The manager iframe still points at `/__pl__/`, just as Electron does today.

## Architecture

```text
Consumer project root
  package.json: "story:dev": "vite --mode openstory"
        |
        v
@gobrand/openstory-vite configureServer
  /__pl__/manager  -> shared manager React entry
  /__pl__/         -> existing runtime preview harness
  /__pl__/manifest -> existing manifest assembly
        |
        v
Browser manager app
  createWebManagerApi(project metadata, routes)
        |
        v
Shared OpenStory UI
  MainApp state/api
  Sidebar / Toolbar / Canvas / RightPanel
        |
        v
iframe src="/__pl__/"
  runtime renders stories/docs and posts bridge messages
```

Desktop keeps the same high-level shape, but its adapter remains
`window.openStory` through Electron preload and IPC:

```text
Electron main process
  AppStore + ViteHost + registerIpc
        |
        v
Electron preload window.openStory
        |
        v
Shared OpenStory UI
```

## UI boundary

Add an explicit runtime mode to the manager UI, derived from the selected
adapter:

```ts
type ManagerSurface = "desktop" | "browser";
```

The shared `AppState` stays mostly intact. Browser mode creates a single
`ProjectRecord` from plugin-provided metadata:

```ts
{
  id: "local",
  name: "<package name or folder basename>",
  path: "<display-only project root>",
  addedAt: "<startup timestamp>"
}
```

The selected `projectId` is always `"local"`.

Mode-specific UI rules:

- `RepoSwitcher` shows the current project label in browser mode but does not
  open the repository menu.
- `Sidebar` tree behavior is unchanged.
- `Toolbar` hides the pop-out/pop-in button in browser mode.
- `Titlebar` remains safe for web rendering, but native drag/window styling is
  meaningful only in Electron.
- `DetachedPreview` remains Electron-only and is never selected by browser mode.

The goal is to avoid a forked browser UI. Mode checks should be narrow and
attached to desktop-only affordances.

## Manager adapter

Replace the renderer's direct assumption that `Api = OpenStoryApi | undefined`
with a small manager client interface that both Electron and browser can
implement.

The interface can stay intentionally close to the current preload shape:

```ts
type ManagerApi = {
  surface: "desktop" | "browser";
  invoke<K extends keyof IpcInvoke>(
    channel: K,
    ...args: Parameters<IpcInvoke[K]>
  ): Promise<ReturnType<IpcInvoke[K]>>;
  on<K extends keyof IpcEvents>(
    channel: K,
    listener: IpcEvents[K]
  ): () => void;
};
```

Desktop adapter:

- wraps `window.openStory`;
- sets `surface: "desktop"`;
- preserves all existing IPC semantics.

Browser adapter:

- owns `AppState` in memory;
- fetches `/__pl__/manifest.json`;
- builds `iframeUrl` as `/__pl__/`;
- emits `"state:update"` to local subscribers after state changes;
- implements shared selection channels locally:
  - `preview:set`
  - `preview:setProps`
  - `preview:setLayout`
  - `preview:setDocs`
  - `preview:setPage`
  - `preview:setMode`
  - `preview:refreshManifest`
  - `preview:getSource`
  - `theme:set`
  - `shell:openExternal`
- implements desktop-only project/window/overlay channels as no-ops or rejects
  them behind hidden UI:
  - `project:pickFolder`
  - `project:add`
  - `project:select`
  - `project:remove`
  - `preview:popOut`
  - `preview:popIn`
  - `overlay:*`
  - `window:setAlwaysOnTop`

Because the browser UI should hide desktop-only controls, those no-op channels
are defensive compatibility, not expected primary paths.

## Browser state flow

On manager boot:

1. Read injected metadata from the manager HTML shell:
   `projectName`, `projectRootDisplay`, `manifestUrl`, `harnessUrl`,
   `sourceUrl`.
2. Initialize `AppState` with one local project, default selection, theme, empty
   manifest/docs, and `vite.status = "starting"`.
3. Fetch `/__pl__/manifest.json`.
4. Populate `manifest` and `docs`.
5. Reconcile selection using the existing `reconcileSelection` and
   `defaultMode` helpers, moved or re-exported so browser code can use them
   without importing Electron-only modules.
6. Emit `"state:update"`.

On `preview:refreshManifest`, repeat steps 3-6.

On harness `pl:manifest`, the existing `useHarnessBridge` path should call
`preview:refreshManifest`, so browser and desktop both update live when story
files are added or removed.

## Source route

Browser mode cannot read local files from the renderer, so the Vite plugin adds:

```text
GET /__pl__/manager/source?component=<id>
```

Behavior:

- Assemble or reuse the current manifest.
- Find a component or doc by id, matching desktop's `preview:getSource` fallback
  behavior.
- Resolve the source path.
- Return `404` when there is no source path or no matching manifest entry.
- Return `403` when the resolved path escapes `projectRoot`.
- Return `413` when the file exceeds the existing 256 KiB source cap.
- Return JSON `{ path, code }` on success.

The containment helper should be shared or duplicated carefully from
`apps/desktop/electron/ipc.ts`: the route must only expose files inside the
active Vite project root.

## Plugin packaging

The vite-plugin package currently does not depend on React UI code from
`apps/desktop`, and published packages should not import from a private app
directory. The implementation should introduce a published manager bundle source
that can be consumed by the plugin build.

Structure:

- Move reusable manager renderer code from `apps/desktop/src` into
  `packages/manager`, published as `@gobrand/openstory-manager`.
- Keep Electron-only code in `apps/desktop`.
- Let `apps/desktop` import the manager package for its renderer.
- Let `@gobrand/openstory-vite` serve the manager package's browser entry.

This is larger than simply importing from `apps/desktop/src`, but it keeps the
published packages honest: when installed in an outside project, the plugin can
serve `/__pl__/manager` without depending on private app source files.

## Error handling

- **Manifest fetch fails:** browser state becomes `vite.status = "error"` with
  the response text or thrown message. The existing empty/loading canvas states
  should render the failure.
- **Manifest is empty:** same behavior as desktop: sidebar shows the empty
  project state.
- **Source fetch fails:** Code panel falls back to the generated snippet or shows
  the existing unavailable-source state.
- **External links:** browser adapter opens allowed external URLs with
  `window.open(href, "_blank", "noopener,noreferrer")`. Desktop keeps using the
  main-process `shell:openExternal` allowlist.
- **Unsupported desktop action in browser mode:** no visible UI should call it;
  if invoked, the browser adapter logs a warning and leaves state unchanged.

## Testing

Add focused tests at the boundaries:

- Browser adapter initialization fetches manifest, builds one local project, and
  reconciles/defaults selection.
- Browser adapter selection channels update state and emit `"state:update"`.
- Browser adapter `preview:refreshManifest` updates docs/components after a
  manifest change.
- Browser source route returns source for components and docs, and rejects path
  traversal, missing ids, and oversized files.
- Plugin serves manager HTML at `/__pl__/manager` without breaking the existing
  `/__pl__/`, `/__pl__/manifest.json`, and `/__pl__/mcp` routes.
- UI gating hides project picker controls and pop-out controls in browser mode
  while preserving them in desktop mode.
- Existing desktop smoke tests still pass.

If practical, add a Playwright smoke test against a Vite fixture:

1. Start Vite with `openStory()` in `openstory` mode.
2. Open `/__pl__/manager`.
3. Assert the sidebar lists fixture stories.
4. Select a story.
5. Assert the iframe renders the harness and receives selection messages.

## Rollout

1. Introduce the manager adapter interface without behavior changes in Electron.
2. Extract or package the shared manager renderer so the vite-plugin can serve
   it to consumer projects.
3. Add the browser adapter and manager route.
4. Gate desktop-only UI controls behind `surface === "desktop"`.
5. Add source route and browser Code panel support.
6. Document the local script:

   ```json
   {
     "scripts": {
       "story:dev": "vite --mode openstory"
     }
   }
   ```

7. Update README to point users at
   `http://localhost:<vite-port>/__pl__/manager`.

## Port behavior

The default port remains Vite-owned. Users can choose a fixed port with their
normal Vite flags, for example `vite --mode openstory --port 4000`.
