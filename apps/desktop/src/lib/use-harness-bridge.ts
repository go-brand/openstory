import { useEffect, useRef, useState } from "react";
import type { AppState } from "../../electron/types";
import type { Api } from "./api";
import { ADDONS, NO_ADDONS, type AddonState } from "./preview-view";
import { markPreviewRequest, measurePreviewVisible, type PreviewRequestKind } from "./performance";

// Mirrors @gobrand/openstory-runtime's NavigateTarget. Duplicated (not imported)
// because the desktop does not depend on the runtime package. The message arrives as plain JSON,
// so structural typing is sufficient.
export type NavigateTarget =
  | { kind: "page"; id: string }
  | { kind: "docs"; componentId: string }
  | { kind: "story"; componentId: string; storyId: string }
  | { kind: "external"; href: string };

// Map a clicked in-doc link to the manager's existing selection IPC. A `story`
// preserves the user's current viewport; `external` opens in the real browser.
export function dispatchNavigate(
  api: NonNullable<Api>,
  target: NavigateTarget,
  viewport: "desktop" | "mobile",
): void {
  switch (target.kind) {
    case "page":
      markPreviewRequest("page");
      api.invoke("preview:setPage", target.id);
      break;
    case "docs":
      markPreviewRequest("docs");
      api.invoke("preview:setDocs", target.componentId);
      break;
    case "story":
      markPreviewRequest("story");
      api.invoke("preview:set", {
        componentId: target.componentId,
        storyId: target.storyId,
        viewport,
      });
      break;
    case "external":
      api.invoke("shell:openExternal", target.href);
      break;
  }
}

/** Size the harness reports for the rendered story (pl:size).
 *  - `undefined`: no report yet for the current selection (still loading) — the
 *    manager keeps the iframe hidden so it never flashes full-size then snaps to
 *    the component size.
 *  - `"fill"`: a docs/page surface asked to fill the canvas.
 *  - `{width,height}`: the component's measured box; the manager sizes to it. */
export type ContentSize = { width: number; height: number } | "fill" | undefined;

export function renderFallbackDelayMs(selection: AppState["selection"]): number {
  return selection.docsComponentId || selection.pageId ? 50 : 120;
}

function previewKind(selection: AppState["selection"]): PreviewRequestKind {
  if (selection.pageId) return "page";
  if (selection.docsComponentId) return "docs";
  return "story";
}

export function useHarnessBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  selection: AppState["selection"],
  api: Api,
  addons: AddonState = NO_ADDONS,
  docs: AppState["docs"] = [],
  theme: AppState["theme"] = "light",
): { reload: () => void; contentSize: ContentSize } {
  const latest = useRef(selection);
  latest.current = selection;

  // The harness reports the rendered component's own size so the manager can
  // size the preview iframe to it (vs stretching it full). Starts `undefined`
  // (loading) on every selection; a 0×0 report (fullscreen) becomes "fill".
  const [contentSize, setContentSize] = useState<ContentSize>(undefined);

  // The iframe is a separate document, so the manager's `.dark` class never
  // reaches it. Mirror the manager theme over postMessage; the harness toggles
  // `.dark` on its own root so the consumer's shadcn tokens (and DocHost's
  // themed doc surface) resolve in the same theme the manager is showing.
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const postThemeRef = useRef<() => void>(() => {});
  postThemeRef.current = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: "os:theme", theme: themeRef.current }, "*");
  };

  const apiRef = useRef(api);
  apiRef.current = api;

  const docsRef = useRef(docs);
  docsRef.current = docs;

  // Callback ref keeps the message-listener effect ([] deps) from capturing a
  // stale `post` closure: it always invokes the latest implementation.
  const postRef = useRef<() => void>(() => {});
  postRef.current = () => {
    const win = iframeRef.current?.contentWindow;
    const s = latest.current;
    if (!win) return;
    // Page selection: render a standalone feature-docs page (html + embeds).
    if (s.pageId) {
      const doc = docsRef.current.find((d) => d.id === s.pageId);
      if (doc) {
        win.postMessage(
          {
            type: "pl:render",
            mode: "page",
            componentId: "",
            storyId: "",
            viewport: s.viewport,
            pageHtml: doc.html,
            pageEmbeds: doc.embeds,
          },
          "*",
        );
      }
      return;
    }
    // Docs selection wins: render the component's stacked docs page instead of a
    // single story. `storyId`/overrides are ignored by the host in docs mode.
    if (s.docsComponentId) {
      win.postMessage(
        {
          type: "pl:render",
          mode: "docs",
          componentId: s.docsComponentId,
          storyId: "",
          viewport: s.viewport,
        },
        "*",
      );
      return;
    }
    if (!s.componentId || !s.storyId) return;
    win.postMessage(
      {
        type: "pl:render",
        componentId: s.componentId,
        storyId: s.storyId,
        viewport: s.viewport,
        fixtureOverrides: s.propOverrides,
      },
      "*",
    );
  };

  const addonsRef = useRef(addons);
  addonsRef.current = addons;

  const postAddonsRef = useRef<() => void>(() => {});
  postAddonsRef.current = () => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    for (const addon of ADDONS) {
      win.postMessage({ type: "os:addon", addon, enabled: addonsRef.current[addon] }, "*");
    }
  };

  const reload = () => {
    iframeRef.current?.contentWindow?.postMessage({ type: "os:reload" }, "*");
  };

  // `propOverrides` is a fresh object on every state broadcast; key by its
  // contents so we only react to a real override change.
  const propOverridesKey = JSON.stringify(selection.propOverrides);
  const selectionKey = [
    selection.componentId,
    selection.storyId,
    selection.viewport,
    selection.docsComponentId,
    selection.pageId,
    propOverridesKey,
  ].join("|");
  const fallbackDelayMs = renderFallbackDelayMs(selection);

  // Reset the reported size to `undefined` (loading) the MOMENT the selection
  // changes — synchronously during render, NOT in an effect. Effects run after
  // the browser paints, so resetting there leaves the first frame of a
  // docs→story switch painting with the previous selection's size still in
  // state: docs never reports a size, so `contentSize` sits at "fill", and the
  // manager renders the story iframe full-canvas from the top-left for one frame
  // before the real size arrives and snaps it to the centered box. Adjusting
  // state during render (guarded by the previous key) drops that stale frame.
  const prevSelectionKey = useRef(selectionKey);
  if (prevSelectionKey.current !== selectionKey) {
    prevSelectionKey.current = selectionKey;
    setContentSize(undefined);
  }

  // Re-post the render request on any selection/override change (docs toggle
  // included). A fallback timer flips the size to "fill" if no pl:size arrives —
  // so a harness that never reports one (e.g. an older published runtime without
  // the size bridge) still shows the preview instead of staying hidden forever.
  useEffect(() => {
    postRef.current();
    const t = setTimeout(() => {
      setContentSize((cur) => {
        if (cur !== undefined) return cur;
        measurePreviewVisible(previewKind(latest.current));
        return "fill";
      });
    }, fallbackDelayMs);
    return () => clearTimeout(t);
  }, [selectionKey, fallbackDelayMs]);

  // Re-post addon toggles whenever they change.
  const addonsKey = JSON.stringify(addons);
  useEffect(() => {
    postAddonsRef.current();
  }, [addonsKey]);

  // Re-post the theme whenever the manager flips light/dark.
  useEffect(() => {
    postThemeRef.current();
  }, [theme]);

  // Re-post when the harness (re)loads and announces readiness.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const type = (e.data as { type?: string })?.type;
      if (type === "pl:ready") {
        postRef.current();
        postAddonsRef.current();
        postThemeRef.current();
      }
      // The harness re-posts pl:manifest when Vite HMR re-runs import.meta.glob
      // (a *.stories.tsx was added/removed) — refetch so the sidebar updates live.
      else if (type === "pl:manifest") apiRef.current?.invoke("preview:refreshManifest");
      // The harness reports the rendered component's size; 0×0 means a docs/page
      // surface should fill the canvas.
      else if (type === "pl:size") {
        const d = e.data as { width?: number; height?: number };
        const width = Number(d.width) || 0;
        const height = Number(d.height) || 0;
        const nextSize = width > 0 && height > 0 ? { width, height } : "fill";
        setContentSize((cur) => {
          if (cur === undefined) measurePreviewVisible(previewKind(latest.current));
          return nextSize;
        });
      } else if (type === "pl:navigate") {
        // Only the preview iframe may drive navigation: pl:navigate can open the
        // user's real browser (shell:openExternal) and change the selection, so
        // ignore messages from any other window. Defense-in-depth — the main
        // process additionally scheme-guards shell:openExternal.
        if (e.source !== iframeRef.current?.contentWindow) return;
        const api = apiRef.current;
        if (api) {
          dispatchNavigate(
            api,
            (e.data as { target: NavigateTarget }).target,
            latest.current.viewport,
          );
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return { reload, contentSize };
}
