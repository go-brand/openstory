// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { setGridEnabled } from "./grid";

afterEach(() => setGridEnabled(false));

describe("setGridEnabled", () => {
  it("appends a fixed, non-interactive grid overlay when enabled", () => {
    setGridEnabled(true);
    const el = document.getElementById("os-grid");
    expect(el?.tagName).toBe("DIV");
    expect(el?.style.position).toBe("fixed");
    expect(el?.style.pointerEvents).toBe("none");
    expect(el?.style.backgroundImage).toContain("linear-gradient");
  });

  it("removes the overlay when disabled", () => {
    setGridEnabled(true);
    setGridEnabled(false);
    expect(document.getElementById("os-grid")).toBeNull();
  });

  it("is idempotent — enabling twice keeps a single node", () => {
    setGridEnabled(true);
    setGridEnabled(true);
    expect(document.querySelectorAll("#os-grid")).toHaveLength(1);
  });
});
