import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { findWorkspaceRoot, runNextCli } from "./cli.js";
import type { ProtocolReporter } from "./protocol.js";

async function writeResolvablePackage(root: string, name: string, version: string) {
  const packageRoot = join(root, "node_modules", name);
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({ name, version, type: "module", exports: { ".": "./index.js" } }),
  );
  await writeFile(join(packageRoot, "index.js"), "export {};");
}

describe("findWorkspaceRoot", () => {
  it("selects the containing pnpm workspace for Turbopack", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "openstory-next-workspace-"));
    const project = join(workspace, "apps/web");
    await mkdir(project, { recursive: true });
    await writeFile(join(workspace, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");

    await expect(findWorkspaceRoot(project)).resolves.toBe(workspace);
  });
});

describe("runNextCli", () => {
  it("generates the app, starts the server, reports ready once, and closes cleanly", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "openstory-next-cli-"));
    await writeFile(join(projectRoot, "package.json"), JSON.stringify({ private: true }));
    await mkdir(join(projectRoot, "app"));
    await writeResolvablePackage(projectRoot, "next", "16.2.10");
    await writeResolvablePackage(projectRoot, "@gobrand/openstory-next", "0.6.2");
    const reporter: ProtocolReporter = {
      ready: vi.fn(),
      manifestChanged: vi.fn(),
      error: vi.fn(),
    };
    const close = vi.fn(async () => {});
    const startServer = vi.fn(async () => ({ port: 4312, close }));

    const running = await runNextCli({ projectRoot, reporter, startServer });
    expect(running.port).toBe(4312);
    expect(reporter.ready).toHaveBeenCalledOnce();
    expect(reporter.ready).toHaveBeenCalledWith(4312);

    await running.close();
    await running.close();
    expect(close).toHaveBeenCalledOnce();
  });
});
