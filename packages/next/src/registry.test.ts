import { mkdtemp, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateRegistries, toModuleSpecifier } from "./registry.js";

describe("generateRegistries", () => {
  it("writes deterministic, deduplicated client and server registries", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "openstory-next-registry-"));
    const cacheRoot = join(projectRoot, "node_modules/.cache/openstory-next/test");
    const configPath = join(projectRoot, "openstory.config.ts");
    const alpha = join(projectRoot, "src/alpha.stories.tsx");
    const zeta = join(projectRoot, "src/zeta.stories.tsx");
    await mkdir(join(projectRoot, "src"));
    await writeFile(configPath, "export default { components: [] };");
    await writeFile(alpha, "export default {};");
    await writeFile(zeta, "export default {};");

    const result = await generateRegistries({
      projectRoot,
      cacheRoot,
      configPath,
      storyFiles: [zeta, alpha, zeta],
    });
    const client = await readFile(result.clientPath, "utf8");
    const server = await readFile(result.serverPath, "utf8");

    expect(client.startsWith('"use client";')).toBe(true);
    expect(server).not.toContain('"use client"');
    expect(client.indexOf("alpha.stories.tsx")).toBeLessThan(client.indexOf("zeta.stories.tsx"));
    expect(client.match(/^import .*zeta\.stories\.tsx.*;$/gm)).toHaveLength(1);
    expect(client).toContain("<OpenStoryPreview config={config} />");
    expect(server).toContain("export const loadedProject");
    expect(server).toContain(
      `sourcePath: story0.default.sourcePath ?? ${JSON.stringify(await realpath(alpha))}`,
    );
    expect(server).not.toContain("Object.values");
  });

  it("normalizes and safely quotes Windows module specifiers", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "openstory-next-registry-"));
    const cacheRoot = join(projectRoot, "node_modules/.cache/openstory-next/test");
    const story = join(projectRoot, "button.stories.tsx");
    await writeFile(story, "export default {};");

    const result = await generateRegistries({ projectRoot, cacheRoot, storyFiles: [story] });
    const client = await readFile(result.clientPath, "utf8");
    expect(client).not.toContain("\\\\");
    expect(client).toContain(JSON.stringify((await realpath(story)).replaceAll("\\", "/")));
    expect(toModuleSpecifier("C:\\repo\\src\\button.stories.tsx")).toBe(
      "C:/repo/src/button.stories.tsx",
    );
  });

  it("types the optional config so the zero-config registry can access components", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "openstory-next-registry-"));
    const cacheRoot = join(projectRoot, "node_modules/.cache/openstory-next/test");

    const result = await generateRegistries({ projectRoot, cacheRoot, storyFiles: [] });
    const client = await readFile(result.clientPath, "utf8");

    expect(client).toContain('import type { OpenStoryConfig } from "@gobrand/openstory-config";');
    expect(client).toContain("const userConfig: OpenStoryConfig = {};");
  });

  it("does not rewrite unchanged registries", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "openstory-next-registry-"));
    const cacheRoot = join(projectRoot, "node_modules/.cache/openstory-next/test");
    const story = join(projectRoot, "button.stories.tsx");
    await writeFile(story, "export default {};");
    const input = { projectRoot, cacheRoot, storyFiles: [story] };

    expect((await generateRegistries(input)).changed).toBe(true);
    expect((await generateRegistries(input)).changed).toBe(false);
  });
});
