import { describe, it, expect } from "vitest";
import { BUILTIN_PRESETS, DEFAULT_BACKGROUND, resolvePresets, resolveRender } from "./presets.js";

describe("resolvePresets", () => {
  it("returns the built-ins when no user presets given", () => {
    expect(resolvePresets()).toEqual(BUILTIN_PRESETS);
  });

  it("merges user presets over built-ins (user wins on name clash)", () => {
    const merged = resolvePresets({
      dashboard: { viewport: { desktop: { width: 1280 } } },
      default: { viewport: { desktop: { width: 999 } } },
    });
    expect(merged.dashboard?.viewport.desktop.width).toBe(1280);
    expect(merged.default?.viewport.desktop.width).toBe(999);
  });

  it("ships only a neutral `default` preset — no platform-specific built-ins", () => {
    expect(Object.keys(BUILTIN_PRESETS)).toEqual(["default"]);
  });
});

describe("resolveRender", () => {
  // Project-defined presets, the way a consumer declares them in their config.
  const presets = resolvePresets({
    column: { viewport: { desktop: { width: 552 } }, chrome: { background: "#f3f2ef" } },
  });

  it("uses the default preset when no preset named", () => {
    const r = resolveRender({}, presets);
    expect(r.viewport.desktop.width).toBe(600);
    expect(r.viewport.mobile.width).toBe(360);
    expect(r.background).toBe(DEFAULT_BACKGROUND);
  });

  it("uses a named preset's viewport and background", () => {
    const r = resolveRender({ preset: "column" }, presets);
    expect(r.viewport.desktop.width).toBe(552);
    expect(r.background).toBe("#f3f2ef");
  });

  it("explicit viewports override the preset", () => {
    const r = resolveRender(
      { preset: "column", viewports: { desktop: { width: 700, dpr: 2 } } },
      presets,
    );
    expect(r.viewport.desktop).toEqual({ width: 700, dpr: 2 });
    expect(r.background).toBe("#f3f2ef"); // background still from preset
  });

  it("falls back to default mobile when preset has none", () => {
    const custom = resolvePresets({ tall: { viewport: { desktop: { width: 800 } } } });
    const r = resolveRender({ preset: "tall" }, custom);
    expect(r.viewport.mobile.width).toBe(360);
  });

  it("falls back to the default preset for an unknown preset name", () => {
    const r = resolveRender({ preset: "does-not-exist" }, presets);
    expect(r.viewport.desktop.width).toBe(600);
    expect(r.background).toBe(DEFAULT_BACKGROUND);
  });
});
