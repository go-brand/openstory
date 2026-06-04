import { setOutlineEnabled } from "./outline.js";
import { setGridEnabled } from "./grid.js";
import { setMeasureEnabled } from "./measure.js";

export type AddonName = "outline" | "grid" | "measure";
export type AddonState = Record<AddonName, boolean>;

// Reconcile the live overlays to the desired state. Each setter is idempotent,
// so calling this on every state change is safe.
export function applyAddons(state: AddonState, doc: Document = document): void {
  setOutlineEnabled(state.outline, doc);
  setGridEnabled(state.grid, doc);
  setMeasureEnabled(state.measure, doc);
}

export { computeBoxModel } from "./measure.js";
