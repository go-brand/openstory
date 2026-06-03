import { useRef } from "react";
import { HugeiconsIcon, Cursor02Icon, Pin02Icon, Cancel01Icon } from "../lib/icons";
import type { AppState } from "../../electron/types";
import type { Api } from "../lib/api";
import { useHarnessBridge } from "../lib/use-harness-bridge";
import { Slider } from "../components/ui/slider";
import { Checkbox } from "../components/ui/checkbox";

export function DetachedPreview({ state, api }: { state: AppState; api: Api }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  useHarnessBridge(iframeRef, state.selection);

  const preview =
    state.manifest.find((p) => p.id === state.selection.previewId) ?? state.manifest[0];
  const canvasBg = preview?.background ?? "#f4f4f5";

  const canvasStyle: React.CSSProperties = {
    background: canvasBg,
    opacity: state.overlay.opacity,
    mixBlendMode: state.overlay.blendMode,
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-transparent">
      <div className="drag relative flex h-8 items-center justify-center gap-1.5 bg-neutral-950/70 text-[10px] font-medium tracking-[0.12em] text-neutral-400 uppercase backdrop-blur-md">
        <span className="size-1.5 rounded-full bg-accent shadow-[0_0_8px] shadow-accent/60" />
        OpenStory Preview
        <button
          className="no-drag absolute right-2 flex items-center justify-center rounded-md p-1 text-neutral-500 transition-colors hover:bg-white/[0.08] hover:text-neutral-100"
          onClick={() => api?.invoke("preview:popIn")}
          aria-label="Close preview"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-hidden" style={canvasStyle}>
        {state.iframeUrl && (
          <iframe
            ref={iframeRef}
            src={state.iframeUrl}
            className="h-full w-full border-0 bg-transparent"
          />
        )}
      </div>
      <div className="no-drag flex flex-col gap-4 border-t border-line bg-neutral-950/85 p-4 backdrop-blur-md">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-neutral-400">Opacity</span>
            <span className="tabular-nums text-neutral-300">
              {Math.round(state.overlay.opacity * 100)}%
            </span>
          </div>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[state.overlay.opacity]}
            onValueChange={(v) => api?.invoke("overlay:setOpacity", v[0] ?? 1)}
          />
        </div>
        <div className="flex flex-col gap-2.5">
          <label className="flex cursor-pointer items-center gap-2.5 text-[11px] text-neutral-300">
            <Checkbox
              checked={state.overlay.blendMode === "difference"}
              onCheckedChange={(c) =>
                api?.invoke("overlay:setBlendMode", c ? "difference" : "normal")
              }
            />
            Difference blend
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-[11px] text-neutral-300">
            <Checkbox
              checked={state.overlay.clickThrough}
              onCheckedChange={(c) => api?.invoke("overlay:setClickThrough", Boolean(c))}
            />
            <HugeiconsIcon icon={Cursor02Icon} className="size-3.5 text-neutral-500" />{" "}
            Click-through
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-[11px] text-neutral-300">
            <Checkbox
              checked={state.overlay.alwaysOnTop}
              onCheckedChange={(c) => api?.invoke("window:setAlwaysOnTop", Boolean(c))}
            />
            <HugeiconsIcon icon={Pin02Icon} className="size-3.5 text-neutral-500" /> Always on top
          </label>
        </div>
      </div>
    </div>
  );
}
