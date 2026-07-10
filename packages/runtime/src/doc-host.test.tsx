// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { resolveEmbed, parseNavTarget, DocHost } from "./doc-host.js";

function Bell() {
  return null;
}
const components = [
  {
    id: "bell",
    name: "Bell",
    component: Bell,
    fixtures: [{ id: "unread", label: "Unread", props: { tone: "warn" } }],
  },
] as never[];

describe("resolveEmbed", () => {
  it("resolves a known componentId--storyId to its component + fixture props", () => {
    const r = resolveEmbed(components, "bell--unread");
    expect(r?.Comp).toBe(Bell);
    expect(r?.props).toEqual({ tone: "warn" });
  });
  it("returns null for an unknown component or story", () => {
    expect(resolveEmbed(components, "ghost--x")).toBeNull();
    expect(resolveEmbed(components, "bell--missing")).toBeNull();
  });
  it("returns null when the id has no -- separator", () => {
    expect(resolveEmbed(components, "bell")).toBeNull();
  });
});

describe("parseNavTarget", () => {
  it("decodes a page link", () => {
    expect(parseNavTarget("openstory:page/design-system")).toEqual({
      kind: "page",
      id: "design-system",
    });
  });
  it("decodes a docs (auto-docs) link", () => {
    expect(parseNavTarget("openstory:docs/button")).toEqual({
      kind: "docs",
      componentId: "button",
    });
  });
  it("decodes a story link", () => {
    expect(parseNavTarget("openstory:story/button/primary")).toEqual({
      kind: "story",
      componentId: "button",
      storyId: "primary",
    });
  });
  it("decodes percent-encoded segments", () => {
    expect(parseNavTarget("openstory:page/a%2Fb")).toEqual({ kind: "page", id: "a/b" });
  });
  it("treats http/https/mailto as external", () => {
    expect(parseNavTarget("https://anthropic.com")).toEqual({
      kind: "external",
      href: "https://anthropic.com",
    });
    expect(parseNavTarget("mailto:a@b.com")).toEqual({
      kind: "external",
      href: "mailto:a@b.com",
    });
  });
  it("returns null for an in-page anchor or unknown href", () => {
    expect(parseNavTarget("#heading")).toBeNull();
    expect(parseNavTarget("openstory:bogus/x")).toBeNull();
    expect(parseNavTarget("")).toBeNull();
  });
});

describe("DocHost click interception", () => {
  let container: HTMLElement;
  let root: Root;
  function mount(html: string) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => root.render(<DocHost html={html} embeds={[]} components={[]} />));
  }
  afterEach(() => {
    flushSync(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it("posts pl:navigate to the parent when an openstory: link is clicked", () => {
    const spy = vi.spyOn(window, "postMessage");
    mount('<p><a href="openstory:story/button/primary">Go</a></p>');
    const a = container.querySelector("a")!;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    a.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(spy).toHaveBeenCalledWith(
      { type: "pl:navigate", target: { kind: "story", componentId: "button", storyId: "primary" } },
      "*",
    );
  });

  it("ignores clicks on non-navigable spans", () => {
    const spy = vi.spyOn(window, "postMessage");
    mount('<p><span class="openstory-doc-deadlink">dead</span></p>');
    spy.mockClear();
    container
      .querySelector("span")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(spy).not.toHaveBeenCalled();
  });

  it("reports full-canvas readiness after docs mount", async () => {
    const spy = vi.spyOn(window.parent, "postMessage");
    mount("<p>Ready</p>");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(spy).toHaveBeenCalledWith({ type: "pl:size", width: 0, height: 0 }, "*");
  });
});
