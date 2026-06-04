// Renderer-local view state for the editor canvas: zoom + which preview addons
// are active. (Addons run inside the iframe; see @gobrand/openstory-runtime.)

export const ADDONS = ["outline", "grid", "measure"] as const;
export type AddonName = (typeof ADDONS)[number];
export type AddonState = Record<AddonName, boolean>;

export const NO_ADDONS: AddonState = { outline: false, grid: false, measure: false };

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 3;
const ZOOM_FACTOR = 1.25;

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

// Multiplicative zoom step (Storybook-style): in multiplies, out divides.
export function zoomStep(z: number, dir: 1 | -1): number {
  return clampZoom(dir === 1 ? z * ZOOM_FACTOR : z / ZOOM_FACTOR);
}

export function zoomLabel(z: number): string {
  return `${Math.round(z * 100)}%`;
}
