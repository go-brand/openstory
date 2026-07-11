import type { ActiveSelection, ManifestComponent, ManifestDoc } from "./types";

export type SelectionPatch = Pick<
  ActiveSelection,
  "componentId" | "storyId" | "propOverrides" | "docsComponentId" | "pageId" | "mode"
>;

// Reconcile the persisted selection against a freshly-loaded manifest.
// Returns a patch when the selection must change, or null when it's still valid.
//
// - Active feature-doc page still exists -> null (keep it).
// - Active component docs still exist -> null (keep it).
// - Active component story still exists -> null (keep it).
// - Otherwise reset to the first component story, then the first feature-doc page.
// - Empty workspace -> clear to null, so the harness bridge posts nothing instead
//   of rendering the previous repo's stale ghost component.
export function reconcileSelection(
  manifest: ManifestComponent[],
  selection: Pick<ActiveSelection, "componentId" | "storyId" | "docsComponentId" | "pageId">,
  docs: ManifestDoc[] = [],
): SelectionPatch | null {
  if (selection.pageId) return docs.some((doc) => doc.id === selection.pageId) ? null : fallback();

  if (selection.docsComponentId) {
    return manifest.some((component) => component.id === selection.docsComponentId)
      ? null
      : fallback();
  }

  const current = manifest.find((p) => p.id === selection.componentId);
  const valid = current?.stories.some((v) => v.id === selection.storyId) ?? false;
  if (valid) return null;
  return fallback();

  function fallback(): SelectionPatch {
    const first = manifest[0];
    if (first && first.stories[0]) {
      return {
        componentId: first.id,
        storyId: first.stories[0].id,
        propOverrides: {},
        docsComponentId: null,
        pageId: null,
        mode: "design",
      };
    }

    const firstDoc = docs[0];
    if (firstDoc) {
      return {
        componentId: null,
        storyId: null,
        propOverrides: {},
        docsComponentId: null,
        pageId: firstDoc.id,
        mode: "docs",
      };
    }

    return {
      componentId: null,
      storyId: null,
      propOverrides: {},
      docsComponentId: null,
      pageId: null,
      mode: "design",
    };
  }
}

// Pick the mode to show after a manifest load: flip away from an EMPTY active
// mode to the populated one, but never override a mode that has content.
export function defaultMode(
  current: "design" | "docs",
  componentCount: number,
  docCount: number,
): "design" | "docs" {
  if (current === "docs" && docCount === 0 && componentCount > 0) return "design";
  if (current === "design" && componentCount === 0 && docCount > 0) return "docs";
  return current;
}
