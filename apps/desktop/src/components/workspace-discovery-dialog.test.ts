import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { WorkspaceInspection } from "../../electron/workspace-discovery";
import {
  initialWorkspaceSelection,
  WorkspaceDiscoveryList,
  workspaceDiscoverySnapshot,
} from "./workspace-discovery-dialog";

const inspection: WorkspaceInspection = {
  repository: {
    label: "GoBrand",
    slug: "go-brand/gb-monorepo",
    rootPath: "/repo",
  },
  candidates: [
    {
      path: "/repo/apps/app",
      identity: {
        repository: {
          label: "GoBrand",
          slug: "go-brand/gb-monorepo",
          rootPath: "/repo",
        },
        workspace: { label: "Web App", relativePath: "apps/app", rootPath: "/repo/apps/app" },
        source: "config",
      },
    },
    {
      path: "/repo/apps/admin",
      identity: {
        repository: {
          label: "GoBrand",
          slug: "go-brand/gb-monorepo",
          rootPath: "/repo",
        },
        workspace: {
          label: "Admin",
          relativePath: "apps/admin",
          rootPath: "/repo/apps/admin",
        },
        source: "config",
      },
    },
  ],
};

describe("workspaceDiscoverySnapshot", () => {
  it("describes selected workspaces and confirmation copy", () => {
    expect(
      workspaceDiscoverySnapshot(inspection, new Set(inspection.candidates.map((c) => c.path))),
    ).toEqual({
      repositoryLabel: "GoBrand",
      repositorySlug: "go-brand/gb-monorepo",
      confirmLabel: "Add 2 workspaces",
      rows: [
        { label: "Web App", relativePath: "apps/app", selected: true },
        { label: "Admin", relativePath: "apps/admin", selected: true },
      ],
    });
  });

  it("uses singular copy and supports an empty selection", () => {
    expect(
      workspaceDiscoverySnapshot(inspection, new Set([inspection.candidates[0]!.path]))
        .confirmLabel,
    ).toBe("Add 1 workspace");
    expect(workspaceDiscoverySnapshot(inspection, new Set()).confirmLabel).toBe("Add workspaces");
  });

  it("renders every discovered workspace selected on the initial frame", () => {
    const selectedPaths = initialWorkspaceSelection(inspection);
    const html = renderToStaticMarkup(
      createElement(WorkspaceDiscoveryList, {
        inspection,
        selectedPaths,
        onToggle: () => {},
      }),
    );

    expect(selectedPaths.size).toBe(2);
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html).toContain("Web App");
    expect(html).toContain("apps/app");
  });
});
