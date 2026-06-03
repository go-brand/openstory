import type { ActiveSelection, ManifestPreview } from "./types";

export type SelectionPatch = Pick<
  ActiveSelection,
  "previewId" | "variantId" | "propOverrides" | "docsComponentId"
>;

// Reconcile the persisted selection against a freshly-loaded manifest.
// Returns a patch when the selection must change, or null when it's still valid.
//
// - The current selection still resolves to a real preview + variant → null (keep it).
// - Otherwise reset to the first preview's first variant, when one exists.
// - Empty manifest (or the first preview has no variants) → clear to null, so the
//   harness bridge posts nothing instead of rendering the previous repo's stale
//   ghost preview (e.g. "Unknown preview: linkedin" after switching to a repo
//   whose openstory.config.ts has `previews: []`).
export function reconcileSelection(
  manifest: ManifestPreview[],
  selection: Pick<ActiveSelection, "previewId" | "variantId">,
): SelectionPatch | null {
  const current = manifest.find((p) => p.id === selection.previewId);
  const valid = current?.variants.some((v) => v.id === selection.variantId) ?? false;
  if (valid) return null;

  const first = manifest[0];
  if (first && first.variants[0]) {
    return {
      previewId: first.id,
      variantId: first.variants[0].id,
      propOverrides: {},
      docsComponentId: null,
    };
  }
  return { previewId: null, variantId: null, propOverrides: {}, docsComponentId: null };
}
