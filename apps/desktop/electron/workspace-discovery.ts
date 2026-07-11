import { existsSync, readFileSync, realpathSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import type { ProjectIdentity } from "@gobrand/openstory-config";
import { resolveProjectIdentity } from "@gobrand/openstory-vite/project-identity";
import { glob } from "tinyglobby";
import { parse } from "yaml";

export type WorkspaceCandidate = {
  path: string;
  identity: ProjectIdentity;
};

export type WorkspaceInspection = {
  repository: ProjectIdentity["repository"];
  candidates: WorkspaceCandidate[];
};

const IGNORED = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.hg/**",
  "**/.svn/**",
  "**/.turbo/**",
  "**/.next/**",
  "**/dist/**",
  "**/build/**",
  "**/out/**",
];

function canonicalPath(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
}

function containsOpenStoryConfig(path: string): boolean {
  return (
    existsSync(resolve(path, "openstory.config.ts")) ||
    existsSync(resolve(path, "openstory.config.js"))
  );
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function pnpmPatterns(root: string): string[] {
  try {
    const parsed = parse(readFileSync(resolve(root, "pnpm-workspace.yaml"), "utf8")) as {
      packages?: unknown;
    };
    return stringArray(parsed?.packages);
  } catch {
    return [];
  }
}

function packagePatterns(root: string): string[] {
  try {
    const parsed = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      workspaces?: unknown;
    };
    if (Array.isArray(parsed.workspaces)) return stringArray(parsed.workspaces);
    if (parsed.workspaces && typeof parsed.workspaces === "object") {
      return stringArray((parsed.workspaces as { packages?: unknown }).packages);
    }
    return [];
  } catch {
    return [];
  }
}

function isInsideOrSame(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(`..${sep}`));
}

function candidate(path: string, repository?: ProjectIdentity["repository"]): WorkspaceCandidate {
  const identity = resolveProjectIdentity(path);
  if (!repository) return { path: identity.workspace.rootPath, identity };
  const relativePath =
    relative(repository.rootPath, identity.workspace.rootPath).split(sep).join("/") || ".";
  return {
    path: identity.workspace.rootPath,
    identity: {
      ...identity,
      repository,
      workspace: { ...identity.workspace, relativePath },
    },
  };
}

export async function inspectWorkspaceSelection(
  selectedPath: string,
): Promise<WorkspaceInspection> {
  const selectedRoot = canonicalPath(selectedPath);
  const selectedIdentity = resolveProjectIdentity(selectedRoot);

  if (containsOpenStoryConfig(selectedRoot)) {
    return { repository: selectedIdentity.repository, candidates: [candidate(selectedRoot)] };
  }

  const patterns = [...new Set([...pnpmPatterns(selectedRoot), ...packagePatterns(selectedRoot)])];
  if (patterns.length === 0) {
    return { repository: selectedIdentity.repository, candidates: [candidate(selectedRoot)] };
  }

  const matches = await glob(patterns, {
    cwd: selectedRoot,
    absolute: true,
    onlyDirectories: true,
    followSymbolicLinks: true,
    ignore: IGNORED,
  });
  const candidatesByPath = new Map<string, WorkspaceCandidate>();
  for (const match of matches) {
    const path = canonicalPath(match);
    if (!isInsideOrSame(selectedRoot, path) || !containsOpenStoryConfig(path)) continue;
    candidatesByPath.set(path, candidate(path, selectedIdentity.repository));
  }

  const candidates = [...candidatesByPath.values()].sort((a, b) =>
    a.identity.workspace.relativePath.localeCompare(b.identity.workspace.relativePath),
  );
  return {
    repository: selectedIdentity.repository,
    candidates: candidates.length > 0 ? candidates : [candidate(selectedRoot)],
  };
}
