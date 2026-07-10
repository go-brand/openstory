import { describe, expect, it } from "vitest";
import { mainAppShellSnapshot, previewFrameVisibility } from "./main-app";

describe("mainAppShellSnapshot", () => {
  it.each([
    {
      leftSidebarOpen: true,
      inspectorOpen: true,
      expected: { leftSidebarOpen: true, rightPanelOpen: true },
    },
    {
      leftSidebarOpen: false,
      inspectorOpen: true,
      expected: { leftSidebarOpen: false, rightPanelOpen: true },
    },
    {
      leftSidebarOpen: true,
      inspectorOpen: false,
      expected: { leftSidebarOpen: true, rightPanelOpen: false },
    },
    {
      leftSidebarOpen: false,
      inspectorOpen: false,
      expected: { leftSidebarOpen: false, rightPanelOpen: false },
    },
  ])(
    "keeps left=$leftSidebarOpen and inspector=$inspectorOpen independent",
    ({ leftSidebarOpen, inspectorOpen, expected }) => {
      expect(
        mainAppShellSnapshot({
          hasComponent: true,
          docsActive: false,
          leftSidebarOpen,
          inspectorOpen,
        }),
      ).toEqual(expected);
    },
  );

  it("derives a closed inspector when component context is unavailable", () => {
    expect(
      mainAppShellSnapshot({
        hasComponent: false,
        docsActive: false,
        leftSidebarOpen: true,
        inspectorOpen: true,
      }),
    ).toEqual({ leftSidebarOpen: true, rightPanelOpen: false });
  });

  it("derives a closed inspector for documentation context", () => {
    expect(
      mainAppShellSnapshot({
        hasComponent: true,
        docsActive: true,
        leftSidebarOpen: false,
        inspectorOpen: true,
      }),
    ).toEqual({ leftSidebarOpen: false, rightPanelOpen: false });
  });
});

describe("previewFrameVisibility", () => {
  it("hides the iframe while the selected render has not reported readiness", () => {
    expect(previewFrameVisibility(undefined)).toBe("hidden");
  });

  it("shows the iframe after the selected render reports its size or full-canvas mode", () => {
    expect(previewFrameVisibility("fill")).toBe("visible");
    expect(previewFrameVisibility({ width: 120, height: 40 })).toBe("visible");
  });
});
