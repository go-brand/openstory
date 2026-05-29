import { useRef } from 'react';
import { MousePointerClick, Pin } from 'lucide-react';
import type { AppState } from '../../electron/types';
import type { Api } from '../lib/api';
import { useHarnessBridge } from '../lib/use-harness-bridge';
import { Slider } from '../components/ui/slider';
import { Checkbox } from '../components/ui/checkbox';

const PLATFORM_BG: Record<string, string> = {
  linkedin: '#f3f2ef',
  x: '#000000',
  instagram: '#fafafa',
  tiktok: '#000000',
  threads: '#101010',
  facebook: '#f0f2f5',
  youtube: '#0f0f0f',
  bluesky: '#ffffff',
};

export function DetachedPreview({ state, api }: { state: AppState; api: Api }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  useHarnessBridge(iframeRef, state.selection);

  const preview =
    state.manifest.find((p) => p.id === state.selection.previewId) ??
    state.manifest[0];
  const platformBg = (preview && PLATFORM_BG[preview.platform]) ?? '#f3f2ef';

  const canvasStyle: React.CSSProperties = {
    background: platformBg,
    opacity: state.overlay.opacity,
    mixBlendMode: state.overlay.blendMode,
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-transparent">
      <div className="drag flex h-7 items-center justify-center bg-neutral-900/70 text-[10px] text-neutral-400 backdrop-blur">
        OpenStory Preview · drag
      </div>
      <div
        className="flex flex-1 items-center justify-center overflow-hidden"
        style={canvasStyle}
      >
        {state.iframeUrl && (
          <iframe
            ref={iframeRef}
            src={state.iframeUrl}
            className="h-full w-full border-0 bg-transparent"
          />
        )}
      </div>
      <div className="no-drag flex flex-col gap-2 bg-neutral-900/85 p-3 backdrop-blur">
        <div className="flex items-center justify-between text-[11px] text-neutral-400">
          <span>Opacity</span>
          <span className="tabular-nums">
            {Math.round(state.overlay.opacity * 100)}%
          </span>
        </div>
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={[state.overlay.opacity]}
          onValueChange={(v) => api?.invoke('overlay:setOpacity', v[0] ?? 1)}
        />
        <label className="flex items-center gap-2 text-[11px] text-neutral-400">
          <Checkbox
            checked={state.overlay.blendMode === 'difference'}
            onCheckedChange={(c) =>
              api?.invoke('overlay:setBlendMode', c ? 'difference' : 'normal')
            }
          />
          Difference blend
        </label>
        <label className="flex items-center gap-2 text-[11px] text-neutral-400">
          <Checkbox
            checked={state.overlay.clickThrough}
            onCheckedChange={(c) =>
              api?.invoke('overlay:setClickThrough', Boolean(c))
            }
          />
          <MousePointerClick className="size-3" /> Click-through
        </label>
        <label className="flex items-center gap-2 text-[11px] text-neutral-400">
          <Checkbox
            checked={state.overlay.alwaysOnTop}
            onCheckedChange={(c) =>
              api?.invoke('window:setAlwaysOnTop', Boolean(c))
            }
          />
          <Pin className="size-3" /> Always on top
        </label>
      </div>
    </div>
  );
}
