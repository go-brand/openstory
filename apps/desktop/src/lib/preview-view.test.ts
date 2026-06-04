import { describe, it, expect } from "vitest";
import { clampZoom, zoomStep, zoomLabel, ZOOM_MIN, ZOOM_MAX } from "./preview-view";

describe("clampZoom", () => {
  it("clamps below min and above max", () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(1)).toBe(1);
  });
});

describe("zoomStep", () => {
  it("steps up and down by a multiplicative factor, clamped", () => {
    expect(zoomStep(1, 1)).toBeCloseTo(1.25);
    expect(zoomStep(1, -1)).toBeCloseTo(0.8);
    expect(zoomStep(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(zoomStep(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });
});

describe("zoomLabel", () => {
  it("renders a rounded percentage", () => {
    expect(zoomLabel(1)).toBe("100%");
    expect(zoomLabel(1.25)).toBe("125%");
    expect(zoomLabel(0.8)).toBe("80%");
  });
});
