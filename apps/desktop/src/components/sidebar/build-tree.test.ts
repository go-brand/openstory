import { describe, it, expect } from "vitest";
import type { ManifestComponent } from "../../../electron/types";
import { buildTree, flatten, type TreeNode } from "./build-tree";

function component(over: Partial<ManifestComponent> & { id: string }): ManifestComponent {
  return {
    id: over.id,
    name: over.name ?? over.id,
    group: over.group ?? "",
    section: over.section ?? null,
    background: "#fff",
    stories: over.stories ?? [{ id: "default", label: "Default", props: {} }],
    controls: [],
    sourcePath: null,
  };
}

describe("buildTree", () => {
  it("hoists a single-variant component to a story leaf (no component wrapper, no docs)", () => {
    const tree = buildTree([component({ id: "button", name: "Button" })]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      kind: "story",
      componentId: "button",
      storyId: "default",
      label: "Button",
    });
  });

  it("labels a component node by its name, not its id", () => {
    const tree = buildTree([
      component({
        id: "ui-button",
        name: "Button",
        stories: [
          { id: "a", label: "A", props: {} },
          { id: "b", label: "B", props: {} },
        ],
      }),
    ]);
    expect(tree[0]).toMatchObject({ kind: "component", label: "Button" });
  });

  it("expands a multi-variant component to docs + story leaves", () => {
    const tree = buildTree([
      component({
        id: "button",
        stories: [
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
      storyId: "primary",
      label: "Primary",
    });
  });

  it("section-scopes node ids so the same component id in two sections does not collide", () => {
    const tree = buildTree([
      component({ id: "button", section: "app" }),
      component({ id: "button", section: "ui" }),
    ]);
    const appLeaf = (tree[0] as Extract<TreeNode, { kind: "section" }>).children[0]!;
    const uiLeaf = (tree[1] as Extract<TreeNode, { kind: "section" }>).children[0]!;
    expect(appLeaf.id).not.toBe(uiLeaf.id);
  });

  it("nests group segments into folders", () => {
    const tree = buildTree([component({ id: "input", group: "Forms/Text" })]);
    expect(tree[0]).toMatchObject({ kind: "folder", label: "Forms" });
    const forms = tree[0] as Extract<TreeNode, { kind: "folder" }>;
    expect(forms.children[0]).toMatchObject({ kind: "folder", label: "Text" });
  });

  it("buckets by section, sectionless first, sections first-seen", () => {
    const tree = buildTree([
      component({ id: "loose" }),
      component({ id: "card", section: "app" }),
      component({ id: "button", section: "ui" }),
    ]);
    expect(tree.map((n) => n.kind)).toEqual(["story", "section", "section"]);
    expect(tree[1]).toMatchObject({ kind: "section", label: "app" });
    expect(tree[2]).toMatchObject({ kind: "section", label: "ui" });
  });

  it("orders direct components alpha, before folders (first-seen)", () => {
    const tree = buildTree([
      component({ id: "zeta", name: "Zeta" }),
      component({ id: "alpha", name: "Alpha" }),
      component({ id: "x", name: "X", group: "Forms" }),
    ]);
    expect(tree.map((n) => n.label)).toEqual(["Alpha", "Zeta", "Forms"]);
  });

  it("gives every node a stable unique id", () => {
    const tree = buildTree([component({ id: "button", section: "ui", group: "Forms" })]);
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
      component({
        id: "button",
        stories: [
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
