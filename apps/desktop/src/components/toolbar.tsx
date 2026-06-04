import type { AppState, ManifestComponent } from "../../electron/types";
import type { Api } from "../lib/api";
import type { AddonName, AddonState } from "../lib/preview-view";
import { zoomLabel } from "../lib/preview-view";
import { cn } from "../lib/utils";
import {
  HugeiconsIcon,
  ComputerIcon,
  SmartPhone01Icon,
  LinkSquare02Icon,
  ArrowShrink02Icon,
  RefreshIcon,
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
  RulerIcon,
  GridIcon,
  DashedLine02Icon,
} from "../lib/icons";

type Story = ManifestComponent["stories"][number] | undefined;

const ADDON_ICONS: Record<AddonName, typeof RulerIcon> = {
  measure: RulerIcon,
  grid: GridIcon,
  outline: DashedLine02Icon,
};
const ADDON_LABELS: Record<AddonName, string> = {
  measure: "Measure",
  grid: "Grid",
  outline: "Outline",
};

// Icon-only canvas toolbar (Storybook-style): reload · zoom · addons · viewport · pop-out.
export function Toolbar({
  state,
  api,
  component,
  story,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  addons,
  onToggleAddon,
  onReload,
}: {
  state: AppState;
  api: Api;
  component: ManifestComponent | undefined;
  story: Story;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  addons: AddonState;
  onToggleAddon: (addon: AddonName) => void;
  onReload: () => void;
}) {
  function setViewport(viewport: "desktop" | "mobile") {
    if (component && story) {
      api?.invoke("preview:set", { componentId: component.id, storyId: story.id, viewport });
    }
  }

  const noPreview = !component;

  return (
    <div className="no-drag flex h-11 shrink-0 items-center gap-1 border-b border-border bg-toolbar px-2">
      <ToolButton title="Reload" icon={RefreshIcon} disabled={noPreview} onClick={onReload} />
      <Divider />
      <ToolButton
        title="Zoom out"
        icon={ZoomOutAreaIcon}
        disabled={noPreview}
        onClick={onZoomOut}
      />
      <span className="min-w-[38px] text-center text-[11px] tabular-nums text-toolbar-icon">
        {zoomLabel(zoom)}
      </span>
      <ToolButton title="Zoom in" icon={ZoomInAreaIcon} disabled={noPreview} onClick={onZoomIn} />
      <ToolButton
        title="Reset zoom"
        icon={RefreshIcon}
        disabled={noPreview || zoom === 1}
        onClick={onZoomReset}
      />
      <Divider />
      {(["measure", "grid", "outline"] as const).map((addon) => (
        <ToolButton
          key={addon}
          title={ADDON_LABELS[addon]}
          icon={ADDON_ICONS[addon]}
          active={addons[addon]}
          disabled={noPreview}
          onClick={() => onToggleAddon(addon)}
        />
      ))}

      <div className="ml-auto flex items-center gap-2">
        <div className="inline-flex items-center gap-0.5 rounded-lg bg-foreground/[0.04] p-0.5">
          {(["desktop", "mobile"] as const).map((v) => {
            const on = state.selection.viewport === v;
            return (
              <button
                key={v}
                type="button"
                disabled={noPreview}
                onClick={() => setViewport(v)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors disabled:opacity-40",
                  on
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <HugeiconsIcon
                  icon={v === "desktop" ? ComputerIcon : SmartPhone01Icon}
                  className="size-3.5"
                />
                {v === "desktop" ? "Desktop" : "Mobile"}
              </button>
            );
          })}
        </div>
        <Divider />
        <ToolButton
          title={state.detachedOpen ? "Pop in" : "Open in new window"}
          icon={state.detachedOpen ? ArrowShrink02Icon : LinkSquare02Icon}
          onClick={() => api?.invoke(state.detachedOpen ? "preview:popIn" : "preview:popOut")}
        />
      </div>
    </div>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-border" />;
}

function ToolButton({
  title,
  icon,
  onClick,
  active = false,
  disabled = false,
}: {
  title: string;
  icon: typeof RefreshIcon;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[15px]",
        active
          ? "bg-brand-soft text-brand"
          : "text-toolbar-icon hover:bg-foreground/[0.06] hover:text-toolbar-icon-hover",
      )}
    >
      <HugeiconsIcon icon={icon} />
    </button>
  );
}
