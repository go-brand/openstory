import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, parse } from "node:path";

// Walk up from `startDir` to the filesystem root, returning the first directory
// for which `predicate(dir)` is true, or null.
function findUp(startDir: string, predicate: (dir: string) => boolean): string | null {
  let dir = startDir;
  const { root } = parse(dir);
  for (;;) {
    if (predicate(dir)) return dir;
    if (dir === root) return null;
    dir = dirname(dir);
  }
}

function hasPackageJson(dir: string): boolean {
  return existsSync(join(dir, "package.json"));
}

// A workspace root declares members: pnpm-workspace.yaml, or a package.json with
// a "workspaces" field (npm/yarn/bun). Member packages declare neither, so the
// walk passes them and stops at the real root.
function isWorkspaceRoot(dir: string): boolean {
  if (existsSync(join(dir, "pnpm-workspace.yaml"))) return true;
  const pkg = join(dir, "package.json");
  if (!existsSync(pkg)) return false;
  try {
    const json = JSON.parse(readFileSync(pkg, "utf8")) as { workspaces?: unknown };
    return json.workspaces !== undefined;
  } catch {
    return false;
  }
}

/**
 * Derive a sidebar SECTION from a component's absolute source path: the basename
 * of the workspace package the file belongs to (apps/app → "app", packages/ui →
 * "ui"). Returns null when there is no monorepo workspace, or when the file's
 * package IS the workspace root — those render flat at the tree root. On any
 * ambiguity we return null (flat) rather than guess a wrong section.
 */
export function deriveSection(sourcePath: string | null): string | null {
  if (!sourcePath) return null;
  const startDir = dirname(sourcePath);
  const pkgDir = findUp(startDir, hasPackageJson);
  if (!pkgDir) return null;
  const wsRoot = findUp(startDir, isWorkspaceRoot);
  if (!wsRoot) return null; // not a monorepo → flat
  if (pkgDir === wsRoot) return null; // root package itself → flat
  return basename(pkgDir);
}
