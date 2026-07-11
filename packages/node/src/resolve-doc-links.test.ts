import { describe, expect, it } from "vitest";
import { resolveLink, linkHtml } from "./resolve-doc-links.js";

const ctx = {
  fromPath: "/p/docs/design-system.stories.md",
  pageByAbsPath: new Map([
    ["/p/docs/design-system.stories.md", "design-system"],
    ["/p/docs/how-the-mcp-works.stories.md", "how-the-mcp-works"],
  ]),
  componentByAbsPath: new Map([
    ["/p/components/button.stories.tsx", { id: "button", storyIds: new Set(["primary", "ghost"]) }],
  ]),
};

describe("resolveLink", () => {
  it("resolves a sibling doc to a page target", () => {
    expect(resolveLink("./how-the-mcp-works.stories.md", ctx)).toEqual({
      kind: "page",
      id: "how-the-mcp-works",
    });
  });
  it("resolves a component file with no fragment to auto-docs", () => {
    expect(resolveLink("../components/button.stories.tsx", ctx)).toEqual({
      kind: "docs",
      componentId: "button",
    });
  });
  it("resolves a component file + valid story fragment to a story", () => {
    expect(resolveLink("../components/button.stories.tsx#primary", ctx)).toEqual({
      kind: "story",
      componentId: "button",
      storyId: "primary",
    });
  });
  it("marks a fragment that matches no story inert", () => {
    const r = resolveLink("../components/button.stories.tsx#missing", ctx);
    expect(r.kind).toBe("inert");
  });
  it("marks an unknown relative path inert", () => {
    expect(resolveLink("./nope.stories.md", ctx).kind).toBe("inert");
  });
  it("passes http/https/mailto through as external", () => {
    expect(resolveLink("https://anthropic.com", ctx)).toEqual({ kind: "external" });
    expect(resolveLink("mailto:a@b.com", ctx)).toEqual({ kind: "external" });
  });
  it("marks an unsupported scheme inert", () => {
    expect(resolveLink("ftp://x", ctx).kind).toBe("inert");
  });
  it("leaves a pure in-page anchor as passthrough", () => {
    expect(resolveLink("#section", ctx)).toEqual({ kind: "passthrough" });
  });
});

describe("linkHtml", () => {
  it("emits a custom-scheme anchor for a page", () => {
    expect(linkHtml({ kind: "page", id: "design-system" }, "./x.md", "Text")).toBe(
      '<a href="openstory:page/design-system">Text</a>',
    );
  });
  it("encodes id segments", () => {
    expect(linkHtml({ kind: "story", componentId: "a/b", storyId: "c d" }, "x", "T")).toBe(
      '<a href="openstory:story/a%2Fb/c%20d">T</a>',
    );
  });
  it("keeps external href + adds rel", () => {
    expect(linkHtml({ kind: "external" }, "https://x.com", "T")).toBe(
      '<a href="https://x.com" rel="noopener noreferrer">T</a>',
    );
  });
  it("renders inert as a non-clickable span", () => {
    expect(linkHtml({ kind: "inert", reason: "x" }, "./bad", "T")).toBe(
      '<span class="openstory-doc-deadlink" title="unresolved link">T</span>',
    );
  });
  it("emits a custom-scheme anchor for docs (auto-docs)", () => {
    expect(linkHtml({ kind: "docs", componentId: "button" }, "x", "T")).toBe(
      '<a href="openstory:docs/button">T</a>',
    );
  });
  it("keeps a passthrough anchor's href as-is", () => {
    expect(linkHtml({ kind: "passthrough" }, "#section", "T")).toBe('<a href="#section">T</a>');
  });
});
