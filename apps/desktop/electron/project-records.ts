import { randomUUID } from "node:crypto";
import type { ProjectIdentity } from "@gobrand/openstory-config";
import { resolveProjectIdentity } from "@gobrand/openstory-vite/project-identity";
import type { ProjectRecord } from "./types";

export type LegacyProjectRecord = Omit<ProjectRecord, "identity"> & {
  identity?: ProjectIdentity;
};

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isProjectIdentity(identity: unknown): identity is ProjectIdentity {
  const candidate = identity as Partial<ProjectIdentity> | null;
  return (
    isNonBlankString(candidate?.repository?.label) &&
    (candidate.repository.slug === null || isNonBlankString(candidate.repository.slug)) &&
    isNonBlankString(candidate.repository.rootPath) &&
    isNonBlankString(candidate.workspace?.label) &&
    isNonBlankString(candidate.workspace.relativePath) &&
    isNonBlankString(candidate.workspace.rootPath) &&
    (candidate.source === "automatic" || candidate.source === "config")
  );
}

function hasIdentity(record: LegacyProjectRecord): record is ProjectRecord {
  return isProjectIdentity(record.identity);
}

export function createProjectRecord(
  path: string,
  addedAt = new Date().toISOString(),
  id: string = randomUUID(),
): ProjectRecord {
  const identity = resolveProjectIdentity(path);
  return {
    id,
    name: identity.workspace.label,
    path: identity.workspace.rootPath,
    addedAt,
    identity,
  };
}

export function backfillProjectRecords(records: LegacyProjectRecord[]): ProjectRecord[] {
  return records.map((record) => {
    if (hasIdentity(record)) return record;
    const identity = resolveProjectIdentity(record.path);
    return { ...record, name: identity.workspace.label, identity };
  });
}

export function withProjectIdentity(
  project: ProjectRecord,
  identity: ProjectIdentity,
): ProjectRecord {
  return { ...project, name: identity.workspace.label, identity };
}

export function mergeProjectRecords(
  existing: ProjectRecord[],
  incoming: ProjectRecord[],
): { projects: ProjectRecord[]; records: ProjectRecord[]; added: ProjectRecord[] } {
  const projects = [...existing];
  const byPath = new Map(projects.map((project) => [project.identity.workspace.rootPath, project]));
  const records: ProjectRecord[] = [];
  const added: ProjectRecord[] = [];

  for (const candidate of incoming) {
    const canonicalPath = candidate.identity.workspace.rootPath;
    const saved = byPath.get(canonicalPath);
    if (saved) {
      records.push(saved);
      continue;
    }
    projects.push(candidate);
    records.push(candidate);
    added.push(candidate);
    byPath.set(canonicalPath, candidate);
  }

  return { projects, records, added };
}
