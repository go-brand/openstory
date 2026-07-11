import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
import type { OpenStoryIdentityConfig, ProjectIdentity } from "@gobrand/openstory-config";

const automaticIdentityCache = new Map<string, ProjectIdentity>();

function canonicalPath(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
}

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export function normalizeGitRemote(remote: string): string | null {
  const value = remote.trim().replace(/\/+$/, "");
  if (!value) return null;

  let pathname: string;
  let local = false;
  if (value.includes("://")) {
    try {
      const url = new URL(value);
      pathname = url.pathname;
      local = url.protocol === "file:";
    } catch {
      return null;
    }
  } else {
    const scpMatch = value.match(/^[^/]+@[^:]+:(.+)$/);
    pathname = scpMatch?.[1] ?? value;
    local = !scpMatch;
  }

  const parts = pathname
    .replace(/\.git$/i, "")
    .split(/[\\/]+/)
    .filter((part) => part && part !== "." && part !== "..");
  if (parts.length < 2) return null;
  return (local ? parts.slice(-2) : parts).join("/");
}

function packageName(workspaceRoot: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(resolve(workspaceRoot, "package.json"), "utf8")) as {
      name?: unknown;
    };
    if (typeof parsed.name !== "string") return null;
    const name = parsed.name.trim();
    if (!name) return null;
    const slash = name.lastIndexOf("/");
    return slash >= 0 ? name.slice(slash + 1) : name;
  } catch {
    return null;
  }
}

function labelOverride(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.trim();
  return label ? label : null;
}

export function resolveProjectIdentity(
  workspaceRoot: string,
  override?: OpenStoryIdentityConfig | null,
): ProjectIdentity {
  const workspacePath = canonicalPath(workspaceRoot);
  let automatic = automaticIdentityCache.get(workspacePath);
  if (!automatic) {
    const gitRoot = git(workspacePath, ["rev-parse", "--show-toplevel"]);
    const repositoryPath = canonicalPath(gitRoot ?? workspacePath);
    const remote = git(workspacePath, ["remote", "get-url", "origin"]);
    const slug = remote ? normalizeGitRemote(remote) : null;
    const relativePath = relative(repositoryPath, workspacePath).split(sep).join("/") || ".";
    automatic = {
      repository: {
        label: slug?.split("/").at(-1) ?? basename(repositoryPath),
        slug,
        rootPath: repositoryPath,
      },
      workspace: {
        label: packageName(workspacePath) ?? basename(workspacePath),
        relativePath,
        rootPath: workspacePath,
      },
      source: "automatic",
    };
    automaticIdentityCache.set(workspacePath, automatic);
  }
  const repositoryLabel = labelOverride(override?.repository);
  const workspaceLabel = labelOverride(override?.workspace);

  return {
    repository: {
      ...automatic.repository,
      label: repositoryLabel ?? automatic.repository.label,
    },
    workspace: {
      ...automatic.workspace,
      label: workspaceLabel ?? automatic.workspace.label,
    },
    source: repositoryLabel || workspaceLabel ? "config" : "automatic",
  };
}
