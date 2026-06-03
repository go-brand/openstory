import { describe, it, expect } from "vitest";
import type { ManifestPreview } from "./types";
import { reconcileSelection } from "./selection";

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

describe("reconcileSelection", () => {
  it("returns null when the current selection still resolves", () => {
    const manifest = [
      preview({ id: "button", variants: [{ id: "primary", label: "P", props: {} }] }),
    ];
    expect(reconcileSelection(manifest, { previewId: "button", variantId: "primary" })).toBeNull();
  });

  it("resets to the first preview+variant when the selection is stale but the manifest has one", () => {
    const manifest = [
      preview({ id: "card", variants: [{ id: "a", label: "A", props: {} }] }),
      preview({ id: "button" }),
    ];
    expect(reconcileSelection(manifest, { previewId: "linkedin", variantId: "desktop" })).toEqual({
      previewId: "card",
      variantId: "a",
      propOverrides: {},
      docsComponentId: null,
    });
  });

  it("clears to null when the manifest is EMPTY (the stale-ghost bug)", () => {
    // Loading a repo whose openstory.config.ts has `previews: []` must not leave
    // the previous repo's previewId in place — the harness would render
    // "Unknown preview: <stale>".
    expect(reconcileSelection([], { previewId: "linkedin", variantId: "desktop" })).toEqual({
      previewId: null,
      variantId: null,
      propOverrides: {},
      docsComponentId: null,
    });
  });

  it("clears to null when the only preview has no variants", () => {
    const manifest = [preview({ id: "empty", variants: [] })];
    expect(reconcileSelection(manifest, { previewId: "linkedin", variantId: "x" })).toEqual({
      previewId: null,
      variantId: null,
      propOverrides: {},
      docsComponentId: null,
    });
  });

  it("resets when the previewId matches but the variantId is stale", () => {
    const manifest = [
      preview({ id: "button", variants: [{ id: "primary", label: "P", props: {} }] }),
    ];
    expect(reconcileSelection(manifest, { previewId: "button", variantId: "gone" })).toEqual({
      previewId: "button",
      variantId: "primary",
      propOverrides: {},
      docsComponentId: null,
    });
  });
});
