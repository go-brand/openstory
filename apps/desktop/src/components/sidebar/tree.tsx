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
  onSelectStory: (componentId: string, variantId: string) => void;
  onSelectDocs: (componentId: string) => void;
  setFocusedId: (id: string) => void;
};

const INDENT = 12;

function isSelected(node: TreeNode, sel: ActiveSelection): boolean {
  if (node.kind === "story") {
    return (
      sel.docsComponentId === null &&
      sel.previewId === node.componentId &&
      sel.variantId === node.variantId
    );
  }
  if (node.kind === "docs") return sel.docsComponentId === node.componentId;
  return false;
}

function Row({ node, depth, cb }: { node: TreeNode; depth: number; cb: TreeCallbacks }) {
  const selected = isSelected(node, cb.selection);
  const focused = cb.focusedId === node.id;
  const expandable = isContainer(node);
  const open = expandable && cb.isExpanded(node.id);

  function activate() {
    cb.setFocusedId(node.id);
    if (node.kind === "story") cb.onSelectStory(node.componentId, node.variantId);
    else if (node.kind === "docs") cb.onSelectDocs(node.componentId);
    else cb.onToggle(node.id);
  }

  // Section headers are styled distinctly (uppercase, no icon).
  if (node.kind === "section") {
    return (
      <>
        <button
          type="button"
          onClick={activate}
          style={{ paddingLeft: 8 + depth * INDENT }}
          className={cn(
            "flex h-7 w-full items-center gap-1.5 pr-2 text-[10px] font-semibold tracking-[0.13em] uppercase transition-colors",
            focused ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <HugeiconsIcon
            icon={open ? ArrowDown01Icon : ArrowRight01Icon}
            className="size-3 shrink-0 opacity-60"
          />
          <span className="truncate">{node.label}</span>
        </button>
        {open && node.children.map((c) => <Row key={c.id} node={c} depth={depth + 1} cb={cb} />)}
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
          : Bookmark02Icon;
  const iconColor =
    node.kind === "folder"
      ? "text-violet-500"
      : node.kind === "component"
        ? "text-brand"
        : node.kind === "docs"
          ? "text-amber-500"
          : "text-teal-500";

  return (
    <>
      <button
        type="button"
        onClick={activate}
        style={{ paddingLeft: 8 + depth * INDENT }}
        className={cn(
          "relative flex h-8 w-full items-center gap-1.5 rounded-lg pr-2 text-[12.5px] transition-colors",
          selected
            ? "bg-brand text-white"
            : focused
              ? "bg-foreground/[0.06] text-foreground"
              : "text-foreground/90 hover:bg-foreground/[0.04]",
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
      </button>
      {expandable &&
        open &&
        node.children.map((c) => <Row key={c.id} node={c} depth={depth + 1} cb={cb} />)}
    </>
  );
}

export function Tree({ nodes, cb }: { nodes: TreeNode[]; cb: TreeCallbacks }) {
  return (
    <div className="flex flex-col gap-0.5">
      {nodes.map((n) => (
        <Row key={n.id} node={n} depth={0} cb={cb} />
      ))}
    </div>
  );
}
