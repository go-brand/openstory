import type { ManifestComponent, ManifestDoc } from "../../../electron/types";

export type StoryLeaf = {
  kind: "story";
  id: string;
  label: string;
  componentId: string;
  storyId: string;
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
export type PageLeaf = {
  kind: "page";
  id: string;
  label: string;
  pageId: string;
  status?: "shipped" | "beta" | "planned";
};
export type TreeNode = SectionNode | FolderNode | ComponentNode | StoryLeaf | DocsLeaf | PageLeaf;

// Containers can be collapsed; leaves cannot.
export function isContainer(node: TreeNode): node is SectionNode | FolderNode | ComponentNode {
  return node.kind === "section" || node.kind === "folder" || node.kind === "component";
}

function segments(group: string): string[] {
  return group
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
}

function componentNode(p: ManifestComponent, idPrefix: string): ComponentNode | StoryLeaf {
  // Single-variant hoist: the component IS its only story (no wrapper, no docs).
  if (p.stories.length <= 1) {
    const v = p.stories[0];
    return {
      kind: "story",
      id: `${idPrefix}/story:${p.id}:${v?.id ?? ""}`,
      label: p.name,
      componentId: p.id,
      storyId: v?.id ?? "",
    };
  }
  const docs: DocsLeaf = {
    kind: "docs",
    id: `${idPrefix}/docs:${p.id}`,
    label: "Documentation",
    componentId: p.id,
  };
  const stories: StoryLeaf[] = p.stories.map((v) => ({
    kind: "story",
    id: `${idPrefix}/story:${p.id}:${v.id}`,
    label: v.label,
    componentId: p.id,
    storyId: v.id,
  }));
  return {
    kind: "component",
    id: `${idPrefix}/component:${p.id}`,
    label: p.name,
    componentId: p.id,
    children: [docs, ...stories],
  };
}

function pageLeaf(d: ManifestDoc, idPrefix: string): PageLeaf {
  const leaf: PageLeaf = {
    kind: "page",
    id: `${idPrefix}/page:${d.id}`,
    label: d.title,
    pageId: d.id,
  };
  if (d.status) leaf.status = d.status;
  return leaf;
}

type Item = { entry: ManifestComponent | ManifestDoc; segs: string[] };

// Build folders + direct nodes for one container, recursing on remaining segments.
// Direct nodes render first, alpha by id; folders last, first-seen.
function container(items: Item[], idPrefix: string, mode: "design" | "docs"): TreeNode[] {
  const direct: Array<ManifestComponent | ManifestDoc> = [];
  const folderOrder: string[] = [];
  const folders = new Map<string, Item[]>();
  for (const { entry, segs } of items) {
    if (segs.length === 0) {
      direct.push(entry);
    } else {
      const head = segs[0]!;
      if (!folders.has(head)) {
        folders.set(head, []);
        folderOrder.push(head);
      }
      folders.get(head)!.push({ entry, segs: segs.slice(1) });
    }
  }
  const nodes: TreeNode[] = [];
  for (const e of [...direct].sort((a, b) => a.id.localeCompare(b.id))) {
    if (mode === "docs") {
      nodes.push(pageLeaf(e as ManifestDoc, idPrefix));
    } else {
      nodes.push(componentNode(e as ManifestComponent, idPrefix));
    }
  }
  for (const name of folderOrder) {
    const fid = `${idPrefix}/folder:${name}`;
    nodes.push({
      kind: "folder",
      id: fid,
      label: name,
      children: container(folders.get(name)!, fid, mode),
    });
  }
  return nodes;
}

/** Project the flat manifest into the sidebar tree for a single mode. */
export function buildTree(
  manifest: ManifestComponent[],
  docs: ManifestDoc[],
  mode: "design" | "docs",
): TreeNode[] {
  const order: (string | null)[] = [];
  const bySection = new Map<string | null, Array<ManifestComponent | ManifestDoc>>();
  const push = (section: string | null, item: ManifestComponent | ManifestDoc) => {
    if (!bySection.has(section)) {
      bySection.set(section, []);
      order.push(section);
    }
    bySection.get(section)!.push(item);
  };
  const items = mode === "design" ? manifest : docs;
  for (const it of items) push(it.section ?? null, it);
  const makeNodes = (
    entries: Array<ManifestComponent | ManifestDoc>,
    idPrefix: string,
  ): TreeNode[] =>
    container(
      entries.map((e) => ({ entry: e, segs: segments(e.group) })),
      idPrefix,
      mode,
    );
  const roots: TreeNode[] = [];
  // Sectionless bucket renders flat at the root, first.
  if (bySection.has(null)) roots.push(...makeNodes(bySection.get(null)!, "root"));
  for (const s of order) {
    if (s === null) continue;
    const id = `section:${s}`;
    roots.push({ kind: "section", id, label: s, children: makeNodes(bySection.get(s)!, id) });
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
