import { useEffect, useRef } from 'react';
import type { AppState } from '../../electron/types';

export function useHarnessBridge(
  iframeRef: React.RefObject<HTMLIFrameElement | null>,
  selection: AppState['selection']
) {
  const latest = useRef(selection);
  latest.current = selection;

  function post() {
    const win = iframeRef.current?.contentWindow;
    const s = latest.current;
    if (!win || !s.previewId || !s.variantId) return;
    win.postMessage(
      {
        type: 'pl:render',
        previewId: s.previewId,
        variantId: s.variantId,
        viewport: s.viewport,
        fixtureOverrides: s.propOverrides,
      },
      '*'
    );
  }

  // Re-post on any selection/override change.
  useEffect(() => {
    post();
  }, [
    selection.previewId,
    selection.variantId,
    selection.viewport,
    selection.propOverrides,
  ]);

  // Re-post when the harness (re)loads and announces readiness.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if ((e.data as { type?: string })?.type === 'pl:ready') post();
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
}
