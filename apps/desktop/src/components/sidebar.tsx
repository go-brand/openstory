import { useMemo, useState } from "react";
import type { AppState } from "../../electron/types";
import type { Api } from "../lib/api";
import { HugeiconsIcon, Search01Icon } from "../lib/icons";
import { RepoSwitcher } from "./sidebar/repo-switcher";
import { Tree, type TreeCallbacks } from "./sidebar/tree";
import { buildTree, flatten, isContainer } from "./sidebar/build-tree";
import { filterTree } from "./sidebar/search";
import { useExpanded } from "./sidebar/use-expanded";

export function Sidebar({
  state,
  api,
  onSelectPreview,
}: {
  state: AppState;
  api: Api;
  onSelectPreview: (previewId: string, variantId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const { isExpanded, toggle, setExpanded } = useExpanded(state.selection.projectId);

  const fullTree = useMemo(() => buildTree(state.manifest), [state.manifest]);
  const { nodes, expand } = useMemo(() => filterTree(fullTree, query), [fullTree, query]);

  // When searching, force-expand ancestors of matches; otherwise honor stored state.
  const expanded = (id: string) => (query ? expand.has(id) || isExpanded(id) : isExpanded(id));

  const cb: TreeCallbacks = {
    selection: state.selection,
    focusedId,
    isExpanded: expanded,
    onToggle: toggle,
    onSelectStory: (componentId, variantId) => onSelectPreview(componentId, variantId),
    onSelectDocs: (componentId) => api?.invoke("preview:setDocs", componentId),
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
      if (cur.kind === "story") onSelectPreview(cur.componentId, cur.variantId);
      else if (cur.kind === "docs") api?.invoke("preview:setDocs", cur.componentId);
      else toggle(cur.id);
    }
  }

  return (
    <aside className="flex w-[260px] flex-col border-r border-border bg-sidebar">
      <RepoSwitcher state={state} api={api} />

      <div className="no-drag px-3 pt-2.5 pb-2">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5">
          <HugeiconsIcon icon={Search01Icon} className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find components…"
            className="h-8 flex-1 bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <div
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="no-drag flex-1 overflow-y-auto px-1.5 pb-3 focus:outline-none"
      >
        {state.projects.length === 0 ? (
          <p className="px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            Add a repository to load its OpenStory previews.
          </p>
        ) : nodes.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-muted-foreground">
            {query ? "No matches." : "No previews found in openstory.config.ts."}
          </p>
        ) : (
          <Tree nodes={nodes} cb={cb} />
        )}
      </div>
    </aside>
  );
}
