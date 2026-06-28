import { useMemo, useState } from "react";
import type { AppState } from "../../electron/types";
import type { Api } from "../lib/api";
import { RepoSwitcher } from "./sidebar/repo-switcher";
import { ModeTabs } from "./sidebar/mode-tabs";
import { Tree, type TreeCallbacks } from "./sidebar/tree";
import { buildTree, flatten, isContainer } from "./sidebar/build-tree";
import { useExpanded } from "./sidebar/use-expanded";

export function Sidebar({
  state,
  api,
  onSelectStory,
}: {
  state: AppState;
  api: Api;
  onSelectStory: (componentId: string, storyId: string) => void;
}) {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const nodes = useMemo(
    () => buildTree(state.manifest, state.docs, state.selection.mode),
    [state.manifest, state.docs, state.selection.mode],
  );
  // First-level containers are expanded by default; everything deeper starts collapsed.
  const defaultExpanded = useMemo(() => nodes.filter(isContainer).map((n) => n.id), [nodes]);
  const { isExpanded, toggle, setExpanded } = useExpanded(
    state.selection.projectId,
    defaultExpanded,
  );

  const expanded = (id: string) => isExpanded(id);

  const cb: TreeCallbacks = {
    selection: state.selection,
    focusedId,
    isExpanded: expanded,
    onToggle: toggle,
    onSelectStory,
    onSelectDocs: (componentId) => api?.invoke("preview:setDocs", componentId),
    onSelectPage: (pageId) => api?.invoke("preview:setPage", pageId),
    setFocusedId,
  };

  // Keyboard nav over the flattened visible list (the Storybook #13040 fix:
  // cursor walks visible nodes; expand/collapse never resets focus).
  function onKeyDown(e: React.KeyboardEvent) {
    const visible = flatten(nodes, expanded);
    if (visible.length === 0) return;
    const idx = visible.findIndex((n) => n.id === focusedId);
    const cur = idx >= 0 ? visible[idx]! : null;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = visible[Math.min(idx + 1, visible.length - 1)] ?? visible[0]!;
      setFocusedId(next.id);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = visible[Math.max(idx - 1, 0)] ?? visible[0]!;
      setFocusedId(prev.id);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (cur && isContainer(cur)) {
        if (!expanded(cur.id)) setExpanded(cur.id, true);
        else if (cur.children[0]) setFocusedId(cur.children[0].id);
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (cur && isContainer(cur) && expanded(cur.id)) setExpanded(cur.id, false);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!cur) return;
      if (cur.kind === "story") onSelectStory(cur.componentId, cur.storyId);
      else if (cur.kind === "docs") api?.invoke("preview:setDocs", cur.componentId);
      else if (cur.kind === "page") api?.invoke("preview:setPage", cur.pageId);
      else toggle(cur.id);
    }
  }

  return (
    <aside className="flex w-[260px] flex-col border-r border-border bg-sidebar">
      <RepoSwitcher state={state} api={api} />

      {state.projects.length > 0 && (
        <div className="no-drag px-3">
          <ModeTabs
            mode={state.selection.mode}
            onSelect={(m) => api?.invoke("preview:setMode", m)}
          />
        </div>
      )}

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="no-drag mt-1 flex-1 overflow-y-auto px-1.5 pb-3 focus:outline-none"
      >
        {state.projects.length === 0 ? (
          <p className="px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Add a repository to load its OpenStory components.
          </p>
        ) : nodes.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-muted-foreground">
            {state.selection.mode === "docs"
              ? "Drop a *.stories.md to document a feature."
              : "No stories found in openstory.config.ts."}
          </p>
        ) : (
          <Tree nodes={nodes} cb={cb} />
        )}
      </div>
    </aside>
  );
}
