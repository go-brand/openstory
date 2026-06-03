import type { AppState, ManifestComponent } from "../../electron/types";
import type { Api } from "../lib/api";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import {
  HugeiconsIcon,
  PackageIcon,
  ComputerIcon,
  SmartPhone01Icon,
  SourceCodeIcon,
  SlidersHorizontalIcon,
  LinkSquare02Icon,
  ArrowShrink02Icon,
} from "../lib/icons";

export type PanelMode = "inspect" | "code" | null;

type Story = ManifestComponent["stories"][number] | undefined;

// Per-tab toolbar under the titlebar: the active component "tab" (one for now —
// seam for future multi-tab), the viewport toggle (moved here from the canvas),
// and the right-aligned Code / Inspect panel switches plus pop-out.
export function Toolbar({
  state,
  api,
  component,
  story,
  panelMode,
  setPanelMode,
}: {
  state: AppState;
  api: Api;
  component: ManifestComponent | undefined;
  story: Story;
  panelMode: PanelMode;
  setPanelMode: (mode: PanelMode) => void;
}) {
  function setViewport(viewport: "desktop" | "mobile") {
    if (component && story) {
      api?.invoke("preview:set", {
        componentId: component.id,
        storyId: story.id,
        viewport,
      });
    }
  }

  function togglePanel(mode: Exclude<PanelMode, null>) {
    setPanelMode(panelMode === mode ? null : mode);
  }

  return (
    <div className="no-drag flex h-11 shrink-0 items-center gap-3 border-b border-border bg-sidebar/50 px-3">
      <div className="flex h-7 items-center gap-2 rounded-lg border border-border bg-foreground/[0.03] px-3 text-[12px] text-foreground">
        <HugeiconsIcon icon={PackageIcon} className="size-3.5 text-muted-foreground" />
        <span className="font-medium">{component?.id ?? "No component"}</span>
      </div>

      <div className="inline-flex items-center gap-0.5 rounded-lg bg-foreground/[0.04] p-0.5 ring-1 ring-border ring-inset">
        {(["desktop", "mobile"] as const).map((v) => (
          <Button
            key={v}
            variant={state.selection.viewport === v ? "active" : "ghost"}
            size="sm"
            disabled={!component}
            onClick={() => setViewport(v)}
          >
            <HugeiconsIcon icon={v === "desktop" ? ComputerIcon : SmartPhone01Icon} />
            {v === "desktop" ? "Desktop" : "Mobile"}
          </Button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant={panelMode === "code" ? "active" : "ghost"}
          size="sm"
          disabled={!component}
          onClick={() => togglePanel("code")}
        >
          <HugeiconsIcon icon={SourceCodeIcon} />
          Code
        </Button>
        <Button
          variant={panelMode === "inspect" ? "active" : "ghost"}
          size="sm"
          disabled={!component}
          onClick={() => togglePanel("inspect")}
        >
          <HugeiconsIcon icon={SlidersHorizontalIcon} />
          Inspect
        </Button>
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => api?.invoke(state.detachedOpen ? "preview:popIn" : "preview:popOut")}
        >
          <HugeiconsIcon icon={state.detachedOpen ? ArrowShrink02Icon : LinkSquare02Icon} />
          {state.detachedOpen ? "Pop in" : "Pop out"}
        </Button>
      </div>
    </div>
  );
}
