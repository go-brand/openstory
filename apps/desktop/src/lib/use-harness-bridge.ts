import { useEffect, useRef, useState } from "react";
import type { AppState } from "../../electron/types";
import type { Api } from "./api";
import { ADDONS, NO_ADDONS, type AddonState } from "./preview-view";

/** Size the harness reports for the rendered story (pl:size).
 *  - `undefined`: no report yet for the current selection (still loading) — the
 *    manager keeps the iframe hidden so it never flashes full-size then snaps to
 *    the component size.
 *  - `"fill"`: the harness asked to fill the canvas (fullscreen layout).
 *  - `{width,height}`: the component's measured box; the manager sizes to it. */
export type ContentSize = { width: number; height: number } | "fill" | undefined;

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
          ...(s.layout && { layout: s.layout }),
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
        ...(s.layout && { layout: s.layout }),
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
  // contents so this effect only fires on a real override change.
  const propOverridesKey = JSON.stringify(selection.propOverrides);

  // Re-post on any selection/override change (docs toggle included). Clear the
  // last reported size first so a new selection fills the canvas until its own
  // pl:size arrives — otherwise the previous story's dimensions would briefly
  // size the new one.
  useEffect(() => {
    setContentSize(undefined);
    postRef.current();
  }, [
    selection.componentId,
    selection.storyId,
    selection.viewport,
    selection.layout,
    selection.docsComponentId,
    selection.pageId,
    propOverridesKey,
  ]);

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
      // The harness reports the rendered component's size; 0×0 means "fill the
      // canvas" (fullscreen layout).
      else if (type === "pl:size") {
        const d = e.data as { width?: number; height?: number };
        const width = Number(d.width) || 0;
        const height = Number(d.height) || 0;
        setContentSize(width > 0 && height > 0 ? { width, height } : "fill");
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return { reload, contentSize };
}
