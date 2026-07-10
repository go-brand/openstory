import { describe, expect, it, vi } from "vitest";
import {
  markAppLoadStart,
  markPreviewRequest,
  markWorkspaceLoadStart,
  measureAppWorkspaceDataVisible,
  measurePreviewVisible,
  measureWorkspaceDataVisible,
} from "./performance";

function fakePerformance() {
  return {
    mark: vi.fn(),
    measure: vi.fn(),
  };
}

describe("performance markers", () => {
  it("measures app load through workspace data visibility", () => {
    const perf = fakePerformance();

    markAppLoadStart(perf);
    measureAppWorkspaceDataVisible("cache", perf);

    expect(perf.mark).toHaveBeenCalledWith("openstory:app:start");
    expect(perf.mark).toHaveBeenCalledWith("openstory:app:workspace-data-visible");
    expect(perf.measure).toHaveBeenCalledWith(
      "openstory:app-workspace-data-visible:cache",
      "openstory:app:start",
      "openstory:app:workspace-data-visible",
    );
  });

  it("measures project selection through workspace data visibility", () => {
    const perf = fakePerformance();

    markWorkspaceLoadStart("project-a", perf);
    measureWorkspaceDataVisible("project-a", "cache", perf);

    expect(perf.mark).toHaveBeenCalledWith("openstory:workspace:project-a:start");
    expect(perf.mark).toHaveBeenCalledWith("openstory:workspace:project-a:data-visible");
    expect(perf.measure).toHaveBeenCalledWith(
      "openstory:workspace-data-visible:cache",
      "openstory:workspace:project-a:start",
      "openstory:workspace:project-a:data-visible",
    );
  });

  it("measures preview click through iframe visibility", () => {
    const perf = fakePerformance();

    markPreviewRequest("docs", perf);
    measurePreviewVisible("docs", perf);

    expect(perf.mark).toHaveBeenCalledWith("openstory:preview:docs:request");
    expect(perf.mark).toHaveBeenCalledWith("openstory:preview:docs:visible");
    expect(perf.measure).toHaveBeenCalledWith(
      "openstory:preview-visible:docs",
      "openstory:preview:docs:request",
      "openstory:preview:docs:visible",
    );
  });

  it("does not let unsupported performance APIs break the app", () => {
    const perf = {
      mark: vi.fn(() => {
        throw new Error("no marks");
      }),
      measure: vi.fn(),
    };

    expect(() => {
      markWorkspaceLoadStart("project-a", perf);
      measureWorkspaceDataVisible("project-a", "live", perf);
    }).not.toThrow();
  });
});
