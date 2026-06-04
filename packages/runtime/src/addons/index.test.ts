// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { applyAddons } from "./index";

afterEach(() => applyAddons({ outline: false, grid: false, measure: false }));

describe("applyAddons", () => {
  it("turns on exactly the enabled overlays", () => {
    applyAddons({ outline: true, grid: false, measure: false });
    expect(document.getElementById("os-outline")).not.toBeNull();
    expect(document.getElementById("os-grid")).toBeNull();
    expect(document.getElementById("os-measure")).toBeNull();
  });

  it("turns overlays off when re-applied with false", () => {
    applyAddons({ outline: true, grid: true, measure: false });
    applyAddons({ outline: false, grid: false, measure: false });
    expect(document.getElementById("os-outline")).toBeNull();
    expect(document.getElementById("os-grid")).toBeNull();
  });
});
