// Renderer-local view state for the editor canvas: zoom + which preview addons
// are active. (Addons run inside the iframe; see @gobrand/openstory-runtime.)

export const ADDONS = ["outline", "grid", "measure"] as const;
export type AddonName = (typeof ADDONS)[number];
export type AddonState = Record<AddonName, boolean>;

export const NO_ADDONS: AddonState = { outline: false, grid: false, measure: false };

// Fixed, standard zoom stops with 100% dead-center and an equal number of steps
// above and below. Buttons walk this list, so every press lands on a clean value
// and 100% is always reachable — a multiplicative step drifts off-grid once it
// hits the min/max clamp and can never return to exactly 1.
export const ZOOM_STOPS: readonly number[] = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
export const ZOOM_MIN = ZOOM_STOPS[0]!;
export const ZOOM_MAX = ZOOM_STOPS[ZOOM_STOPS.length - 1]!;

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

// Index of the stop nearest to z (z is normally already a stop; snap defensively).
function nearestStopIndex(z: number): number {
  let best = 0;
  for (let i = 1; i < ZOOM_STOPS.length; i++) {
    if (Math.abs(ZOOM_STOPS[i]! - z) < Math.abs(ZOOM_STOPS[best]! - z)) best = i;
  }
  return best;
}

// Step to the adjacent zoom stop (in = up the list, out = down), clamped at the ends.
export function zoomStep(z: number, dir: 1 | -1): number {
  const next = nearestStopIndex(z) + dir;
  const i = Math.min(ZOOM_STOPS.length - 1, Math.max(0, next));
  return ZOOM_STOPS[i]!;
}

export function zoomLabel(z: number): string {
  return `${Math.round(z * 100)}%`;
}
