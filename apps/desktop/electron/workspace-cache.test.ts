import { describe, expect, it } from "vitest";
import type { ManifestComponent, ManifestDoc, ProjectRecord } from "./types";
import {
  cachedWorkspaceDataForProject,
  nextWorkspaceDataCache,
  pruneWorkspaceDataCache,
} from "./workspace-cache";

function project(over: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: over.id ?? "project-a",
    name: over.name ?? "Project A",
    path: over.path ?? "/repo/a",
    addedAt: over.addedAt ?? "2026-07-01T00:00:00.000Z",
    identity: over.identity ?? {
      repository: { label: "Repo", slug: null, rootPath: "/repo" },
      workspace: { label: "Project A", relativePath: "a", rootPath: "/repo/a" },
      source: "automatic",
    },
  };
}

const manifest: ManifestComponent[] = [
  {
    id: "button",
    name: "Button",
    group: "",
    section: null,
    background: "#fff",
    stories: [{ id: "primary", label: "Primary", props: {} }],
    controls: [],
    sourcePath: null,
  },
];

const docs: ManifestDoc[] = [
  {
    id: "design-system",
    title: "Design System",
    group: "",
    section: null,
    html: "<h1>Design System</h1>",
    embeds: [],
    sourcePath: "/repo/a/design-system.stories.md",
  },
];

describe("workspace data cache", () => {
  it("returns cached manifest/docs for the same persisted project", () => {
    const p = project();
    const cache = nextWorkspaceDataCache({}, p, manifest, docs, "2026-07-01T01:00:00.000Z");

    expect(cachedWorkspaceDataForProject(cache, p)).toEqual({ manifest, docs });
  });

  it("ignores a project-id cache entry if the path no longer matches", () => {
    const original = project({ path: "/repo/a" });
    const moved = project({ path: "/repo/renamed" });
    const cache = nextWorkspaceDataCache({}, original, manifest, docs, "2026-07-01T01:00:00.000Z");

    expect(cachedWorkspaceDataForProject(cache, moved)).toBeNull();
  });

  it("stores empty live manifests so a repo that removed stories does not revive stale data", () => {
    const p = project();
    const withData = nextWorkspaceDataCache({}, p, manifest, docs, "2026-07-01T01:00:00.000Z");
    const empty = nextWorkspaceDataCache(withData, p, [], [], "2026-07-01T02:00:00.000Z");

    expect(cachedWorkspaceDataForProject(empty, p)).toEqual({ manifest: [], docs: [] });
  });

  it("prunes cache entries for removed projects", () => {
    const a = project({ id: "a", path: "/repo/a" });
    const b = project({ id: "b", path: "/repo/b" });
    const cache = nextWorkspaceDataCache(
      nextWorkspaceDataCache({}, a, manifest, docs, "2026-07-01T01:00:00.000Z"),
      b,
      manifest,
      docs,
      "2026-07-01T01:00:00.000Z",
    );

    expect(Object.keys(pruneWorkspaceDataCache(cache, ["b"]))).toEqual(["b"]);
  });
});
