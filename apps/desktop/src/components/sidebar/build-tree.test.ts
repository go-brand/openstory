import { describe, it, expect } from "vitest";
import type { ManifestPreview } from "../../../electron/types";
import { buildTree, flatten, type TreeNode } from "./build-tree";

function preview(over: Partial<ManifestPreview> & { id: string }): ManifestPreview {
  return {
    id: over.id,
    group: over.group ?? "",
    section: over.section ?? null,
    background: "#fff",
    variants: over.variants ?? [{ id: "default", label: "Default", props: {} }],
    controls: [],
    sourcePath: null,
  };
}

describe("buildTree", () => {
  it("hoists a single-variant component to a story leaf (no component wrapper, no docs)", () => {
    const tree = buildTree([preview({ id: "button" })]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      kind: "story",
      componentId: "button",
      variantId: "default",
      label: "Button",
    });
  });

  it("expands a multi-variant component to docs + story leaves", () => {
    const tree = buildTree([
      preview({
        id: "button",
        variants: [
          { id: "primary", label: "Primary", props: {} },
          { id: "disabled", label: "Disabled", props: {} },
        ],
      }),
    ]);
    expect(tree[0]).toMatchObject({ kind: "component", componentId: "button" });
    const comp = tree[0] as Extract<TreeNode, { kind: "component" }>;
    expect(comp.children.map((c) => c.kind)).toEqual(["docs", "story", "story"]);
    expect(comp.children[0]).toMatchObject({ kind: "docs", label: "Documentation" });
    expect(comp.children[1]).toMatchObject({
      kind: "story",
      variantId: "primary",
      label: "Primary",
    });
  });

  it("section-scopes node ids so the same component id in two sections does not collide", () => {
    const tree = buildTree([
      preview({ id: "button", section: "app" }),
      preview({ id: "button", section: "ui" }),
    ]);
    const appLeaf = (tree[0] as Extract<TreeNode, { kind: "section" }>).children[0]!;
    const uiLeaf = (tree[1] as Extract<TreeNode, { kind: "section" }>).children[0]!;
    expect(appLeaf.id).not.toBe(uiLeaf.id);
  });

  it("nests group segments into folders", () => {
    const tree = buildTree([preview({ id: "input", group: "Forms/Text" })]);
    expect(tree[0]).toMatchObject({ kind: "folder", label: "Forms" });
    const forms = tree[0] as Extract<TreeNode, { kind: "folder" }>;
    expect(forms.children[0]).toMatchObject({ kind: "folder", label: "Text" });
  });

  it("buckets by section, sectionless first, sections first-seen", () => {
    const tree = buildTree([
      preview({ id: "loose" }),
      preview({ id: "card", section: "app" }),
      preview({ id: "button", section: "ui" }),
    ]);
    expect(tree.map((n) => n.kind)).toEqual(["story", "section", "section"]);
    expect(tree[1]).toMatchObject({ kind: "section", label: "app" });
    expect(tree[2]).toMatchObject({ kind: "section", label: "ui" });
  });

  it("orders direct components alpha, before folders (first-seen)", () => {
    const tree = buildTree([
      preview({ id: "zeta" }),
      preview({ id: "alpha" }),
      preview({ id: "x", group: "Forms" }),
    ]);
    expect(tree.map((n) => n.label)).toEqual(["Alpha", "Zeta", "Forms"]);
  });

  it("gives every node a stable unique id", () => {
    const tree = buildTree([preview({ id: "button", section: "ui", group: "Forms" })]);
    const ids: string[] = [];
    const walk = (ns: TreeNode[]) =>
      ns.forEach((n) => {
        ids.push(n.id);
        if ("children" in n) walk(n.children);
      });
    walk(tree);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("flatten", () => {
  it("includes children only for expanded containers", () => {
    const tree = buildTree([
      preview({
        id: "button",
        variants: [
          { id: "a", label: "A", props: {} },
          { id: "b", label: "B", props: {} },
        ],
      }),
    ]);
    const collapsed = flatten(tree, () => false).map((n) => n.kind);
    expect(collapsed).toEqual(["component"]);
    const expanded = flatten(tree, () => true).map((n) => n.kind);
    expect(expanded).toEqual(["component", "docs", "story", "story"]);
  });
});
