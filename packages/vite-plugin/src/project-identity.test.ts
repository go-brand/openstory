import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeGitRemote, resolveProjectIdentity } from "./project-identity";

const roots: string[] = [];

function repository() {
  const root = mkdtempSync(join(tmpdir(), "openstory-identity-"));
  roots.push(root);
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["remote", "add", "origin", "https://github.com/go-brand/gb-monorepo.git"], {
    cwd: root,
  });
  const workspace = join(root, "apps", "app");
  mkdirSync(workspace, { recursive: true });
  writeFileSync(join(workspace, "package.json"), JSON.stringify({ name: "@acme/app" }));
  return { root, workspace };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("normalizeGitRemote", () => {
  it.each([
    ["https://github.com/go-brand/gb-monorepo.git", "go-brand/gb-monorepo"],
    ["git@github.com:go-brand/gb-monorepo.git", "go-brand/gb-monorepo"],
    ["ssh://git@github.com/go-brand/gb-monorepo.git", "go-brand/gb-monorepo"],
    ["/Users/me/repos/gb-monorepo.git", "repos/gb-monorepo"],
    ["../go-brand/gb-monorepo.git", "go-brand/gb-monorepo"],
    ["file:///Users/me/repos/gb-monorepo.git", "repos/gb-monorepo"],
  ])("normalizes %s", (remote, expected) => {
    expect(normalizeGitRemote(remote)).toBe(expected);
  });

  it("returns null for blank or pathless remotes", () => {
    expect(normalizeGitRemote("  ")).toBeNull();
    expect(normalizeGitRemote("github.com")).toBeNull();
  });
});

describe("resolveProjectIdentity", () => {
  it("derives repository and workspace context", () => {
    const { root, workspace } = repository();
    const canonicalRoot = realpathSync.native(root);
    const canonicalWorkspace = realpathSync.native(workspace);

    expect(resolveProjectIdentity(workspace)).toEqual({
      repository: {
        label: "gb-monorepo",
        slug: "go-brand/gb-monorepo",
        rootPath: canonicalRoot,
      },
      workspace: {
        label: "app",
        relativePath: "apps/app",
        rootPath: canonicalWorkspace,
      },
      source: "automatic",
    });
  });

  it("applies trimmed config labels without changing paths", () => {
    const { root, workspace } = repository();
    const canonicalRoot = realpathSync.native(root);
    const canonicalWorkspace = realpathSync.native(workspace);

    expect(
      resolveProjectIdentity(workspace, { repository: " GoBrand ", workspace: " Web App " }),
    ).toEqual({
      repository: {
        label: "GoBrand",
        slug: "go-brand/gb-monorepo",
        rootPath: canonicalRoot,
      },
      workspace: {
        label: "Web App",
        relativePath: "apps/app",
        rootPath: canonicalWorkspace,
      },
      source: "config",
    });
  });

  it("falls back to filesystem names outside Git", () => {
    const root = mkdtempSync(join(tmpdir(), "openstory-standalone-"));
    roots.push(root);

    const identity = resolveProjectIdentity(root);
    const canonicalRoot = realpathSync.native(root);

    expect(identity.repository.label).toBe(root.split("/").at(-1));
    expect(identity.repository.slug).toBeNull();
    expect(identity.workspace.relativePath).toBe(".");
    expect(identity.workspace.rootPath).toBe(canonicalRoot);
  });

  it("ignores malformed runtime config labels", () => {
    const { workspace } = repository();

    expect(() =>
      resolveProjectIdentity(workspace, {
        repository: 42 as unknown as string,
        workspace: null as unknown as string,
      }),
    ).not.toThrow();
    expect(resolveProjectIdentity(workspace, { repository: 42 as unknown as string }).source).toBe(
      "automatic",
    );
  });
});
