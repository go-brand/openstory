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

type Entry = { kind: "component"; value: ManifestComponent } | { kind: "doc"; value: ManifestDoc };

type Item = { entry: Entry; segs: string[] };

// Build folders + components for one container, recursing on remaining segments.
// Direct (no-more-segments) components render first, alpha; page leaves follow, alpha; folders last, first-seen.
function container(items: Item[], idPrefix: string): TreeNode[] {
  const directComponents: ManifestComponent[] = [];
  const directDocs: ManifestDoc[] = [];
  const folderOrder: string[] = [];
  const folders = new Map<string, Item[]>();
  for (const { entry, segs } of items) {
    if (segs.length === 0) {
      if (entry.kind === "component") {
        directComponents.push(entry.value);
      } else {
        directDocs.push(entry.value);
      }
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
  for (const p of [...directComponents].sort((a, b) => a.id.localeCompare(b.id))) {
    nodes.push(componentNode(p, idPrefix));
  }
  for (const d of [...directDocs].sort((a, b) => a.id.localeCompare(b.id))) {
    nodes.push(pageLeaf(d, idPrefix));
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
export function buildTree(manifest: ManifestComponent[], docs: ManifestDoc[] = []): TreeNode[] {
  const order: (string | null)[] = [];
  const bySection = new Map<string | null, Entry[]>();
  const push = (section: string | null, entry: Entry) => {
    if (!bySection.has(section)) {
      bySection.set(section, []);
      order.push(section);
    }
    bySection.get(section)!.push(entry);
  };
  for (const p of manifest) push(p.section ?? null, { kind: "component", value: p });
  for (const d of docs) push(d.section ?? null, { kind: "doc", value: d });
  const toItems = (entries: Entry[]): Item[] =>
    entries.map((entry) => ({ entry, segs: segments(entry.value.group) }));
  const roots: TreeNode[] = [];
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
