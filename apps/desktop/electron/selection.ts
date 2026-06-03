import type { ActiveSelection, ManifestComponent } from "./types";

export type SelectionPatch = Pick<
  ActiveSelection,
  "componentId" | "storyId" | "propOverrides" | "docsComponentId"
>;

// Reconcile the persisted selection against a freshly-loaded manifest.
// Returns a patch when the selection must change, or null when it's still valid.
//
// - The current selection still resolves to a real component + story → null (keep it).
// - Otherwise reset to the first component's first story, when one exists.
// - Empty manifest (or the first component has no stories) → clear to null, so the
//   harness bridge posts nothing instead of rendering the previous repo's stale
//   ghost component (e.g. "Unknown component: linkedin" after switching to a repo
//   whose openstory.config.ts has `components: []`).
export function reconcileSelection(
  manifest: ManifestComponent[],
  selection: Pick<ActiveSelection, "componentId" | "storyId">,
): SelectionPatch | null {
  const current = manifest.find((p) => p.id === selection.componentId);
  const valid = current?.stories.some((v) => v.id === selection.storyId) ?? false;
  if (valid) return null;

  const first = manifest[0];
  if (first && first.stories[0]) {
    return {
      componentId: first.id,
      storyId: first.stories[0].id,
      propOverrides: {},
      docsComponentId: null,
    };
  }
  return { componentId: null, storyId: null, propOverrides: {}, docsComponentId: null };
}
