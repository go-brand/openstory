import { describe, expect, it } from "vitest";
import { buildNextConfigSource, resolveShadowNextConfig } from "./next-config.js";

const adapter = { workspaceRoot: "/repo", distDir: ".next-openstory" };

describe("resolveShadowNextConfig", () => {
  it.each([
    ["absent", undefined],
    ["object", { images: { domains: ["cdn.example.com"] } }],
    ["promise", Promise.resolve({ transpilePackages: ["@acme/ui"] })],
    ["function", () => ({ turbopack: { resolveAlias: { "@ui": "/repo/ui" } } })],
    ["async function", async () => ({ experimental: { typedRoutes: true } })],
  ])("merges adapter-owned settings into a %s config", async (_name, consumerConfig) => {
    const result = await resolveShadowNextConfig(
      consumerConfig,
      "phase-development-server",
      { defaultConfig: {} },
      adapter,
    );

    expect(result.distDir).toBe(".next-openstory");
    expect(result.turbopack).toMatchObject({ root: "/repo" });
  });

  it("preserves consumer images and Turbopack aliases", async () => {
    const result = await resolveShadowNextConfig(
      {
        images: { remotePatterns: [{ hostname: "images.example.com" }] },
        turbopack: { resolveAlias: { "@ui": "/repo/ui" } },
      },
      "phase-development-server",
      { defaultConfig: {} },
      adapter,
    );

    expect(result.images).toEqual({ remotePatterns: [{ hostname: "images.example.com" }] });
    expect(result.turbopack).toEqual({ resolveAlias: { "@ui": "/repo/ui" }, root: "/repo" });
  });
});

describe("buildNextConfigSource", () => {
  it("generates an import for TypeScript consumer configs", () => {
    const source = buildNextConfigSource({
      consumerConfigPath: "C:\\repo\\next.config.ts",
      workspaceRoot: "C:\\repo",
      distDir: ".next-openstory",
    });

    expect(source).toContain('import consumerConfig from "C:/repo/next.config.ts";');
    expect(source).toContain("resolveShadowNextConfig");
  });

  it("uses an empty object when the consumer has no Next config", () => {
    expect(
      buildNextConfigSource({
        consumerConfigPath: null,
        workspaceRoot: "/repo",
        distDir: ".next-openstory",
      }),
    ).toContain("const consumerConfig = {};");
  });
});
