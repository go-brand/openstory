import { describe, expect, it } from "vitest";
import type { AppState, ProjectRecord } from "../../electron/types";
import {
  projectAfterBatchAdd,
  REPO_MENU_WIDTH_CLASS,
  repoSwitcherSnapshot,
} from "./repo-switcher";

function project(
  id: string,
  repository: string,
  workspace: string,
  relativePath: string,
): ProjectRecord {
  const repositoryRoot = `/repos/${repository}`;
  const path = `${repositoryRoot}/${relativePath}`;
  return {
    id,
    name: workspace,
    path,
    addedAt: "2026-07-10",
    identity: {
      repository: {
        label: repository,
        slug: `go-brand/${repository}`,
        rootPath: repositoryRoot,
      },
      workspace: { label: workspace, relativePath, rootPath: path },
      source: "automatic",
    },
  };
}

function state(projects: ProjectRecord[]): AppState {
  return {
    projects,
    selection: {
      projectId: projects[0]?.id ?? null,
      componentId: null,
      storyId: null,
      docsComponentId: null,
      pageId: null,
      viewport: "desktop",
      mode: "design",
      layout: null,
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
    vite: { status: "idle", port: null, error: null },
  };
}

describe("repoSwitcherSnapshot", () => {
  it("uses full project identity and groups workspace rows by repository", () => {
    const projects = [
      project("gobrand", "GoBrand", "Web App", "apps/app"),
      project("admin", "GoBrand", "Admin", "apps/admin"),
      project("openstory", "OpenStory", "Desktop", "apps/desktop"),
    ];

    expect(repoSwitcherSnapshot(state(projects))).toEqual({
      triggerLabel: "GoBrand · Web App",
      accessibleLabel: "GoBrand, Web App",
      groups: [
        {
          label: "GoBrand",
          slug: "go-brand/GoBrand",
          rows: [
            { id: "admin", label: "Admin", relativePath: "apps/admin" },
            { id: "gobrand", label: "Web App", relativePath: "apps/app" },
          ],
        },
        {
          label: "OpenStory",
          slug: "go-brand/OpenStory",
          rows: [{ id: "openstory", label: "Desktop", relativePath: "apps/desktop" }],
        },
      ],
    });
    expect(REPO_MENU_WIDTH_CLASS).toBe("w-80");
  });

  it("keeps workspace labels primary when relative paths disambiguate identity", () => {
    const projects = [
      project("one", "GoBrand", "App", "apps/app"),
      project("two", "GoBrand", "App", "examples/app"),
    ];

    const snapshot = repoSwitcherSnapshot(state(projects));

    expect(snapshot.triggerLabel).toBe("GoBrand · apps/app");
    expect(snapshot.groups[0]?.rows).toEqual([
      { id: "one", label: "App", relativePath: "apps/app" },
      { id: "two", label: "App", relativePath: "examples/app" },
    ]);
  });
});

describe("projectAfterBatchAdd", () => {
  it("selects the first newly added workspace before existing batch results", () => {
    const existing = project("existing", "GoBrand", "App", "apps/app");
    const added = project("added", "GoBrand", "Admin", "apps/admin");
    const priorRoots = new Set([existing.identity.workspace.rootPath]);

    expect(projectAfterBatchAdd(priorRoots, [existing, added])).toBe(added);
    expect(projectAfterBatchAdd(priorRoots, [existing])).toBe(existing);
  });
});
