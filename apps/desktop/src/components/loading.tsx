import { HugeiconsIcon, Loading03Icon } from "../lib/icons";

// Reusable spinner. Drop it anywhere a surface is waiting on async data
// (e.g. the sidebar tree while a project's manifest loads).
export function Loading({ label, className }: { label?: string; className?: string }) {
  return (
    <div
      className={`flex items-center justify-center gap-2 text-muted-foreground ${className ?? ""}`}
    >
      <HugeiconsIcon icon={Loading03Icon} className="size-4 animate-spin" />
      {label && <span className="text-[11px]">{label}</span>}
    </div>
  );
}
