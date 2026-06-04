// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import type { Layout } from "@gobrand/openstory-config";
import { DocsPage, PreviewStage } from "./preview-host";

// Render synchronously into a detached container so we can read inline styles.
// flushSync forces React 19's concurrent root to commit before we assert.
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

const Dummy = () => null;
function config(layout?: Layout) {
  return {
    components: [
      {
        id: "c",
        name: "C",
        component: Dummy,
        layout,
        fixtures: [{ id: "s", label: "S", props: {} }],
      },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}
const selection = { componentId: "c", storyId: "s", viewport: "desktop" as const };

describe("PreviewStage layout", () => {
  it("applies centered layout (flex) to the render wrapper", () => {
    render(<PreviewStage config={config("centered")} selection={selection} />);
    expect(container.querySelector('div[style*="flex"]')).not.toBeNull();
  });

  it("defaults to padded — pads the render, no flex — when layout is unset", () => {
    render(<PreviewStage config={config()} selection={selection} />);
    expect(container.querySelector('div[style*="flex"]')).toBeNull();
    expect(container.querySelector('div[style*="padding"]')).not.toBeNull();
  });
});

describe("DocsPage layout", () => {
  it("centers each story card when the component layout is centered", () => {
    render(<DocsPage config={config("centered")} componentId="c" />);
    expect(container.querySelector('section div[style*="flex"]')).not.toBeNull();
  });

  it("does not force flex for the default padded layout", () => {
    render(<DocsPage config={config()} componentId="c" />);
    expect(container.querySelector('section div[style*="flex"]')).toBeNull();
  });

  it("renders story cards flush (no inner padding) for fullscreen", () => {
    render(<DocsPage config={config("fullscreen")} componentId="c" />);
    // The card that holds the render carries the border; for fullscreen it must
    // not add the default 24px inset.
    const card = container.querySelector('section div[style*="border"]') as HTMLElement | null;
    expect(card).not.toBeNull();
    expect(card?.style.padding === "" || card?.style.padding === "0px").toBe(true);
  });
});
