import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AppState } from "../../electron/types";
import { ThemeProvider } from "./theme-provider";
import { Titlebar } from "./titlebar";

const state: AppState = {
  projects: [
    {
      id: "app",
      name: "app",
      path: "/tmp/app",
      addedAt: "2026-07-10",
      identity: {
        repository: { label: "repo", slug: null, rootPath: "/tmp" },
        workspace: { label: "app", relativePath: "app", rootPath: "/tmp/app" },
        source: "automatic",
      },
    },
  ],
  selection: {
    projectId: "app",
    componentId: null,
    storyId: null,
    docsComponentId: null,
    pageId: null,
    viewport: "desktop",
    mode: "design",
    propOverrides: {},
  },
  overlay: {
    opacity: 1,
    clickThrough: false,
    blendMode: "normal",
    visible: true,
    alwaysOnTop: false,
  },
  theme: "light",
  manifest: [],
  docs: [],
  iframeUrl: null,
  detachedOpen: false,
  previewServer: { status: "idle", adapter: null, port: null, error: null },
};

describe("Titlebar", () => {
  it("orders repository and mode context after the sidebar toggle and inspector after settings", () => {
    const titlebar = createElement(Titlebar, {
      state,
      api: undefined,
      onOpenPalette: () => {},
      leftSidebarOpen: true,
      onToggleLeftSidebar: () => {},
      inspectorOpen: true,
      onToggleInspector: () => {},
    });
    const html = renderToStaticMarkup(
      createElement(ThemeProvider, { theme: "light", api: undefined, children: titlebar }),
    );

    const sidebar = html.indexOf('aria-label="Hide sidebar"');
    const repository = html.indexOf('aria-label="Switch project: repo, app"');
    const mode = html.indexOf('aria-label="Switch mode: Design System"');
    const settings = html.indexOf('aria-label="Settings"');
    const inspector = html.indexOf('aria-label="Hide inspector"');
    const breadcrumbSeparator = html.slice(repository, mode);
    const betweenRightControls = html.slice(settings, inspector);

    expect(sidebar).toBeGreaterThan(-1);
    expect(repository).toBeGreaterThan(sidebar);
    expect(mode).toBeGreaterThan(repository);
    expect(breadcrumbSeparator).toContain('aria-hidden="true"');
    expect(breadcrumbSeparator).toContain(">/</span>");
    expect(settings).toBeGreaterThan(mode);
    expect(inspector).toBeGreaterThan(settings);
    expect(betweenRightControls.match(/<button/g)).toHaveLength(1);
  });
});
