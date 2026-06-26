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
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from "../ui/menu";

export function RepoSwitcher({ state, api }: { state: AppState; api: Api }) {
  const active = state.projects.find((p) => p.id === state.selection.projectId);

  async function pickFolder() {
    if (!api) return;
    const path = await api.invoke("project:pickFolder");
    if (path) {
      const record = await api.invoke("project:add", path);
      await api.invoke("project:select", record.id);
    }
  }

  return (
    <div className="no-drag px-3 pt-3">
      <Menu>
        <MenuTrigger className="flex h-9 w-full items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-[12.5px] font-medium text-foreground transition-colors hover:bg-foreground/[0.04] data-[popup-open]:bg-foreground/[0.04]">
          <HugeiconsIcon icon={Folder01Icon} className="size-3.5 shrink-0 text-brand" />
          <span className="truncate">{active?.name ?? "No repository"}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className="ml-auto size-3.5 shrink-0 text-muted-foreground"
          />
        </MenuTrigger>
        <MenuContent align="start" sideOffset={6} className="w-[var(--anchor-width)]">
          {state.projects.map((proj) => (
            <MenuItem
              key={proj.id}
              onClick={() => {
                if (proj.id !== state.selection.projectId) api?.invoke("project:select", proj.id);
              }}
              className={cn(
                "group pr-1",
                proj.id === state.selection.projectId ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <HugeiconsIcon
                icon={Folder01Icon}
                className="size-3.5 shrink-0 text-muted-foreground"
              />
              <span className="flex-1 truncate">{proj.name}</span>
              <button
                type="button"
                title="Remove repository"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  api?.invoke("project:remove", proj.id);
                }}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/[0.08] hover:text-foreground group-data-[highlighted]:opacity-100"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
              </button>
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem onClick={pickFolder} disabled={!api} className="text-muted-foreground">
            <HugeiconsIcon icon={FolderAddIcon} className="size-3.5 shrink-0" />
            <span>Add repository…</span>
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}
