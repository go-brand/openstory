import { useRef } from "react";
import { HugeiconsIcon, Cursor02Icon, Pin02Icon, ArrowShrink02Icon } from "../lib/icons";
import type { AppState } from "../../electron/types";
import type { Api } from "../lib/api";
import { useHarnessBridge } from "../lib/use-harness-bridge";
import { Slider } from "../components/ui/slider";
import { Checkbox } from "../components/ui/checkbox";

export function DetachedPreview({ state, api }: { state: AppState; api: Api }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  useHarnessBridge(iframeRef, state.selection, api);

  // The canvas stays fully transparent so the window can sit over a real site
  // and the component is compared 1:1 against it (opacity ghosts it, difference
  // blend diffs its pixels against whatever shows through). No preset background
  // here — that would defeat the see-through overlay.
  const canvasStyle: React.CSSProperties = {
    opacity: state.overlay.opacity,
    mixBlendMode: state.overlay.blendMode,
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden rounded-xl border border-border bg-transparent text-foreground">
      {/* Titlebar — mirrors the main app's wordmark/brand-dot, translucent so the
          overlay reads as floating glass chrome over the site behind it. */}
      <header className="drag relative flex h-11 shrink-0 items-center gap-2 border-b border-border bg-sidebar/80 pr-2 pl-3 backdrop-blur-md">
        <span className="size-2 rounded-full bg-brand shadow-[0_0_12px] shadow-brand/60" />
        <span className="text-[12px] font-semibold tracking-[0.18em] text-foreground uppercase">
          OpenStory
        </span>
        <button
          type="button"
          onClick={() => api?.invoke("preview:popIn")}
          aria-label="Pop in"
          title="Pop in"
          className="no-drag ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowShrink02Icon} className="size-3.5" />
        </button>
      </header>

      <div className="flex flex-1 items-center justify-center overflow-hidden" style={canvasStyle}>
        {state.iframeUrl && (
          <iframe
            ref={iframeRef}
            src={state.iframeUrl}
            className="h-full w-full border-0 bg-transparent"
          />
        )}
      </div>

      {/* Overlay controls — same spacing/typography as the right panel's inspector. */}
      <div className="no-drag flex flex-col gap-5 border-t border-border bg-sidebar/80 px-5 py-4 backdrop-blur-md">
        <label className="flex flex-col gap-1.5 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="font-medium text-muted-foreground">Opacity</span>
            <span className="tabular-nums text-foreground">
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
        </label>

        <div className="flex flex-col gap-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-[12px] text-foreground">
            <Checkbox
              checked={state.overlay.blendMode === "difference"}
              onCheckedChange={(c) =>
                api?.invoke("overlay:setBlendMode", c ? "difference" : "normal")
              }
            />
            Difference blend
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-[12px] text-foreground">
            <Checkbox
              checked={state.overlay.clickThrough}
              onCheckedChange={(c) => api?.invoke("overlay:setClickThrough", Boolean(c))}
            />
            <HugeiconsIcon icon={Cursor02Icon} className="size-3.5 text-muted-foreground" />
            Click-through
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-[12px] text-foreground">
            <Checkbox
              checked={state.overlay.alwaysOnTop}
              onCheckedChange={(c) => api?.invoke("window:setAlwaysOnTop", Boolean(c))}
            />
            <HugeiconsIcon icon={Pin02Icon} className="size-3.5 text-muted-foreground" />
            Always on top
          </label>
        </div>
      </div>
    </div>
  );
}
