import { describe, expect, it, vi } from "vitest";
import { dispatchNavigate, renderFallbackDelayMs, type NavigateTarget } from "./use-harness-bridge";

function fakeApi() {
  const invoke = vi.fn();
  return { api: { invoke } as never, invoke };
}

describe("dispatchNavigate", () => {
  it("routes page → preview:setPage", () => {
    const { api, invoke } = fakeApi();
    dispatchNavigate(api, { kind: "page", id: "design-system" }, "desktop");
    expect(invoke).toHaveBeenCalledWith("preview:setPage", "design-system");
  });
  it("routes docs → preview:setDocs", () => {
    const { api, invoke } = fakeApi();
    dispatchNavigate(api, { kind: "docs", componentId: "button" }, "desktop");
    expect(invoke).toHaveBeenCalledWith("preview:setDocs", "button");
  });
  it("routes story → preview:set with the current viewport", () => {
    const { api, invoke } = fakeApi();
    const t: NavigateTarget = { kind: "story", componentId: "button", storyId: "primary" };
    dispatchNavigate(api, t, "mobile");
    expect(invoke).toHaveBeenCalledWith("preview:set", {
      componentId: "button",
      storyId: "primary",
      viewport: "mobile",
    });
  });
  it("routes external → shell:openExternal", () => {
    const { api, invoke } = fakeApi();
    dispatchNavigate(api, { kind: "external", href: "https://anthropic.com" }, "desktop");
    expect(invoke).toHaveBeenCalledWith("shell:openExternal", "https://anthropic.com");
  });
});

describe("renderFallbackDelayMs", () => {
  const base = {
    projectId: null,
    componentId: "button",
    storyId: "default",
    docsComponentId: null,
    pageId: null,
    viewport: "desktop",
    mode: "design",
    layout: null,
    propOverrides: {},
  } as const;

  it("uses a short fallback for full-canvas docs and page renders", () => {
    expect(renderFallbackDelayMs({ ...base, docsComponentId: "button" })).toBe(50);
    expect(renderFallbackDelayMs({ ...base, pageId: "design-system" })).toBe(50);
  });

  it("keeps the conservative fallback for measured story renders", () => {
    expect(renderFallbackDelayMs(base)).toBe(120);
  });
});
