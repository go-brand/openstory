import { useEffect, useRef, useState } from "react";
import type { AppState } from "../../../electron/types";
import type { Api } from "../../lib/api";
import { cn } from "../../lib/utils";
import {
  HugeiconsIcon,
  Folder01Icon,
  ArrowDown01Icon,
  FolderAddIcon,
  Cancel01Icon,
} from "../../lib/icons";

export function RepoSwitcher({ state, api }: { state: AppState; api: Api }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = state.projects.find((p) => p.id === state.selection.projectId);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  async function pickFolder() {
    setOpen(false);
    if (!api) return;
    const path = await api.invoke("project:pickFolder");
    if (path) {
      const record = await api.invoke("project:add", path);
      await api.invoke("project:select", record.id);
    }
  }

  return (
    <div ref={ref} className="no-drag relative px-3 pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-foreground/[0.04]"
      >
        <HugeiconsIcon icon={Folder01Icon} className="size-3.5 shrink-0 text-brand" />
        <span className="truncate">{active?.name ?? "No repository"}</span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className="ml-auto size-3.5 shrink-0 text-muted-foreground"
        />
      </button>

      {open && (
        <div className="absolute top-full right-3 left-3 z-20 mt-1 overflow-hidden rounded-lg border border-border bg-card shadow-xl shadow-black/30">
          {state.projects.map((proj) => (
            <div key={proj.id} className="group relative flex items-center">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (proj.id !== state.selection.projectId) api?.invoke("project:select", proj.id);
                }}
                className={cn(
                  "flex h-8 flex-1 items-center gap-2 px-2.5 text-left text-[12px] transition-colors hover:bg-foreground/[0.05]",
                  proj.id === state.selection.projectId
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                <HugeiconsIcon
                  icon={Folder01Icon}
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
                <span className="truncate">{proj.name}</span>
              </button>
              <button
                type="button"
                title="Remove repository"
                onClick={() => api?.invoke("project:remove", proj.id)}
                className="absolute right-1 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/[0.08] hover:text-foreground group-hover:opacity-100"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={pickFolder}
            disabled={!api}
            className="flex h-8 w-full items-center gap-2 border-t border-border px-2.5 text-left text-[12px] text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <HugeiconsIcon icon={FolderAddIcon} className="size-3.5 shrink-0" />
            Add repository…
          </button>
        </div>
      )}
    </div>
  );
}
