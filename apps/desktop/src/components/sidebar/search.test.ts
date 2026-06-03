import { describe, it, expect } from "vitest";
import { rank, filterTree } from "./search";
import { buildTree } from "./build-tree";
import type { ManifestComponent } from "../../../electron/types";

function component(over: Partial<ManifestComponent> & { id: string }): ManifestComponent {
  return {
    id: over.id,
    group: over.group ?? "",
    section: over.section ?? null,
    background: "#fff",
    stories: over.stories ?? [{ id: "default", label: "Default", props: {} }],
    controls: [],
    sourcePath: null,
  };
}

describe("rank", () => {
  it("orders exact < prefix < substring < subsequence, null for no match", () => {
    expect(rank("button", "Button")).toBe(0); // exact (case-insensitive)
    expect(rank("but", "Button")).toBe(1); // prefix
    expect(rank("tto", "Button")).toBe(2); // substring
    expect(rank("bn", "Button")).toBe(3); // subsequence
    expect(rank("xyz", "Button")).toBeNull();
  });

  it("never buries an exact label below a fuzzy one", () => {
    const labels = ["ButtonGroup", "Button"];
    const sorted = labels
      .map((l) => ({ l, r: rank("button", l)! }))
      .sort((a, b) => a.r - b.r)
      .map((x) => x.l);
    expect(sorted[0]).toBe("Button");
  });
});

describe("filterTree", () => {
  it("keeps matched nodes + ancestors and marks ancestors to expand", () => {
    const tree = buildTree([
      component({ id: "button", section: "ui", group: "Forms" }),
      component({ id: "avatar", section: "ui" }),
    ]);
    const { nodes, expand } = filterTree(tree, "button");
    // Only the "ui" section survives, with Forms → Button; avatar pruned.
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ kind: "section", label: "ui" });
    expect(expand.has("section:ui")).toBe(true);
    expect(expand.has("section:ui/folder:Forms")).toBe(true);
  });

  it("returns the tree unchanged and empty expand set for an empty query", () => {
    const tree = buildTree([component({ id: "button" })]);
    const { nodes, expand } = filterTree(tree, "");
    expect(nodes).toBe(tree);
    expect(expand.size).toBe(0);
  });
});
