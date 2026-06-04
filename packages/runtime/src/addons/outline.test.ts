// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { setOutlineEnabled } from "./outline";

afterEach(() => setOutlineEnabled(false));

describe("setOutlineEnabled", () => {
  it("injects a <style id=os-outline> when enabled", () => {
    setOutlineEnabled(true);
    const el = document.getElementById("os-outline");
    expect(el?.tagName).toBe("STYLE");
    expect(el?.textContent).toContain("outline");
  });

  it("removes the style when disabled", () => {
    setOutlineEnabled(true);
    setOutlineEnabled(false);
    expect(document.getElementById("os-outline")).toBeNull();
  });

  it("is idempotent — enabling twice keeps a single node", () => {
    setOutlineEnabled(true);
    setOutlineEnabled(true);
    expect(document.querySelectorAll("#os-outline")).toHaveLength(1);
  });
});
