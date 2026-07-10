import type { CSSProperties, ReactNode } from "react";
import type { ActiveSelection } from "../../../electron/types";
import { cn } from "../../lib/utils";
import {
  HugeiconsIcon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  Folder01Icon,
  DashboardSquare01Icon,
  File01Icon,
  Bookmark02Icon,
} from "../../lib/icons";
import { isContainer, type TreeNode } from "./build-tree";

export type TreeCallbacks = {
  selection: ActiveSelection;
  focusedId: string | null;
  isExpanded: (id: string) => boolean;
  onToggle: (id: string) => void;
  onSelectStory: (componentId: string, storyId: string) => void;
  onSelectDocs: (componentId: string) => void;
  onSelectPage: (pageId: string) => void;
  setFocusedId: (id: string) => void;
};

const INDENT = 16;
type BranchStyle = CSSProperties & { "--sidebar-branch-left"?: string };

function isSelected(node: TreeNode, sel: ActiveSelection): boolean {
  if (node.kind === "story") {
    return (
      sel.docsComponentId === null &&
      sel.componentId === node.componentId &&
      sel.storyId === node.storyId
    );
  }
  if (node.kind === "docs") return sel.docsComponentId === node.componentId;
  if (node.kind === "page") return sel.pageId === node.pageId;
  return false;
}

function showWorkStatusDot(status: string | undefined): boolean {
  return Boolean(status && status !== "shipped");
}

function Row({ node, depth, cb }: { node: TreeNode; depth: number; cb: TreeCallbacks }) {
  const selected = isSelected(node, cb.selection);
  const focused = cb.focusedId === node.id;
  const expandable = isContainer(node);
  const open = expandable && cb.isExpanded(node.id);
  const rowInset = 6 + depth * INDENT;

  function activate() {
    cb.setFocusedId(node.id);
    if (node.kind === "story") cb.onSelectStory(node.componentId, node.storyId);
    else if (node.kind === "docs") cb.onSelectDocs(node.componentId);
    else if (node.kind === "page") cb.onSelectPage(node.pageId);
    else cb.onToggle(node.id);
  }

  // Section headers are styled distinctly: uppercase, no kind icon — just the
  // collapse chevron (sections are collapsible, matching the Storybook reference).
  if (node.kind === "section") {
    return (
      <>
        <button
          type="button"
          onClick={activate}
          style={{ marginLeft: rowInset, width: `calc(100% - ${rowInset}px)` }}
          className={cn(
            "mt-1.5 flex h-6 items-center gap-1.5 rounded-md px-1.5 text-[10.5px] font-semibold tracking-[0.16em] uppercase",
            focused
              ? "text-foreground"
              : "text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground",
          )}
        >
          <HugeiconsIcon
            icon={open ? ArrowDown01Icon : ArrowRight01Icon}
            className="size-3 shrink-0 opacity-60"
          />
          <span className="truncate">{node.label}</span>
        </button>
        {open && (
          <Branch depth={depth + 1}>
            {node.children.map((c) => (
              <Row key={c.id} node={c} depth={depth + 1} cb={cb} />
            ))}
          </Branch>
        )}
      </>
    );
  }

  const icon =
    node.kind === "folder"
      ? Folder01Icon
      : node.kind === "component"
        ? DashboardSquare01Icon
        : node.kind === "docs"
          ? File01Icon
          : node.kind === "page"
            ? File01Icon
            : Bookmark02Icon;
  const iconColor =
    node.kind === "folder"
      ? "text-violet-500"
      : node.kind === "component"
        ? "text-brand"
        : node.kind === "docs"
          ? "text-amber-500"
          : node.kind === "page"
            ? "text-sky-500"
            : "text-teal-500";

  return (
    <>
      <button
        type="button"
        onClick={activate}
        style={{ marginLeft: rowInset, width: `calc(100% - ${rowInset}px)` }}
        className={cn(
          "relative flex h-7 items-center gap-1.5 rounded-lg px-1.5 text-[12.5px] outline-none",
          selected
            ? "bg-brand text-white shadow-[0_4px_14px_color-mix(in_oklab,var(--brand)_22%,transparent)]"
            : focused
              ? "bg-foreground/[0.07] text-foreground ring-1 ring-inset ring-foreground/10"
              : "text-foreground/90 hover:bg-foreground/[0.045] hover:text-foreground",
        )}
      >
        {expandable ? (
          <HugeiconsIcon
            icon={open ? ArrowDown01Icon : ArrowRight01Icon}
            className={cn("size-3 shrink-0 opacity-60", selected && "opacity-90")}
          />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <HugeiconsIcon
          icon={icon}
          className={cn("size-3.5 shrink-0", selected ? "text-white" : iconColor)}
        />
        <span className="truncate">{node.label}</span>
        {node.kind === "page" && showWorkStatusDot(node.status) && (
          <span
            title={node.status}
            className="ml-auto size-1.5 shrink-0 rounded-full bg-orange-400 ring-2 ring-orange-400/15"
          />
        )}
      </button>
      {expandable && open && (
        <Branch depth={depth + 1}>
          {node.children.map((c) => (
            <Row key={c.id} node={c} depth={depth + 1} cb={cb} />
          ))}
        </Branch>
      )}
    </>
  );
}

function Branch({ depth, children }: { depth: number; children: ReactNode }) {
  return (
    <div
      className="sidebar-tree-branch"
      data-depth={depth}
      style={{ "--sidebar-branch-left": `${8 + depth * INDENT}px` } as BranchStyle}
    >
      {children}
    </div>
  );
}

export function Tree({ nodes, cb }: { nodes: TreeNode[]; cb: TreeCallbacks }) {
  return (
    <div className="flex flex-col gap-px">
      {nodes.map((n) => (
        <Row key={n.id} node={n} depth={0} cb={cb} />
      ))}
    </div>
  );
}
