import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

function isWithin(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

export async function resolveNextCacheRoot(projectRoot: string): Promise<string> {
  const canonicalRoot = await realpath(projectRoot);
  const projectHash = createHash("sha256").update(canonicalRoot).digest("hex").slice(0, 16);
  return join(canonicalRoot, ".openstory", "cache", "next", projectHash);
}

export async function assertRealPathWithin(path: string, allowedRoots: string[]): Promise<string> {
  const [canonicalPath, ...canonicalRoots] = await Promise.all([
    realpath(path),
    ...allowedRoots.map((root) => realpath(root)),
  ]);

  if (!canonicalRoots.some((root) => isWithin(root, canonicalPath))) {
    throw new Error(
      `[openstory] Refusing to load ${resolve(path)} because its real path is outside the allowed roots.`,
    );
  }

  return canonicalPath;
}
