import { HugeiconsIcon, Search01Icon } from "../lib/icons";
import { SettingsMenu } from "./settings-menu";

// Full-width native titlebar. The whole row is the drag region (-webkit-app-
// region: drag) so the window moves like a real macOS app; the centered search
// trigger opts out via `no-drag`. Left padding clears the inset traffic lights.
export function Titlebar({ onOpenPalette }: { onOpenPalette: () => void }) {
  return (
    <header className="drag relative flex h-11 shrink-0 items-center border-b border-line bg-panel pr-3 pl-[78px]">
      <div className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.18em] text-neutral-200 uppercase">
        <span className="size-2 rounded-full bg-accent shadow-[0_0_12px] shadow-accent/60" />
        OpenStory
      </div>

      <div className="no-drag absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <button
          type="button"
          onClick={onOpenPalette}
          className="flex h-7 w-[340px] items-center gap-2 rounded-lg border border-line bg-white/[0.04] px-2.5 text-[12px] text-neutral-500 transition-colors hover:bg-white/[0.07] hover:text-neutral-300"
        >
          <HugeiconsIcon icon={Search01Icon} className="size-3.5" />
          <span>Search components…</span>
          <kbd className="ml-auto rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="no-drag ml-auto flex items-center">
        <SettingsMenu />
      </div>
    </header>
  );
}
