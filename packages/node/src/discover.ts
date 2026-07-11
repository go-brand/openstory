import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { isRegisteredComponent } from "@gobrand/openstory-config";
import type { OpenStoryConfig, RegisteredComponent } from "@gobrand/openstory-config";

const DEFAULT_PATTERNS = ["**/*.stories.{ts,tsx,md}"];
// Directory names never descended into (build output / vcs / deps).
const IGNORE_DIRS = new Set(["node_modules", "dist", "build", "out", ".git"]);

// Effective glob patterns: the config's `stories` field, or the zero-config default.
export function resolvePatterns(config: OpenStoryConfig | null): string[] {
  return config?.stories && config.stories.length > 0 ? config.stories : DEFAULT_PATTERNS;
}

// Split glob-matched files into the React-story path (ssrLoadModule) and the
// markdown-doc path (read + parse). `.md` cannot be loaded as a module.
export function partitionByExtension(files: string[]): {
  storyFiles: string[];
  docFiles: string[];
} {
  const docFiles = files.filter((f) => f.endsWith(".md"));
  const storyFiles = files.filter((f) => !f.endsWith(".md"));
  return { storyFiles, docFiles };
}

function escapeRe(s: string): string {
  return s.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

// Convert a glob to a RegExp matching a POSIX (forward-slash) relative path.
// Supported subset: `**` (any path segments), `*` (within a segment), `?` (one
// char), `{a,b,c}` (alternation). Enough for story-file patterns.
export function globToRegExp(glob: string): RegExp {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:[^/]+/)*"; // `**/` → zero or more whole segments
        } else {
          re += ".*"; // trailing `**`
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end === -1) {
        re += "\\{";
      } else {
        re +=
          "(?:" +
          glob
            .slice(i + 1, end)
            .split(",")
            .map(escapeRe)
            .join("|") +
          ")";
        i = end;
      }
    } else {
      re += escapeRe(c);
    }
  }
  return new RegExp("^" + re + "$");
}

// Recursively collect absolute file paths under `dir`, skipping IGNORE_DIRS.
function walk(dir: string, acc: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // unreadable dir (perms/race) — skip
  }
  for (const ent of entries) {
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!IGNORE_DIRS.has(ent.name)) walk(abs, acc);
    } else if (ent.isFile()) {
      acc.push(abs);
    }
  }
}

// Walk projectRoot and return all absolute file paths whose root-relative POSIX
// path matches at least one of the given glob patterns.
export function matchFiles(projectRoot: string, patterns: string[]): string[] {
  const matchers = patterns.map(globToRegExp);
  const all: string[] = [];
  walk(projectRoot, all);
  return all.filter((abs) => {
    const rel = relative(projectRoot, abs).split(sep).join("/");
    return matchers.some((re) => re.test(rel));
  });
}

// Load each file via the injected loader, keep valid `defineStories` results
// (skip the rest with a warning), and default sourcePath to the file path.
// `load` is injected (the plugin passes Vite's ssrLoadModule) so this is
// unit-testable with a fake.
export async function discoverComponentsFrom(
  storyFiles: string[],
  load: (absPath: string) => Promise<unknown>,
): Promise<RegisteredComponent[]> {
  const out: RegisteredComponent[] = [];
  for (const file of storyFiles) {
    let mod: unknown;
    try {
      mod = await load(file);
    } catch (err) {
      console.warn(`[openstory] failed to load ${file}: ${String(err)}`);
      continue;
    }
    const def = (mod as { default?: unknown })?.default;
    if (!isRegisteredComponent(def)) {
      console.warn(`[openstory] skipped ${file}: default export is not defineStories(...)`);
      continue;
    }
    out.push(def.sourcePath ? def : { ...def, sourcePath: file });
  }
  return out;
}

// Thin wrapper kept for backward compatibility — existing tests pass through here.
export async function discoverComponents(
  projectRoot: string,
  patterns: string[],
  load: (absPath: string) => Promise<unknown>,
): Promise<RegisteredComponent[]> {
  const files = matchFiles(projectRoot, patterns).filter((f) => !f.endsWith(".md"));
  return discoverComponentsFrom(files, load);
}
