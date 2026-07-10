import { describe, expect, it } from "vitest";
import { showProjectLoading, sidebarShellSnapshot } from "./sidebar";

describe("sidebarShellSnapshot", () => {
  it("reserves the full sidebar width and shows the surface when open", () => {
    expect(sidebarShellSnapshot(true)).toEqual({
      width: 268,
      transform: "translateX(0)",
      opacity: 1,
    });
  });

  it("releases the sidebar width and hides the translated surface when closed", () => {
    expect(sidebarShellSnapshot(false)).toEqual({
      width: 0,
      transform: "translateX(-100%)",
      opacity: 0,
    });
  });
});

describe("showProjectLoading", () => {
  it("shows loading while a project starts with no workspace data", () => {
    expect(showProjectLoading(1, "starting", 0)).toBe(true);
  });

  it("keeps cached workspace data visible while a project starts", () => {
    expect(showProjectLoading(1, "starting", 3)).toBe(false);
  });

  it("does not show project loading when no project has been added", () => {
    expect(showProjectLoading(0, "idle", 0)).toBe(false);
  });
});
