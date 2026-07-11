import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { generateShadowApp } from "./shadow-app.js";

describe("generateShadowApp", () => {
  it("generates an isolated App Router tree and delegates consumer configuration", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "openstory-next-shadow-"));
    const cacheRoot = join(projectRoot, "node_modules/.cache/openstory-next/test");
    const story = join(projectRoot, "src/button.stories.tsx");
    const config = join(projectRoot, "openstory.config.ts");
    const nextConfig = join(projectRoot, "next.config.ts");
    const postcssConfig = join(projectRoot, "postcss.config.mjs");
    const tsconfig = join(projectRoot, "tsconfig.json");
    const styles = join(projectRoot, "src/globals.css");
    await mkdir(join(projectRoot, "src"));
    await writeFile(story, "export default {};");
    await writeFile(config, "export default {};");
    await writeFile(nextConfig, "export default {};");
    await writeFile(postcssConfig, "export default { plugins: {} };");
    await writeFile(
      tsconfig,
      JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
    );
    await writeFile(styles, '@import "tailwindcss";');

    const generated = await generateShadowApp({
      projectRoot,
      workspaceRoot: projectRoot,
      cacheRoot,
      configPath: config,
      storyFiles: [story],
      stylePaths: [styles],
      consumerNextConfigPath: nextConfig,
      consumerPostcssConfigPath: postcssConfig,
      consumerTsconfigPath: tsconfig,
    });

    expect(generated.appDir).toBe(join(cacheRoot, "app"));
    expect(await readFile(join(cacheRoot, "app/%5F_pl__/page.tsx"), "utf8")).toContain(
      "<OpenStoryHarness />",
    );
    expect(
      await readFile(join(cacheRoot, "app/%5F_pl__/manifest.json/route.ts"), "utf8"),
    ).toContain("assembleLoadedManifest");
    expect(await readFile(join(cacheRoot, "app/layout.tsx"), "utf8")).toContain(
      JSON.stringify(relative(join(cacheRoot, "app"), styles)),
    );
    expect(await readFile(join(cacheRoot, "next.config.mjs"), "utf8")).toContain(
      JSON.stringify(nextConfig),
    );
    expect(await readFile(join(cacheRoot, "postcss.config.mjs"), "utf8")).toContain(
      JSON.stringify(relative(cacheRoot, postcssConfig)),
    );
    expect(JSON.parse(await readFile(join(cacheRoot, "tsconfig.json"), "utf8"))).toMatchObject({
      extends: relative(cacheRoot, tsconfig),
    });
  });

  it("detects a conventional Tailwind stylesheet when styles are not explicit", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "openstory-next-shadow-"));
    const cacheRoot = join(projectRoot, "node_modules/.cache/openstory-next/test");
    await mkdir(join(projectRoot, "app"));
    await writeFile(join(projectRoot, "app/globals.css"), '@import "tailwindcss";');

    await generateShadowApp({ projectRoot, cacheRoot, storyFiles: [] });
    const layout = await readFile(join(cacheRoot, "app/layout.tsx"), "utf8");
    expect(layout).toContain(
      JSON.stringify(relative(join(cacheRoot, "app"), join(projectRoot, "app/globals.css"))),
    );
  });

  it("writes a local PostCSS fallback and never writes into the consumer app directory", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "openstory-next-shadow-"));
    const cacheRoot = join(projectRoot, "node_modules/.cache/openstory-next/test");
    await mkdir(join(projectRoot, "app"));

    await generateShadowApp({ projectRoot, cacheRoot, storyFiles: [] });

    expect(await readFile(join(cacheRoot, "postcss.config.mjs"), "utf8")).toContain("plugins: {}");
    await expect(readFile(join(projectRoot, "app/%5F_pl__/page.tsx"), "utf8")).rejects.toThrow();
  });
});
