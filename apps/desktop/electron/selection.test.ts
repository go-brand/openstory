import { describe, it, expect } from "vitest";
import type { ManifestComponent } from "./types";
import { reconcileSelection } from "./selection";

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

describe("reconcileSelection", () => {
  it("returns null when the current selection still resolves", () => {
    const manifest = [
      component({ id: "button", stories: [{ id: "primary", label: "P", props: {} }] }),
    ];
    expect(reconcileSelection(manifest, { componentId: "button", storyId: "primary" })).toBeNull();
  });

  it("resets to the first component+story when the selection is stale but the manifest has one", () => {
    const manifest = [
      component({ id: "card", stories: [{ id: "a", label: "A", props: {} }] }),
      component({ id: "button" }),
    ];
    expect(reconcileSelection(manifest, { componentId: "linkedin", storyId: "desktop" })).toEqual({
      componentId: "card",
      storyId: "a",
      propOverrides: {},
      docsComponentId: null,
    });
  });

  it("clears to null when the manifest is EMPTY (the stale-ghost bug)", () => {
    // Loading a repo whose openstory.config.ts has `components: []` must not leave
    // the previous repo's componentId in place — the harness would render
    // "Unknown component: <stale>".
    expect(reconcileSelection([], { componentId: "linkedin", storyId: "desktop" })).toEqual({
      componentId: null,
      storyId: null,
      propOverrides: {},
      docsComponentId: null,
    });
  });

  it("clears to null when the only component has no stories", () => {
    const manifest = [component({ id: "empty", stories: [] })];
    expect(reconcileSelection(manifest, { componentId: "linkedin", storyId: "x" })).toEqual({
      componentId: null,
      storyId: null,
      propOverrides: {},
      docsComponentId: null,
    });
  });

  it("resets when the componentId matches but the storyId is stale", () => {
    const manifest = [
      component({ id: "button", stories: [{ id: "primary", label: "P", props: {} }] }),
    ];
    expect(reconcileSelection(manifest, { componentId: "button", storyId: "gone" })).toEqual({
      componentId: "button",
      storyId: "primary",
      propOverrides: {},
      docsComponentId: null,
    });
  });
});
