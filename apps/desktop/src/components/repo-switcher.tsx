import { useState } from "react";
import type { AppState } from "../../electron/types";
import type { WorkspaceInspection } from "../../electron/workspace-discovery";
import type { Api } from "../lib/api";
import { markWorkspaceLoadStart } from "../lib/performance";
import { cn } from "../lib/utils";
import {
  HugeiconsIcon,
  Folder01Icon,
  ArrowDown01Icon,
  FolderAddIcon,
  Cancel01Icon,
} from "../lib/icons";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from "./ui/menu";
import {
  groupProjectsByRepository,
  projectAccessibleName,
  projectDisplayName,
} from "../lib/project-identity";
import { WorkspaceDiscoveryDialog } from "./workspace-discovery-dialog";

export const REPO_MENU_WIDTH_CLASS = "w-80";

export function projectAfterBatchAdd(
  priorWorkspaceRoots: ReadonlySet<string>,
  records: AppState["projects"],
) {
  return (
    records.find((record) => !priorWorkspaceRoots.has(record.identity.workspace.rootPath)) ??
    records[0]
  );
}

// A 1–2 letter monogram from the project name (word initials, else first chars).
function monogram(name: string): string {
  const parts = name
    .trim()
    .split(/[\s\-_]+/)
    .filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function RepoSwitcher({ state, api }: { state: AppState; api: Api }) {
  const active = state.projects.find((project) => project.id === state.selection.projectId);
  const snapshot = repoSwitcherSnapshot(state);
  const [inspection, setInspection] = useState<WorkspaceInspection | null>(null);

  async function addAndSelect(paths: string[]) {
    if (!api || paths.length === 0) return;
    const priorWorkspaceRoots = new Set(
      state.projects.map((project) => project.identity.workspace.rootPath),
    );
    const records = await api.invoke("project:addMany", paths);
    const record = projectAfterBatchAdd(priorWorkspaceRoots, records);
    if (!record) return;
    setInspection(null);
    markWorkspaceLoadStart(record.id);
    await api.invoke("project:select", record.id);
  }

  async function pickFolder() {
    if (!api) return;
    const path = await api.invoke("project:pickFolder");
    if (path) {
      const next = await api.invoke("project:inspectPath", path);
      if (next.candidates.length === 1) {
        await addAndSelect([next.candidates[0]!.path]);
      } else {
        setInspection(next);
      }
    }
  }

  return (
    <div className="no-drag ml-1">
      <Menu>
        <MenuTrigger
          aria-label={`Switch project: ${snapshot.accessibleLabel}`}
          title={`Switch project: ${snapshot.accessibleLabel}`}
          className="flex h-7 max-w-[210px] items-center gap-1.5 rounded-md px-1.5 text-[12px] font-medium text-foreground hover:bg-foreground/[0.045] data-[popup-open]:bg-foreground/[0.055] max-[960px]:w-7 max-[960px]:justify-center max-[960px]:px-0"
        >
          {active ? (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-brand-soft text-[9px] font-semibold uppercase text-brand shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--brand)_16%,transparent)]">
              {monogram(active.identity.repository.label)}
            </span>
          ) : (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-foreground/[0.06] text-muted-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_7%,transparent)]">
              <HugeiconsIcon icon={Folder01Icon} className="size-3" />
            </span>
          )}
          <span className="truncate max-[960px]:hidden">{snapshot.triggerLabel}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className="size-3 shrink-0 text-muted-foreground max-[960px]:hidden"
          />
        </MenuTrigger>
        <MenuContent align="start" sideOffset={6} className={REPO_MENU_WIDTH_CLASS}>
          {groupProjectsByRepository(state.projects).map((group, groupIndex) => (
            <div key={group.key}>
              {groupIndex > 0 ? <MenuSeparator /> : null}
              <div className="flex items-center gap-2 px-2 pt-1.5 pb-1 text-[9px] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                {group.slug ? (
                  <span className="max-w-[150px] truncate font-mono text-[8px] font-normal tracking-normal normal-case opacity-60">
                    {group.slug}
                  </span>
                ) : null}
              </div>
              {group.projects.map((project) => {
                const selected = project.id === state.selection.projectId;
                return (
                  <MenuItem
                    key={project.id}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => {
                      if (!selected) {
                        markWorkspaceLoadStart(project.id);
                        api?.invoke("project:select", project.id);
                      }
                    }}
                    className={cn(
                      "group min-h-10 pr-1",
                      selected ? "bg-foreground/[0.045] text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <HugeiconsIcon
                      icon={Folder01Icon}
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12px] font-medium text-foreground">
                        {project.identity.workspace.label}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[9px] text-muted-foreground">
                        {project.identity.workspace.relativePath}
                      </span>
                    </span>
                    <button
                      type="button"
                      title="Remove workspace"
                      aria-label={`Remove workspace: ${projectDisplayName(project, state.projects)}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        api?.invoke("project:remove", project.id);
                      }}
                      className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 hover:bg-foreground/[0.08] hover:text-foreground group-data-[highlighted]:opacity-100 focus:opacity-100"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                    </button>
                  </MenuItem>
                );
              })}
            </div>
          ))}
          <MenuSeparator />
          <MenuItem onClick={pickFolder} disabled={!api} className="text-muted-foreground">
            <HugeiconsIcon icon={FolderAddIcon} className="size-3.5 shrink-0" />
            <span>Add repository or workspace…</span>
          </MenuItem>
        </MenuContent>
      </Menu>
      <WorkspaceDiscoveryDialog
        inspection={inspection}
        onCancel={() => setInspection(null)}
        onConfirm={addAndSelect}
      />
    </div>
  );
}

export function repoSwitcherSnapshot(state: AppState) {
  const active = state.projects.find((project) => project.id === state.selection.projectId);
  return {
    triggerLabel: active ? projectDisplayName(active, state.projects) : "No project",
    accessibleLabel: active ? projectAccessibleName(active, state.projects) : "No project",
    groups: groupProjectsByRepository(state.projects).map((group) => ({
      label: group.label,
      slug: group.slug,
      rows: group.projects.map((project) => ({
        id: project.id,
        label: project.identity.workspace.label,
        relativePath: project.identity.workspace.relativePath,
      })),
    })),
  };
}
