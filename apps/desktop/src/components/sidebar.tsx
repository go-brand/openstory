import { useMemo, useState } from "react";
import type { AppState } from "../../electron/types";
import type { Api } from "../lib/api";
import { Tree, type TreeCallbacks } from "./sidebar/tree";
import { buildTree, flatten, isContainer } from "./sidebar/build-tree";
import { useExpanded } from "./sidebar/use-expanded";
import { Loading } from "./loading";
import { markPreviewRequest } from "../lib/performance";

export const SIDEBAR_SHELL_ID = "openstory-sidebar-shell";

export function sidebarShellSnapshot(isOpen: boolean): {
  width: 268 | 0;
  transform: "translateX(0)" | "translateX(-100%)";
  opacity: 1 | 0;
} {
  return {
    width: isOpen ? 268 : 0,
    transform: isOpen ? "translateX(0)" : "translateX(-100%)",
    opacity: isOpen ? 1 : 0,
  };
}

export function showProjectLoading(
  projectCount: number,
  viteStatus: AppState["vite"]["status"],
  nodeCount: number,
) {
  return (
    projectCount > 0 && (viteStatus === "starting" || viteStatus === "idle") && nodeCount === 0
  );
}

type SidebarProps = {
  state: AppState;
  api: Api;
  onSelectStory: (componentId: string, storyId: string) => void;
};

export function SidebarShell({
  isOpen,
  ...sidebarProps
}: SidebarProps & {
  isOpen: boolean;
}) {
  const shell = sidebarShellSnapshot(isOpen);

  return (
    <aside
      id={SIDEBAR_SHELL_ID}
      aria-hidden={!isOpen}
      inert={!isOpen}
      className="sidebar-shell h-full shrink-0 overflow-hidden"
      style={{ width: shell.width }}
    >
      <div
        className="sidebar-shell-surface h-full w-[268px] min-w-[268px]"
        style={{ transform: shell.transform, opacity: shell.opacity }}
      >
        <Sidebar {...sidebarProps} />
      </div>
    </aside>
  );
}

export function Sidebar({ state, api, onSelectStory }: SidebarProps) {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const nodes = useMemo(
    () => buildTree(state.manifest, state.docs, state.selection.mode),
    [state.manifest, state.docs, state.selection.mode],
  );
  // First-level containers are expanded by default; everything deeper starts collapsed.
  const defaultExpanded = useMemo(() => nodes.filter(isContainer).map((n) => n.id), [nodes]);
  const { isExpanded, toggle, setExpanded } = useExpanded(
    `${state.selection.projectId}:${state.selection.mode}`,
    defaultExpanded,
  );

  const expanded = (id: string) => isExpanded(id);

  const cb: TreeCallbacks = {
    selection: state.selection,
    focusedId,
    isExpanded: expanded,
    onToggle: toggle,
    onSelectStory,
    onSelectDocs: (componentId) => {
      markPreviewRequest("docs");
      api?.invoke("preview:setDocs", componentId);
    },
    onSelectPage: (pageId) => {
      markPreviewRequest("page");
      api?.invoke("preview:setPage", pageId);
    },
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
      else if (cur.kind === "docs") {
        markPreviewRequest("docs");
        api?.invoke("preview:setDocs", cur.componentId);
      } else if (cur.kind === "page") {
        markPreviewRequest("page");
        api?.invoke("preview:setPage", cur.pageId);
      } else toggle(cur.id);
    }
  }

  return (
    <div className="flex h-full w-[268px] shrink-0 bg-background text-sidebar-foreground">
      <div className="my-2 ml-2 flex h-[calc(100%-1rem)] w-[260px] flex-col overflow-hidden rounded-xl border border-border bg-sidebar">
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
        <div
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="no-scrollbar no-drag mt-1.5 flex-1 overflow-y-auto px-2 pb-3 focus:outline-none"
        >
          {state.projects.length === 0 ? (
            <p className="px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              Add a repository to load its OpenStory components.
            </p>
          ) : showProjectLoading(state.projects.length, state.vite.status, nodes.length) ? (
            // Project switching: the new manifest hasn't arrived yet, so show a
            // spinner instead of an empty/stale tree. When a same-project cache is
            // present, `nodes` is non-empty and the tree can render immediately
            // while Vite refreshes it in the background.
            <Loading label="Loading project…" className="px-3 py-6" />
          ) : nodes.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">
              {state.selection.mode === "docs"
                ? "Drop a .stories.md file to document a feature."
                : "No stories found in openstory.config.ts."}
            </p>
          ) : (
            <Tree nodes={nodes} cb={cb} />
          )}
        </div>
      </div>
    </div>
  );
}
