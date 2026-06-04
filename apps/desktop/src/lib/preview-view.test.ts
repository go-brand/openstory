import { describe, it, expect } from "vitest";
import { clampZoom, zoomStep, zoomLabel, ZOOM_STOPS, ZOOM_MIN, ZOOM_MAX } from "./preview-view";

describe("ZOOM_STOPS", () => {
  it("centers 100% with an equal number of stops above and below", () => {
    const mid = ZOOM_STOPS.indexOf(1);
    expect(mid).toBeGreaterThan(-1);
    expect(mid).toBe(ZOOM_STOPS.length - 1 - mid);
  });
});

describe("clampZoom", () => {
  it("clamps below min and above max", () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(1)).toBe(1);
  });
});

describe("zoomStep", () => {
  it("steps to the adjacent fixed stop, clamped at the ends", () => {
    expect(zoomStep(1, 1)).toBe(1.25);
    expect(zoomStep(1, -1)).toBe(0.75);
    expect(zoomStep(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(zoomStep(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });

  it("always returns a value on the fixed stop list", () => {
    for (const z of ZOOM_STOPS) {
      expect(ZOOM_STOPS).toContain(zoomStep(z, 1));
      expect(ZOOM_STOPS).toContain(zoomStep(z, -1));
    }
  });

  it("returns to exactly 100% after stepping to the max and back (regression)", () => {
    // Walk up to the ceiling, then back down; 100% must be hit exactly.
    let z: number = ZOOM_MIN;
    for (let i = 0; i < ZOOM_STOPS.length; i++) z = zoomStep(z, 1);
    expect(z).toBe(ZOOM_MAX);
    const seen: number[] = [];
    for (let i = 0; i < ZOOM_STOPS.length; i++) {
      z = zoomStep(z, -1);
      seen.push(z);
    }
    expect(seen).toContain(1);
  });
});

describe("zoomLabel", () => {
  it("renders a rounded percentage", () => {
    expect(zoomLabel(1)).toBe("100%");
    expect(zoomLabel(1.25)).toBe("125%");
    expect(zoomLabel(0.5)).toBe("50%");
  });
});
