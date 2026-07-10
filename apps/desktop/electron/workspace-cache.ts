import type { ManifestComponent, ManifestDoc, ProjectRecord } from "./types";

export type WorkspaceData = {
  manifest: ManifestComponent[];
  docs: ManifestDoc[];
};

export type WorkspaceDataCacheEntry = WorkspaceData & {
  schemaVersion: 1;
  projectPath: string;
  updatedAt: string;
};

export type WorkspaceDataCache = Record<string, WorkspaceDataCacheEntry>;

export function cachedWorkspaceDataForProject(
  cache: WorkspaceDataCache,
  project: ProjectRecord,
): WorkspaceData | null {
  const entry = cache[project.id];
  if (!entry || entry.projectPath !== project.path) return null;
  return { manifest: entry.manifest, docs: entry.docs };
}

export function nextWorkspaceDataCache(
  cache: WorkspaceDataCache,
  project: ProjectRecord,
  manifest: ManifestComponent[],
  docs: ManifestDoc[],
  updatedAt = new Date().toISOString(),
): WorkspaceDataCache {
  return {
    ...cache,
    [project.id]: {
      schemaVersion: 1,
      projectPath: project.path,
      updatedAt,
      manifest,
      docs,
    },
  };
}

export function pruneWorkspaceDataCache(
  cache: WorkspaceDataCache,
  projectIds: readonly string[],
): WorkspaceDataCache {
  const keep = new Set(projectIds);
  return Object.fromEntries(Object.entries(cache).filter(([id]) => keep.has(id)));
}
