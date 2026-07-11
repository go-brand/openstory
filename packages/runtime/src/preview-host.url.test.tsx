// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { PreviewStage, applyThemeFromUrl, readSelectionFromUrl } from "./preview-host";

function setUrl(search: string) {
  window.history.replaceState({}, "", `/__pl__/${search}`);
}

describe("readSelectionFromUrl", () => {
  it("reads component/story/viewport", () => {
    setUrl("?component=button&story=primary&viewport=desktop");
    expect(readSelectionFromUrl()).toEqual({
      componentId: "button",
      storyId: "primary",
      viewport: "desktop",
    });
  });

  it("returns null when a required param is missing", () => {
    setUrl("?component=button&story=primary");
    expect(readSelectionFromUrl()).toBeNull();
  });

  it("ignores the removed layout param", () => {
    setUrl("?component=button&story=primary&viewport=desktop&layout=centered");
    expect(readSelectionFromUrl()).toEqual({
      componentId: "button",
      storyId: "primary",
      viewport: "desktop",
    });
  });
});

describe("applyThemeFromUrl", () => {
  afterEach(() => document.documentElement.classList.remove("dark"));

  it("adds .dark on theme=dark", () => {
    setUrl("?component=button&story=primary&viewport=desktop&theme=dark");
    applyThemeFromUrl();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("leaves .dark off when theme is absent", () => {
    setUrl("?component=button&story=primary&viewport=desktop");
    applyThemeFromUrl();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("leaves .dark off for theme=light", () => {
    setUrl("?component=button&story=primary&viewport=desktop&theme=light");
    applyThemeFromUrl();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

// Task 2 — clean-DOM invariant: an agent's accessibility-tree snapshot must be
// the component's OWN semantics, not OpenStory chrome. The measure wrapper and
// canvas style must add no ARIA roles, landmarks, or headings around the render.
describe("clean accessibility tree around the rendered story", () => {
  let container: HTMLElement;
  let root: Root;
  function render(node: ReactElement) {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    flushSync(() => root.render(node));
  }
  afterEach(() => {
    flushSync(() => root.unmount());
    container.remove();
  });

  const SaveButton = () => <button type="button">Save</button>;
  const config = {
    components: [
      {
        id: "c",
        name: "C",
        component: SaveButton,
        fixtures: [{ id: "s", label: "S", props: {} }],
      },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  const selection = { componentId: "c", storyId: "s", viewport: "desktop" as const };

  it("injects no aria roles or landmarks; only the component's own button", () => {
    render(<PreviewStage config={config} selection={selection} />);
    expect(container.querySelectorAll("[role]").length).toBe(0);
    expect(container.querySelector("nav, header, main, aside")).toBeNull();
    expect(container.querySelector("button")?.textContent).toBe("Save");
  });
});
