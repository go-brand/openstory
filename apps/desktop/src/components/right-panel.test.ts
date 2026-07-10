import { describe, expect, it } from "vitest";
import { PANEL_MAX_WIDTH, PANEL_MIN_WIDTH, PANEL_WIDTH, clampPanelWidth, panelShellSnapshot } from "./right-panel";

describe("panelShellSnapshot", () => {
  it("collapses docs closes immediately without reserving animated width", () => {
    expect(panelShellSnapshot({ isOpen: false, closeMode: "instant" })).toEqual({
      width: 0,
      transform: "translateX(100%)",
      shouldTransition: false,
    });
  });

  it("animates normal closes by collapsing layout width with the slide", () => {
    expect(panelShellSnapshot({ isOpen: false, closeMode: "animated" })).toEqual({
      width: 0,
      transform: "translateX(100%)",
      shouldTransition: true,
    });
  });

  it("uses the final open width without a transform when open", () => {
    expect(panelShellSnapshot({ isOpen: true, closeMode: "animated" })).toEqual({
      width: PANEL_WIDTH,
      transform: "translateX(0)",
      shouldTransition: true,
    });
  });

  it("uses the supplied panel width for open and reserved states", () => {
    expect(
      panelShellSnapshot({
        isOpen: true,
        closeMode: "animated",
        panelWidth: 412,
      }).width,
    ).toBe(412);
    expect(
      panelShellSnapshot({
        isOpen: false,
        closeMode: "animated",
        panelWidth: 412,
      }).width,
    ).toBe(0);
  });
});

describe("clampPanelWidth", () => {
  it("keeps panel width within the supported range", () => {
    expect(clampPanelWidth(PANEL_MIN_WIDTH - 1)).toBe(PANEL_MIN_WIDTH);
    expect(clampPanelWidth(PANEL_MAX_WIDTH + 1)).toBe(PANEL_MAX_WIDTH);
    expect(clampPanelWidth(411.6)).toBe(412);
  });
});
