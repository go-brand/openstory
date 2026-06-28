import { cn } from "../../lib/utils";
import { HugeiconsIcon, DashboardSquare01Icon, File01Icon } from "../../lib/icons";

type Mode = "design" | "docs";
const TABS: Array<{ mode: Mode; label: string; icon: typeof File01Icon }> = [
  { mode: "design", label: "Design System", icon: DashboardSquare01Icon },
  { mode: "docs", label: "Docs", icon: File01Icon },
];

export function ModeTabs({ mode, onSelect }: { mode: Mode; onSelect: (m: Mode) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Sidebar mode"
      className="no-drag mt-2 flex gap-1 rounded-lg border border-border bg-card p-1"
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const i = TABS.findIndex((t) => t.mode === mode);
        const next =
          e.key === "ArrowRight"
            ? TABS[(i + 1) % TABS.length]
            : TABS[(i + TABS.length - 1) % TABS.length];
        if (next) onSelect(next.mode);
      }}
    >
      {TABS.map((t) => {
        const active = t.mode === mode;
        return (
          <button
            key={t.mode}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(t.mode)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors",
              active
                ? "bg-foreground/[0.06] text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <HugeiconsIcon icon={t.icon} className="size-3.5 shrink-0" />
            <span className="truncate">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
