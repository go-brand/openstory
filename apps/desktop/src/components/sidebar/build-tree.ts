import type { ManifestPreview } from "../../../electron/types";

export type StoryLeaf = {
  kind: "story";
  id: string;
  label: string;
  componentId: string;
  variantId: string;
};
export type DocsLeaf = {
  kind: "docs";
  id: string;
  label: string;
  componentId: string;
};
export type ComponentNode = {
  kind: "component";
  id: string;
  label: string;
  componentId: string;
  children: Array<DocsLeaf | StoryLeaf>;
};
export type FolderNode = {
  kind: "folder";
  id: string;
  label: string;
  children: TreeNode[];
};
export type SectionNode = {
  kind: "section";
  id: string;
  label: string;
  children: TreeNode[];
};
export type TreeNode = SectionNode | FolderNode | ComponentNode | StoryLeaf | DocsLeaf;

// Containers can be collapsed; leaves cannot.
export function isContainer(node: TreeNode): node is SectionNode | FolderNode | ComponentNode {
  return node.kind === "section" || node.kind === "folder" || node.kind === "component";
}

function humanize(id: string): string {
  return id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function segments(group: string): string[] {
  return group
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

function componentNode(p: ManifestPreview): ComponentNode | StoryLeaf {
  // Single-variant hoist: the component IS its only story (no wrapper, no docs).
  if (p.variants.length <= 1) {
    const v = p.variants[0];
    return {
      kind: "story",
      id: `story:${p.id}:${v?.id ?? ""}`,
      label: humanize(p.id),
      componentId: p.id,
      variantId: v?.id ?? "",
    };
  }
  const docs: DocsLeaf = {
    kind: "docs",
    id: `docs:${p.id}`,
    label: "Documentation",
    componentId: p.id,
  };
  const stories: StoryLeaf[] = p.variants.map((v) => ({
    kind: "story",
    id: `story:${p.id}:${v.id}`,
    label: v.label,
    componentId: p.id,
    variantId: v.id,
  }));
  return {
    kind: "component",
    id: `component:${p.id}`,
    label: humanize(p.id),
    componentId: p.id,
    children: [docs, ...stories],
  };
}

type Item = { preview: ManifestPreview; segs: string[] };

// Build folders + components for one container, recursing on remaining segments.
// Direct (no-more-segments) components render first, alpha; folders follow, first-seen.
function container(items: Item[], idPrefix: string): TreeNode[] {
  const direct: ManifestPreview[] = [];
  const folderOrder: string[] = [];
  const folders = new Map<string, Item[]>();
  for (const { preview, segs } of items) {
    if (segs.length === 0) {
      direct.push(preview);
    } else {
      const head = segs[0]!;
      if (!folders.has(head)) {
        folders.set(head, []);
        folderOrder.push(head);
      }
      folders.get(head)!.push({ preview, segs: segs.slice(1) });
    }
  }
  const nodes: TreeNode[] = [];
  for (const p of [...direct].sort((a, b) => a.id.localeCompare(b.id))) {
    nodes.push(componentNode(p));
  }
  for (const name of folderOrder) {
    const fid = `${idPrefix}/folder:${name}`;
    nodes.push({
      kind: "folder",
      id: fid,
      label: name,
      children: container(folders.get(name)!, fid),
    });
  }
  return nodes;
}

/** Project the flat manifest into the sidebar tree. */
export function buildTree(manifest: ManifestPreview[]): TreeNode[] {
  const order: (string | null)[] = [];
  const bySection = new Map<string | null, ManifestPreview[]>();
  for (const p of manifest) {
    const s = p.section ?? null;
    if (!bySection.has(s)) {
      bySection.set(s, []);
      order.push(s);
    }
    bySection.get(s)!.push(p);
  }
  const roots: TreeNode[] = [];
  const toItems = (ps: ManifestPreview[]): Item[] =>
    ps.map((p) => ({ preview: p, segs: segments(p.group) }));
  // Sectionless bucket renders flat at the root, first.
  if (bySection.has(null)) {
    roots.push(...container(toItems(bySection.get(null)!), "root"));
  }
  for (const s of order) {
    if (s === null) continue;
    const id = `section:${s}`;
    roots.push({
      kind: "section",
      id,
      label: s,
      children: container(toItems(bySection.get(s)!), id),
    });
  }
  return roots;
}

/** Ordered list of currently-visible nodes (children shown only when expanded). */
export function flatten(nodes: TreeNode[], isExpanded: (id: string) => boolean): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      out.push(n);
      if (isContainer(n) && isExpanded(n.id)) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}
