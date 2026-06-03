import { useEffect, useRef } from 'react';
import type { AppState } from '../../electron/types';

export function useHarnessBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  selection: AppState['selection']
) {
  const latest = useRef(selection);
  latest.current = selection;

  // Callback ref keeps the message-listener effect ([] deps) from capturing a
  // stale `post` closure: it always invokes the latest implementation.
  const postRef = useRef<() => void>(() => {});
  postRef.current = () => {
    const win = iframeRef.current?.contentWindow;
    const s = latest.current;
    if (!win || !s.componentId || !s.storyId) return;
    win.postMessage(
      {
        type: 'pl:render',
        componentId: s.componentId,
        storyId: s.storyId,
        viewport: s.viewport,
        fixtureOverrides: s.propOverrides,
      },
      '*'
    );
  };

  // `propOverrides` is a fresh object on every state broadcast; key by its
  // contents so this effect only fires on a real override change.
  const propOverridesKey = JSON.stringify(selection.propOverrides);

  // Re-post on any selection/override change.
  useEffect(() => {
    postRef.current();
  }, [
    selection.componentId,
    selection.storyId,
    selection.viewport,
    propOverridesKey,
  ]);

  // Re-post when the harness (re)loads and announces readiness.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if ((e.data as { type?: string })?.type === 'pl:ready') postRef.current();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
}
