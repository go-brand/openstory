import { useEffect, useMemo, useRef, useState } from "react";
import type { AppState } from "../../electron/types";
import type { Api } from "../lib/api";
import { markPreviewRequest, markWorkspaceLoadStart } from "../lib/performance";
import { cn } from "../lib/utils";
import { HugeiconsIcon, Search01Icon, PackageIcon, Folder01Icon } from "../lib/icons";
import { projectDisplayName } from "../lib/project-identity";

export type CommandPaletteItem =
  | { kind: "story"; componentId: string; storyId: string; label: string; meta: string }
  | { kind: "project"; id: string; label: string; meta: string };

// Subsequence match: every char of `query` appears in `text` in order. Cheap,
// dependency-free, and good enough for a component list.
function fuzzy(query: string, text: string): boolean {
  if (!query) return true;
  const normalize = (value: string) => value.toLowerCase().replace(/[\s._/-]+/g, "");
  const q = normalize(query);
  const t = normalize(text);
  let i = 0;
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] === q[i]) i++;
  }
  return i === q.length;
}

export function commandPaletteItems(state: AppState, query: string): CommandPaletteItem[] {
  const stories: CommandPaletteItem[] = state.manifest.flatMap((component) =>
    component.stories
      .filter((story) =>
        fuzzy(
          query,
          `${component.id} ${story.label} ${component.group} ${component.section ?? ""}`,
        ),
      )
      .map((story) => ({
        kind: "story" as const,
        componentId: component.id,
        storyId: story.id,
        label: `${component.id} · ${story.label}`,
        meta: component.section || component.group || "—",
      })),
  );
  const projects: CommandPaletteItem[] = state.projects
    .filter((project) => {
      const { repository, workspace } = project.identity;
      const searchText = [
        repository.label,
        repository.slug,
        workspace.label,
        workspace.relativePath,
      ]
        .filter(Boolean)
        .join(" ");
      return project.id !== state.selection.projectId && fuzzy(query, searchText);
    })
    .map((project) => ({
      kind: "project" as const,
      id: project.id,
      label: projectDisplayName(project, state.projects),
      meta: "Switch project",
    }));
  return [...stories, ...projects];
}

export function CommandPalette({
  open,
  onClose,
  state,
  api,
}: {
  open: boolean;
  onClose: () => void;
  state: AppState;
  api: Api;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => commandPaletteItems(state, query), [query, state]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  function choose(item: CommandPaletteItem) {
    if (item.kind === "story") {
      markPreviewRequest("story");
      api?.invoke("preview:set", {
        componentId: item.componentId,
        storyId: item.storyId,
        viewport: state.selection.viewport,
      });
    } else {
      markWorkspaceLoadStart(item.id);
      api?.invoke("project:select", item.id);
    }
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = items[active];
      if (it) choose(it);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]"
      onMouseDown={onClose}
    >
      <div
        className="w-[560px] overflow-hidden rounded-xl border border-input bg-card shadow-2xl shadow-black/60"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-3.5">
          <HugeiconsIcon icon={Search01Icon} className="size-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search components…"
            className="h-11 flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="rounded bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            esc
          </kbd>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12px] text-muted-foreground">
              No matches
            </div>
          ) : (
            items.map((it, i) => (
              <button
                key={it.kind === "story" ? `s:${it.componentId}:${it.storyId}` : `r:${it.id}`}
                type="button"
                onMouseMove={() => setActive(i)}
                onClick={() => choose(it)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] transition-colors",
                  i === active ? "bg-brand-soft text-brand" : "text-foreground",
                )}
              >
                <HugeiconsIcon
                  icon={it.kind === "story" ? PackageIcon : Folder01Icon}
                  className="size-4 shrink-0 text-muted-foreground"
                />
                <span className="truncate">{it.label}</span>
                <span className="ml-auto shrink-0 text-[10px] tracking-wide text-muted-foreground uppercase">
                  {it.meta}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
