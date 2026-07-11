import { mkdtemp, mkdir, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { detectPreviewAdapter } from "./preview-adapter.js";

async function project() {
  const root = await mkdtemp(join(tmpdir(), "openstory-adapter-"));
  await writeFile(join(root, "package.json"), JSON.stringify({ private: true }));
  return root;
}

async function installPackage(
  root: string,
  name: string,
  version: string,
  bin?: string,
  importOnly = false,
) {
  const packageRoot = join(root, "node_modules", name);
  await mkdir(packageRoot, { recursive: true });
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({
      name,
      version,
      type: "module",
      exports: { ".": importOnly ? { import: "./index.js" } : "./index.js" },
      ...(bin ? { bin: { "openstory-next": bin } } : {}),
    }),
  );
  await writeFile(join(packageRoot, "index.js"), "export {};");
  if (bin) {
    await mkdir(join(packageRoot, bin, ".."), { recursive: true });
    await writeFile(join(packageRoot, bin), "#!/usr/bin/env node\n");
  }
}

describe("detectPreviewAdapter", () => {
  it("detects a valid Next 16 App Router project", async () => {
    const root = await project();
    await mkdir(join(root, "src/app"), { recursive: true });
    await installPackage(root, "next", "16.2.10");
    await installPackage(root, "@gobrand/openstory-next", "0.6.2", "dist/cli.js");

    await expect(detectPreviewAdapter(root)).resolves.toMatchObject({
      ok: true,
      adapter: "next",
      executable: join(await realpath(root), "node_modules/@gobrand/openstory-next/dist/cli.js"),
    });
  });

  it("detects a valid Vite project", async () => {
    const root = await project();
    await writeFile(join(root, "vite.config.ts"), "export default {};");
    await installPackage(root, "vite", "8.1.0");
    await installPackage(root, "@gobrand/openstory-vite", "0.6.2");

    await expect(detectPreviewAdapter(root)).resolves.toEqual({ ok: true, adapter: "vite" });
  });

  it("detects an installed ESM adapter with an import-only package export", async () => {
    const root = await project();
    await writeFile(join(root, "vite.config.ts"), "export default {};");
    await installPackage(root, "vite", "8.1.0");
    await installPackage(root, "@gobrand/openstory-vite", "0.6.4", undefined, true);

    await expect(detectPreviewAdapter(root)).resolves.toEqual({ ok: true, adapter: "vite" });
  });

  it("reports a missing Next adapter", async () => {
    const root = await project();
    await mkdir(join(root, "app"));
    await installPackage(root, "next", "16.2.10");

    await expect(detectPreviewAdapter(root)).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("@gobrand/openstory-next"),
    });
  });

  it("reports unsupported Next versions", async () => {
    const root = await project();
    await mkdir(join(root, "app"));
    await installPackage(root, "next", "15.5.0");
    await installPackage(root, "@gobrand/openstory-next", "0.6.2", "dist/cli.js");

    await expect(detectPreviewAdapter(root)).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("Next.js 15.5.0"),
    });
  });

  it("rejects an ambiguous project with both valid adapters", async () => {
    const root = await project();
    await mkdir(join(root, "app"));
    await writeFile(join(root, "vite.config.ts"), "export default {};");
    await installPackage(root, "next", "16.2.10");
    await installPackage(root, "@gobrand/openstory-next", "0.6.2", "dist/cli.js");
    await installPackage(root, "vite", "8.1.0");
    await installPackage(root, "@gobrand/openstory-vite", "0.6.2");

    await expect(detectPreviewAdapter(root)).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining("both"),
    });
  });

  it("reports when no supported adapter is configured", async () => {
    const root = await project();
    await expect(detectPreviewAdapter(root)).resolves.toMatchObject({ ok: false });
  });

  it("resolves monorepo-hoisted dependencies from a nested app", async () => {
    const workspace = await project();
    const root = join(workspace, "apps/web");
    await mkdir(join(root, "app"), { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({ private: true }));
    await installPackage(workspace, "next", "16.2.10");
    await installPackage(workspace, "@gobrand/openstory-next", "0.6.2", "dist/cli.js");

    await expect(detectPreviewAdapter(root)).resolves.toMatchObject({
      ok: true,
      adapter: "next",
    });
  });
});
