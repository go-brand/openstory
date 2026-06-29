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
