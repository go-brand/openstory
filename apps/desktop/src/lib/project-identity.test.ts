import { describe, expect, it } from "vitest";
import type { ProjectRecord } from "../../electron/types";
import {
  groupProjectsByRepository,
  projectAccessibleName,
  projectDisplayName,
  workspaceDisplayName,
} from "./project-identity";

function project({
  id,
  repository = "gb-monorepo",
  repositoryRoot = `/repos/${repository}`,
  slug = `go-brand/${repository}`,
  workspace = "app",
  relativePath = "apps/app",
}: {
  id: string;
  repository?: string;
  repositoryRoot?: string;
  slug?: string | null;
  workspace?: string;
  relativePath?: string;
}): ProjectRecord {
  const path = relativePath === "." ? repositoryRoot : `${repositoryRoot}/${relativePath}`;
  return {
    id,
    name: workspace,
    path,
    addedAt: "2026-07-10",
    identity: {
      repository: { label: repository, slug, rootPath: repositoryRoot },
      workspace: { label: workspace, relativePath, rootPath: path },
      source: "automatic",
    },
  };
}

describe("project identity presentation", () => {
  it("distinguishes the same workspace label across repositories", () => {
    const goBrand = project({ id: "gobrand" });
    const openStory = project({ id: "openstory", repository: "openstory" });

    expect(projectDisplayName(goBrand, [goBrand, openStory])).toBe("gb-monorepo · app");
    expect(projectDisplayName(openStory, [goBrand, openStory])).toBe("openstory · app");
    expect(projectAccessibleName(goBrand, [goBrand, openStory])).toBe("gb-monorepo, app");
  });

  it("uses relative paths for duplicate labels inside one repository", () => {
    const first = project({ id: "one", relativePath: "apps/app" });
    const second = project({ id: "two", relativePath: "examples/app" });

    expect(workspaceDisplayName(first, [first, second])).toBe("apps/app");
    expect(projectDisplayName(second, [first, second])).toBe("gb-monorepo · examples/app");
  });

  it("keeps repository and workspace as explicit identity levels at the root", () => {
    const root = project({
      id: "root",
      repository: "openstory",
      workspace: "openstory",
      relativePath: ".",
    });

    expect(projectDisplayName(root, [root])).toBe("openstory · openstory");
    expect(projectAccessibleName(root, [root])).toBe("openstory, openstory");
  });
});

describe("groupProjectsByRepository", () => {
  it("sorts repository groups and their workspaces deterministically", () => {
    const projects = [
      project({ id: "web", repository: "OpenStory", workspace: "Web", relativePath: "apps/web" }),
      project({
        id: "admin",
        repository: "GoBrand",
        workspace: "Admin",
        relativePath: "apps/admin",
      }),
      project({ id: "app", repository: "GoBrand", workspace: "App", relativePath: "apps/app" }),
    ];

    const groups = groupProjectsByRepository(projects);

    expect(groups.map((group) => group.label)).toEqual(["GoBrand", "OpenStory"]);
    expect(groups[0]?.projects.map((item) => item.id)).toEqual(["admin", "app"]);
  });
});
