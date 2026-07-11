import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect as playwrightExpect } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { matchFiles, partitionByExtension } from "@gobrand/openstory-node";
import { resolveNextCacheRoot } from "./cache.js";
import { generateShadowApp } from "./shadow-app.js";
import { startNextPreview, type NextPreviewServer } from "./server.js";
import { watchManifestMembership, type ManifestWatcher } from "./watcher.js";

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__", "next-app");
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = join(packageRoot, "..", "..");
let server: NextPreviewServer;
let cacheRoot: string;
let baseUrl: string;
let watcher: ManifestWatcher;

async function regenerateFixture() {
  const { storyFiles } = partitionByExtension(
    matchFiles(fixtureRoot, ["src/*.stories.{ts,tsx,md}"]),
  );
  await generateShadowApp({
    projectRoot: fixtureRoot,
    workspaceRoot,
    cacheRoot,
    configPath: join(fixtureRoot, "openstory.config.ts"),
    storyFiles,
    stylePaths: [join(fixtureRoot, "app/globals.css")],
    consumerNextConfigPath: join(fixtureRoot, "next.config.ts"),
    consumerPostcssConfigPath: join(fixtureRoot, "postcss.config.mjs"),
    consumerTsconfigPath: join(fixtureRoot, "tsconfig.json"),
  });
}

async function manifest(): Promise<{ components: Array<{ id: string }> } | null> {
  const response = await fetch(`${baseUrl}/__pl__/manifest.json`);
  if (!response.ok) return null;
  return response.json() as Promise<{ components: Array<{ id: string }> }>;
}

async function waitForComponent(id: string, present: boolean): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const current = await manifest();
    if (current) {
      const found = current.components.some((component) => component.id === id);
      if (found === present) return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${id} present=${present}`);
}

async function waitForRegistryImport(filename: string, present: boolean): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const registry = await readFile(join(cacheRoot, "generated/registry.client.tsx"), "utf8");
    if (registry.includes(filename) === present) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for registry import ${filename} present=${present}`);
}

describe("Next 16 Turbopack integration", { timeout: 120_000 }, () => {
  beforeAll(async () => {
    const dependencies = [
      "next",
      "react",
      "react-dom",
      "tailwindcss",
      "@tailwindcss/postcss",
      "@gobrand/openstory-config",
      "@gobrand/openstory-node",
      "@gobrand/openstory-runtime",
    ];
    await rm(join(fixtureRoot, "node_modules"), { recursive: true, force: true });
    for (const dependency of dependencies) {
      const target = join(fixtureRoot, "node_modules", dependency);
      await mkdir(dirname(target), { recursive: true });
      await symlink(join(packageRoot, "node_modules", dependency), target, "junction");
    }
    cacheRoot = await resolveNextCacheRoot(fixtureRoot);
    await rm(cacheRoot, { recursive: true, force: true });
    await regenerateFixture();
    watcher = watchManifestMembership({
      projectRoot: fixtureRoot,
      getPatterns: () => ["src/*.stories.{ts,tsx,md}"],
      getConfigPath: () => join(fixtureRoot, "openstory.config.ts"),
      onRegenerate: regenerateFixture,
    });
    server = await startNextPreview({ projectRoot: fixtureRoot, cacheRoot });
    baseUrl = `http://127.0.0.1:${server.port}`;
  }, 120_000);

  afterAll(async () => {
    await watcher?.close();
    await server?.close();
  }, 120_000);

  it("serves the harness and manifest through real Next and Turbopack", async () => {
    const harness = await fetch(`${baseUrl}/__pl__/`);
    expect(harness.status).toBe(200);
    expect(await harness.text()).toContain("OpenStory");

    const manifestResponse = await fetch(`${baseUrl}/__pl__/manifest.json`);
    expect(manifestResponse.status).toBe(200);
    await expect(manifestResponse.json()).resolves.toMatchObject({
      schemaVersion: 1,
      components: [{ id: "fixture-card", stories: [{ id: "primary" }] }],
      docs: [{ id: "next-integration", embeds: ["fixture-card--primary"] }],
    });
  });

  it("renders Next client APIs, aliases, provider, CSS, and the URL contract", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/__pl__/?component=fixture-card&story=primary&viewport=desktop`);
      await playwrightExpect(page.getByText("Rendered by Turbopack")).toBeVisible();
      await playwrightExpect(page.getByTestId("fixture-provider")).toBeVisible();
      await playwrightExpect(page.getByRole("img", { name: "OpenStory mark" })).toBeVisible();
      await playwrightExpect(page.getByRole("link", { name: "Preview link" })).toBeVisible();
      await playwrightExpect(page.getByTestId("pathname")).toHaveText("/__pl__");
      await playwrightExpect(page.getByTestId("fixture-card")).toHaveCSS("border-top-width", "3px");
    } finally {
      await browser.close();
    }
  });

  it("exposes the same component contract over MCP", async () => {
    const response = await fetch(`${baseUrl}/__pl__/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("list_components");

    const componentsResponse = await fetch(`${baseUrl}/__pl__/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "list_components", arguments: {} },
      }),
    });
    expect(await componentsResponse.text()).toContain("fixture-card");
  });

  it("regenerates the live registry when a story is added and removed", async () => {
    const addedStory = join(fixtureRoot, "src/added.stories.tsx");
    await writeFile(
      addedStory,
      `import { defineStories } from "@gobrand/openstory-config";
import { FixtureCard } from "@fixture/card";
export default defineStories({ id: "added-card", component: FixtureCard, stories: { Added: { label: "Added" } } });
`,
    );
    try {
      await waitForRegistryImport("added.stories.tsx", true);
      await waitForComponent("added-card", true);
    } finally {
      await rm(addedStory, { force: true });
      await waitForRegistryImport("added.stories.tsx", false);
    }
    await waitForComponent("added-card", false);
  });

  it("uses Turbopack HMR for edits to an existing story", async () => {
    const storyPath = join(fixtureRoot, "src/fixture-card.stories.tsx");
    const original = await readFile(storyPath, "utf8");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(`${baseUrl}/__pl__/?component=fixture-card&story=primary&viewport=desktop`);
      await playwrightExpect(page.getByText("Rendered by Turbopack")).toBeVisible();
      await writeFile(storyPath, original.replace("Rendered by Turbopack", "Updated by HMR"));
      await playwrightExpect(page.getByText("Updated by HMR")).toBeVisible({ timeout: 15_000 });
    } finally {
      await writeFile(storyPath, original);
      await browser.close();
    }
  });

  it("rejects server-only stories with the v1 client boundary", async () => {
    await expect(
      generateShadowApp({
        projectRoot: fixtureRoot,
        workspaceRoot,
        cacheRoot: join(fixtureRoot, ".openstory", "negative"),
        storyFiles: [join(fixtureRoot, "negative/server-only.stories.tsx")],
      }),
    ).rejects.toThrow(/client-compatible stories/i);
  });
});
