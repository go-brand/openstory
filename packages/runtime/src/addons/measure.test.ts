import { describe, it, expect } from "vitest";
import { computeBoxModel } from "./measure";

describe("computeBoxModel", () => {
  // border-box rect is 100×40 at (10,20); margin 5 all sides; border 2 all
  // sides; padding 3 all sides.
  const border = { x: 10, y: 20, width: 100, height: 40 };
  const edges = { top: 5, right: 5, bottom: 5, left: 5 };
  const bw = { top: 2, right: 2, bottom: 2, left: 2 };
  const pad = { top: 3, right: 3, bottom: 3, left: 3 };

  it("expands the margin box outward from the border box", () => {
    const { margin } = computeBoxModel(border, edges, bw, pad);
    expect(margin).toEqual({ x: 5, y: 15, width: 110, height: 50 });
  });

  it("keeps the border box equal to the input rect", () => {
    const { border: b } = computeBoxModel(border, edges, bw, pad);
    expect(b).toEqual(border);
  });

  it("shrinks the padding box inward by border widths", () => {
    const { padding } = computeBoxModel(border, edges, bw, pad);
    expect(padding).toEqual({ x: 12, y: 22, width: 96, height: 36 });
  });

  it("shrinks the content box inward by border then padding", () => {
    const { content } = computeBoxModel(border, edges, bw, pad);
    expect(content).toEqual({ x: 15, y: 25, width: 90, height: 30 });
  });

  it("never produces negative dimensions", () => {
    const tiny = { x: 0, y: 0, width: 4, height: 4 };
    const big = { top: 10, right: 10, bottom: 10, left: 10 };
    const { content } = computeBoxModel(tiny, edges, big, big);
    expect(content.width).toBeGreaterThanOrEqual(0);
    expect(content.height).toBeGreaterThanOrEqual(0);
  });
});
