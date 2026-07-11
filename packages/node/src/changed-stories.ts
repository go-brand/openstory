import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import type { Manifest } from "./assemble-manifest.js";

export type ChangedComponent = {
  id: string;
  name: string;
  stories: Array<{ id: string; label: string }>;
};

// Pure: which components' source files are in the changed set. The high-value
// agent loop — edit a component, ask what stories that touched, render only
// those — instead of re-scanning the whole design system every turn. Git IO is
// injected (see gitChangedFiles) so this stays unit-testable.
export function changedStories(manifest: Manifest, changedFiles: string[]): ChangedComponent[] {
  const changed = new Set(changedFiles);
  return manifest.components
    .filter((c) => c.sourcePath !== null && changed.has(c.sourcePath))
    .map((c) => ({
      id: c.id,
      name: c.name,
      stories: c.stories.map((s) => ({ id: s.id, label: s.label })),
    }));
}

// Run `git diff --name-only [base]` in the project and return absolute paths.
// `base` defaults to the working tree vs HEAD ("what did I just touch"). Any
// failure — not a git repo, git missing, bad ref — degrades to `{ files: null }`
// so callers fall back gracefully instead of crashing.
export function gitChangedFiles(projectRoot: string, base?: string): { files: string[] | null } {
  // `base` is agent-controlled (MCP tool input). execFileSync runs git with no
  // shell, so there is no shell injection — but a value like `--output=…` would
  // smuggle a git flag (argv injection). Reject anything starting with `-`. We
  // cannot use a `--` end-of-options marker here: `git diff -- <x>` treats <x>
  // as a pathspec, but `base` is a revision, so `--` would change the semantics.
  if (base !== undefined && base.startsWith("-")) return { files: null };
  try {
    const args = ["diff", "--name-only", ...(base ? [base] : [])];
    const out = execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" });
    const files = out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((rel) => resolve(projectRoot, rel));
    return { files };
  } catch {
    return { files: null };
  }
}

// `git diff [base] -- <absPath>` for one file — the before/after of a change the
// agent reads to reconcile a doc. `base` is agent-controlled: reject a leading
// `-` (argv injection) before invoking git, exactly like gitChangedFiles. Here
// the `--` end-of-options marker is correct because absPath IS a pathspec (base,
// if present, is a revision and precedes it). Any failure degrades to "".
export function gitDiffFile(projectRoot: string, absPath: string, base?: string): string {
  if (base !== undefined && base.startsWith("-")) return "";
  try {
    const args = ["diff", ...(base ? [base] : []), "--", absPath];
    return execFileSync("git", args, { cwd: projectRoot, encoding: "utf8" });
  } catch {
    return "";
  }
}

// The commit a branch diverged from — the natural "start of this work" boundary,
// so a 10-step feature syncs its docs once against everything it changed. null
// when unresolvable (no remote, shallow clone): callers fall back to HEAD.
export function mergeBase(projectRoot: string, ref = "origin/main"): string | null {
  try {
    const out = execFileSync("git", ["merge-base", ref, "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    });
    return out.trim() || null;
  } catch {
    return null;
  }
}
