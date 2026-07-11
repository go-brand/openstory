import { mkdtemp, mkdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inspectNextProject, type PackageResolver } from "./project.js";

async function fixture(options: { app?: "app" | "src/app"; nextVersion?: string } = {}) {
  const root = await mkdtemp(join(tmpdir(), "openstory-next-project-"));
  await writeFile(join(root, "package.json"), JSON.stringify({ private: true }));
  if (options.app) await mkdir(join(root, options.app), { recursive: true });
  const packages = new Map([
    [
      "next",
      {
        path: join(root, "node_modules/next/package.json"),
        version: options.nextVersion ?? "16.2.10",
      },
    ],
    [
      "@gobrand/openstory-next",
      { path: join(root, "node_modules/@gobrand/openstory-next/package.json"), version: "0.6.2" },
    ],
  ]);
  const resolvePackage: PackageResolver = async (name) => packages.get(name) ?? null;
  return { root, packages, resolvePackage };
}

describe("inspectNextProject", () => {
  it.each(["app", "src/app"] as const)("accepts the %s App Router directory", async (app) => {
    const project = await fixture({ app });
    const inspection = await inspectNextProject(project.root, {
      resolvePackage: project.resolvePackage,
    });

    expect(inspection.appDir).toBe(join(await realpath(project.root), app));
    expect(inspection.nextVersion).toBe("16.2.10");
  });

  it("rejects Next versions before 16", async () => {
    const project = await fixture({ app: "app", nextVersion: "15.5.0" });
    await expect(
      inspectNextProject(project.root, { resolvePackage: project.resolvePackage }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_NEXT_VERSION" });
  });

  it("rejects projects without an App Router directory", async () => {
    const project = await fixture();
    await expect(
      inspectNextProject(project.root, { resolvePackage: project.resolvePackage }),
    ).rejects.toMatchObject({ code: "MISSING_APP_ROUTER" });
  });

  it("reports a missing adapter dependency", async () => {
    const project = await fixture({ app: "app" });
    project.packages.delete("@gobrand/openstory-next");
    await expect(
      inspectNextProject(project.root, { resolvePackage: project.resolvePackage }),
    ).rejects.toMatchObject({ code: "MISSING_ADAPTER" });
  });

  it("resolves installed packages whose exports hide package.json", async () => {
    const root = await mkdtemp(join(tmpdir(), "openstory-next-project-"));
    await writeFile(join(root, "package.json"), JSON.stringify({ private: true }));
    await mkdir(join(root, "app"));
    for (const [name, version] of [
      ["next", "16.2.10"],
      ["@gobrand/openstory-next", "0.6.2"],
    ]) {
      const packageRoot = join(root, "node_modules", name);
      await mkdir(packageRoot, { recursive: true });
      await writeFile(
        join(packageRoot, "package.json"),
        JSON.stringify({ name, version, type: "module", exports: { ".": "./index.js" } }),
      );
      await writeFile(join(packageRoot, "index.js"), "export {};");
    }

    await expect(inspectNextProject(root)).resolves.toMatchObject({ nextVersion: "16.2.10" });
  });

  it("does not accept a file named app as an App Router directory", async () => {
    const project = await fixture();
    await writeFile(join(project.root, "app"), "not a directory");
    await expect(
      inspectNextProject(project.root, { resolvePackage: project.resolvePackage }),
    ).rejects.toMatchObject({ code: "MISSING_APP_ROUTER" });
  });
});
