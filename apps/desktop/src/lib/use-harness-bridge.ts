import { useEffect, useRef } from "react";
import type { AppState } from "../../electron/types";
import type { Api } from "./api";

export function useHarnessBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  selection: AppState["selection"],
  api: Api,
) {
  const latest = useRef(selection);
  latest.current = selection;

  const apiRef = useRef(api);
  apiRef.current = api;

  // Callback ref keeps the message-listener effect ([] deps) from capturing a
  // stale `post` closure: it always invokes the latest implementation.
  const postRef = useRef<() => void>(() => {});
  postRef.current = () => {
    const win = iframeRef.current?.contentWindow;
    const s = latest.current;
    if (!win || !s.componentId || !s.storyId) return;
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

  // `propOverrides` is a fresh object on every state broadcast; key by its
  // contents so this effect only fires on a real override change.
  const propOverridesKey = JSON.stringify(selection.propOverrides);

  // Re-post on any selection/override change.
  useEffect(() => {
    postRef.current();
  }, [selection.componentId, selection.storyId, selection.viewport, propOverridesKey]);

  // Re-post when the harness (re)loads and announces readiness.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const type = (e.data as { type?: string })?.type;
      if (type === "pl:ready") postRef.current();
      // The harness re-posts pl:manifest when Vite HMR re-runs import.meta.glob
      // (a *.stories.tsx was added/removed) — refetch so the sidebar updates live.
      else if (type === "pl:manifest") apiRef.current?.invoke("preview:refreshManifest");
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
}
