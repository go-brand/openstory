import { describe, it, expect } from "vitest";
import type { ManifestComponent, ManifestDoc } from "./types";
import { reconcileSelection, defaultMode } from "./selection";

function component(over: Partial<ManifestComponent> & { id: string }): ManifestComponent {
  return {
    id: over.id,
    name: over.name ?? over.id,
    group: over.group ?? "",
    section: over.section ?? null,
    background: "#fff",
    layout: over.layout ?? "padded",
    stories: over.stories ?? [{ id: "default", label: "Default", props: {} }],
    controls: [],
    sourcePath: null,
  };
}

function doc(over: Partial<ManifestDoc> & { id: string }): ManifestDoc {
  return {
    id: over.id,
    title: over.title ?? over.id,
    group: over.group ?? "",
    section: over.section ?? null,
    html: over.html ?? "<h1>Doc</h1>",
    embeds: over.embeds ?? [],
    sourcePath: over.sourcePath ?? `/repo/${over.id}.stories.md`,
  };
}

describe("reconcileSelection", () => {
  it("returns null when the current selection still resolves", () => {
    const manifest = [
      component({ id: "button", stories: [{ id: "primary", label: "P", props: {} }] }),
    ];
    expect(
      reconcileSelection(manifest, {
        componentId: "button",
        storyId: "primary",
        docsComponentId: null,
        pageId: null,
      }),
    ).toBeNull();
  });

  it("resets to the first component+story when the selection is stale but the manifest has one", () => {
    const manifest = [
      component({ id: "card", stories: [{ id: "a", label: "A", props: {} }] }),
      component({ id: "button" }),
    ];
    expect(
      reconcileSelection(manifest, {
        componentId: "linkedin",
        storyId: "desktop",
        docsComponentId: null,
        pageId: null,
      }),
    ).toEqual({
      componentId: "card",
      storyId: "a",
      propOverrides: {},
      docsComponentId: null,
      pageId: null,
      layout: null,
      mode: "design",
    });
  });

  it("clears to null when the manifest is EMPTY (the stale-ghost bug)", () => {
    // Loading a repo whose openstory.config.ts has `components: []` must not leave
    // the previous repo's componentId in place — the harness would render
    // "Unknown component: <stale>".
    expect(
      reconcileSelection([], {
        componentId: "linkedin",
        storyId: "desktop",
        docsComponentId: null,
        pageId: null,
      }),
    ).toEqual({
      componentId: null,
      storyId: null,
      propOverrides: {},
      docsComponentId: null,
      pageId: null,
      layout: null,
      mode: "design",
    });
  });

  it("clears to null when the only component has no stories", () => {
    const manifest = [component({ id: "empty", stories: [] })];
    expect(
      reconcileSelection(manifest, {
        componentId: "linkedin",
        storyId: "x",
        docsComponentId: null,
        pageId: null,
      }),
    ).toEqual({
      componentId: null,
      storyId: null,
      propOverrides: {},
      docsComponentId: null,
      pageId: null,
      layout: null,
      mode: "design",
    });
  });

  it("resets when the componentId matches but the storyId is stale", () => {
    const manifest = [
      component({ id: "button", stories: [{ id: "primary", label: "P", props: {} }] }),
    ];
    expect(
      reconcileSelection(manifest, {
        componentId: "button",
        storyId: "gone",
        docsComponentId: null,
        pageId: null,
      }),
    ).toEqual({
      componentId: "button",
      storyId: "primary",
      propOverrides: {},
      docsComponentId: null,
      pageId: null,
      layout: null,
      mode: "design",
    });
  });

  it("reset patches clear pageId", () => {
    const patch = reconcileSelection([], {
      componentId: "x",
      storyId: "y",
      docsComponentId: null,
      pageId: "old-page",
    });
    expect(patch).toMatchObject({ pageId: null });
  });

  it("keeps an active docs page when it still exists", () => {
    expect(
      reconcileSelection(
        [],
        { componentId: null, storyId: null, docsComponentId: null, pageId: "intro" },
        [doc({ id: "intro" })],
      ),
    ).toBeNull();
  });

  it("keeps active component docs when the component still exists", () => {
    expect(
      reconcileSelection(
        [component({ id: "button" })],
        { componentId: null, storyId: null, docsComponentId: "button", pageId: null },
        [],
      ),
    ).toBeNull();
  });

  it("does not keep a background story when the active docs page is stale", () => {
    expect(
      reconcileSelection(
        [component({ id: "button" })],
        {
          componentId: "button",
          storyId: "default",
          docsComponentId: null,
          pageId: "deleted-page",
        },
        [],
      ),
    ).toEqual({
      componentId: "button",
      storyId: "default",
      propOverrides: {},
      docsComponentId: null,
      pageId: null,
      layout: null,
      mode: "design",
    });
  });

  it("does not keep a background story when active component docs are stale", () => {
    expect(
      reconcileSelection(
        [component({ id: "button" })],
        {
          componentId: "button",
          storyId: "default",
          docsComponentId: "deleted-component",
          pageId: null,
        },
        [],
      ),
    ).toEqual({
      componentId: "button",
      storyId: "default",
      propOverrides: {},
      docsComponentId: null,
      pageId: null,
      layout: null,
      mode: "design",
    });
  });

  it("selects the first docs page for a docs-only workspace", () => {
    expect(
      reconcileSelection(
        [],
        { componentId: "old", storyId: "old", docsComponentId: null, pageId: null },
        [doc({ id: "intro" })],
      ),
    ).toEqual({
      componentId: null,
      storyId: null,
      propOverrides: {},
      docsComponentId: null,
      pageId: "intro",
      layout: null,
      mode: "docs",
    });
  });
});

describe("defaultMode", () => {
  it("flips an empty docs mode to design when components exist", () => {
    expect(defaultMode("docs", 3, 0)).toBe("design");
  });
  it("flips an empty design mode to docs when docs exist", () => {
    expect(defaultMode("design", 0, 2)).toBe("docs");
  });
  it("keeps a populated mode", () => {
    expect(defaultMode("design", 3, 2)).toBe("design");
    expect(defaultMode("docs", 3, 2)).toBe("docs");
  });
  it("keeps the mode when both are empty", () => {
    expect(defaultMode("design", 0, 0)).toBe("design");
  });
});
