import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { inspectWorkspaceSelection } from "./workspace-discovery";

const roots: string[] = [];

function folder(prefix = "openstory-discovery-") {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function configuredWorkspace(root: string, relativePath: string, name: string) {
  const path = join(root, relativePath);
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "package.json"), JSON.stringify({ name }));
  writeFileSync(join(path, "openstory.config.ts"), "export default { components: [] }");
  return path;
}

function gitRepository() {
  const root = folder();
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("inspectWorkspaceSelection", () => {
  it("discovers configured pnpm workspaces in relative-path order", async () => {
    const root = gitRepository();
    writeFileSync(join(root, "pnpm-workspace.yaml"), 'packages:\n  - "apps/*"\n  - "packages/*"\n');
    configuredWorkspace(root, "apps/app", "app");
    configuredWorkspace(root, "apps/admin", "admin");
    configuredWorkspace(root, "packages/ui", "ui");
    rmSync(join(root, "packages/ui/openstory.config.ts"));
    configuredWorkspace(root, "node_modules/ignored", "ignored");

    const result = await inspectWorkspaceSelection(root);

    expect(result.candidates.map((candidate) => candidate.identity.workspace.relativePath)).toEqual(
      ["apps/admin", "apps/app"],
    );
  });

  it.each([{ workspaces: ["apps/*"] }, { workspaces: { packages: ["apps/*"] } }])(
    "supports package.json workspace form %#",
    async (manifest) => {
      const root = gitRepository();
      writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
      configuredWorkspace(root, "apps/web", "web");

      const result = await inspectWorkspaceSelection(root);

      expect(result.candidates[0]?.identity.workspace.relativePath).toBe("apps/web");
    },
  );

  it("returns an exact configured workspace without scanning siblings", async () => {
    const root = gitRepository();
    const app = configuredWorkspace(root, "apps/app", "app");
    configuredWorkspace(root, "apps/admin", "admin");

    const result = await inspectWorkspaceSelection(app);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.identity.workspace.relativePath).toBe("apps/app");
  });

  it("falls back to the selected folder for zero-config projects", async () => {
    const root = folder("openstory-zero-config-");

    const result = await inspectWorkspaceSelection(root);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.path).toBe(result.candidates[0]?.identity.workspace.rootPath);
  });

  it("uses the selected root as the shared repository outside Git", async () => {
    const root = folder("openstory-non-git-monorepo-");
    writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: ["apps/*"] }));
    configuredWorkspace(root, "apps/app", "app");
    configuredWorkspace(root, "apps/admin", "admin");

    const result = await inspectWorkspaceSelection(root);

    expect(result.candidates.map((candidate) => candidate.identity.repository.rootPath)).toEqual([
      result.repository.rootPath,
      result.repository.rootPath,
    ]);
    expect(result.candidates.map((candidate) => candidate.identity.workspace.relativePath)).toEqual(
      ["apps/admin", "apps/app"],
    );
  });

  it("rejects out-of-root matches and deduplicates canonical paths", async () => {
    const parent = folder();
    const root = join(parent, "repo");
    mkdirSync(root);
    execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
    const app = configuredWorkspace(root, "apps/app", "app");
    configuredWorkspace(parent, "outside/secret", "secret");
    mkdirSync(join(root, "aliases"));
    symlinkSync(app, join(root, "aliases", "app"));
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ workspaces: ["apps/*", "aliases/*", "../outside/*"] }),
    );

    const result = await inspectWorkspaceSelection(root);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.identity.workspace.relativePath).toBe("apps/app");
  });

  it("ignores Mercurial and Subversion metadata folders", async () => {
    const root = gitRepository();
    writeFileSync(join(root, "package.json"), JSON.stringify({ workspaces: [".hg/*", ".svn/*"] }));
    configuredWorkspace(root, ".hg/hidden", "hidden-hg");
    configuredWorkspace(root, ".svn/hidden", "hidden-svn");

    const result = await inspectWorkspaceSelection(root);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.path).toBe(result.repository.rootPath);
  });
});
