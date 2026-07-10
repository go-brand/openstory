import type { AppState } from "../../electron/types";
import type { Api } from "../lib/api";
import { HugeiconsIcon, Search01Icon } from "../lib/icons";
import { AnimatedPanelIcon } from "./icons/animated-panel";
import { ModeSwitcher } from "./mode-switcher";
import { RepoSwitcher } from "./repo-switcher";
import { SettingsMenu } from "./settings-menu";

export const LEFT_SIDEBAR_TOGGLE_ID = "openstory-left-sidebar-toggle";

export type TitlebarProps = {
  onOpenPalette: () => void;
  state: AppState;
  api: Api;
  leftSidebarOpen: boolean;
  onToggleLeftSidebar: () => void;
  inspectorOpen: boolean;
  onToggleInspector: () => void;
};

// Full-width native titlebar. The whole row is the drag region (-webkit-app-
// region: drag) so the window moves like a real macOS app; the centered search
// trigger opts out via `no-drag`. Left padding clears the inset traffic lights.
export function Titlebar({
  onOpenPalette,
  state,
  api,
  leftSidebarOpen,
  onToggleLeftSidebar,
  inspectorOpen,
  onToggleInspector,
}: TitlebarProps) {
  return (
    <header className="drag relative flex h-11 shrink-0 items-center border-b border-border bg-sidebar pr-3 pl-[78px]">
      <div className="no-drag flex items-center">
        <button
          id={LEFT_SIDEBAR_TOGGLE_ID}
          type="button"
          onClick={onToggleLeftSidebar}
          aria-label={leftSidebarOpen ? "Hide sidebar" : "Show sidebar"}
          aria-pressed={leftSidebarOpen}
          title={leftSidebarOpen ? "Hide sidebar" : "Show sidebar"}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <AnimatedPanelIcon isOpen={leftSidebarOpen} side="left" />
        </button>
        <RepoSwitcher state={state} api={api} />
        <span aria-hidden="true" className="mx-1 text-[12px] text-muted-foreground/40">
          /
        </span>
        <ModeSwitcher
          mode={state.selection.mode}
          onSelect={(mode) => api?.invoke("preview:setMode", mode)}
        />
      </div>

      <div className="no-drag absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex h-7 w-[340px] items-center gap-2 rounded-lg border border-border bg-foreground/[0.04] px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-foreground/[0.07] hover:text-foreground"
        >
          <HugeiconsIcon icon={Search01Icon} className="size-3.5" />
          <span>Search components…</span>
          <kbd className="ml-auto rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="no-drag ml-auto flex items-center gap-1">
        <SettingsMenu />
        <button
          type="button"
          onClick={onToggleInspector}
          aria-label={inspectorOpen ? "Hide inspector" : "Show inspector"}
          aria-pressed={inspectorOpen}
          title={inspectorOpen ? "Hide inspector" : "Show inspector"}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <AnimatedPanelIcon isOpen={inspectorOpen} side="right" />
        </button>
      </div>
    </header>
  );
}
