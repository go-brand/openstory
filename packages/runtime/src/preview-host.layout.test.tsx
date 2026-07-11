// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
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
  vi.restoreAllMocks();
});

const Dummy = () => null;
function config() {
  return {
    components: [
      {
        id: "c",
        name: "C",
        component: Dummy,
        fixtures: [{ id: "s", label: "S", props: {} }],
      },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}
const selection = { componentId: "c", storyId: "s", viewport: "desktop" as const };

function configWithPreviewPadding() {
  return {
    components: [
      {
        id: "c",
        name: "C",
        component: Dummy,
        previewPadding: { top: 8 },
        fixtures: [
          { id: "s", label: "S", props: {} },
          { id: "override", label: "Override", props: {}, previewPadding: { top: 12 } },
        ],
      },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("PreviewStage", () => {
  it("renders the component in an inline-block measuring wrapper that shrink-wraps it", () => {
    render(<PreviewStage config={config()} selection={selection} />);
    const wrap = container.querySelector('div[style*="inline-block"]') as HTMLElement | null;
    expect(wrap).not.toBeNull();
    // No padding here — the manager supplies breathing room around the iframe, so
    // the reported size is the component box exactly.
    expect(wrap?.style.padding === "" || wrap?.style.padding === "0px").toBe(true);
  });

  it("reports readiness again when switching stories with the same width", () => {
    const post = vi.spyOn(window.parent, "postMessage");
    const cfg = {
      ...config(),
      components: [
        {
          ...config().components[0],
          fixtures: [
            { id: "s", label: "S", props: {} },
            { id: "s2", label: "S2", props: {} },
          ],
        },
      ],
    };

    render(<PreviewStage config={cfg} selection={selection} />);
    const firstRenderSizePosts = post.mock.calls.filter(
      ([msg]) => (msg as { type?: string }).type === "pl:size",
    ).length;
    flushSync(() =>
      root.render(<PreviewStage config={cfg} selection={{ ...selection, storyId: "s2" }} />),
    );

    expect(
      post.mock.calls.filter(([msg]) => (msg as { type?: string }).type === "pl:size"),
    ).toHaveLength(firstRenderSizePosts + 1);
  });

  it("applies component-level preview padding to the measuring wrapper", () => {
    render(<PreviewStage config={configWithPreviewPadding()} selection={selection} />);
    const wrap = container.querySelector('div[style*="inline-block"]') as HTMLElement | null;
    expect(wrap?.style.paddingTop).toBe("8px");
  });

  it("lets a story-level preview padding override the component default", () => {
    render(
      <PreviewStage
        config={configWithPreviewPadding()}
        selection={{ ...selection, storyId: "override" }}
      />,
    );
    const wrap = container.querySelector('div[style*="inline-block"]') as HTMLElement | null;
    expect(wrap?.style.paddingTop).toBe("12px");
  });

});

describe("DocsPage", () => {
  it("reports full-canvas readiness after docs mount", async () => {
    const post = vi.spyOn(window.parent, "postMessage");
    render(<DocsPage config={config()} componentId="c" />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(post).toHaveBeenCalledWith({ type: "pl:size", width: 0, height: 0 }, "*");
  });

  it("renders story cards with the standard inset", () => {
    render(<DocsPage config={config()} componentId="c" />);
    const card = container.querySelector('section div[style*="border"]') as HTMLElement | null;
    expect(card).not.toBeNull();
    expect(card?.style.padding).toBe("24px");
  });
});
