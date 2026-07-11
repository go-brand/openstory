import { describe, expect, it, vi } from "vitest";
import type { Plugin, UserConfig } from "vite";
import { applyOpenStoryCompatibility } from "./compatibility";

function namedPlugin(name: string, overrides: Partial<Plugin> = {}): Plugin {
  return { name, ...overrides };
}

describe("applyOpenStoryCompatibility", () => {
  it("disables the complete TanStack Start family when its marker is active", async () => {
    const plugins = [
      namedPlugin("tanstack-react-start:config", { config: vi.fn() }),
      namedPlugin("tanstack-start-core:dev-server", { configureServer: vi.fn() }),
      namedPlugin("tanstack-start:start-manifest-plugin", { transform: vi.fn() }),
      namedPlugin("tanstack:router-generator", { buildStart: vi.fn() }),
      namedPlugin("tanstack-router:code-splitter:compile-reference-file", {
        resolveId: vi.fn(),
      }),
      namedPlugin("@vitejs/plugin-react", { transform: vi.fn() }),
    ];
    const config: UserConfig = { plugins };

    const disabled = await applyOpenStoryCompatibility(config);

    expect(disabled).toEqual([
      "tanstack-react-start:config",
      "tanstack-start-core:dev-server",
      "tanstack-start:start-manifest-plugin",
      "tanstack:router-generator",
      "tanstack-router:code-splitter:compile-reference-file",
    ]);
    expect(plugins[0]?.config).toBeTypeOf("function");
    expect(plugins[1]?.configureServer).toBeUndefined();
    expect(plugins[2]?.transform).toBeUndefined();
    expect(plugins[3]?.buildStart).toBeUndefined();
    expect(plugins[4]?.resolveId).toBeUndefined();
    expect(plugins[5]?.transform).toBeTypeOf("function");
  });

  it("keeps standalone TanStack Router plugins active without a Start marker", async () => {
    const routerGenerator = vi.fn();
    const codeSplitter = vi.fn();
    const config: UserConfig = {
      plugins: [
        namedPlugin("tanstack:router-generator", { buildStart: routerGenerator }),
        namedPlugin("tanstack-router:code-splitter:compile-virtual-file", {
          transform: codeSplitter,
        }),
      ],
    };

    expect(await applyOpenStoryCompatibility(config)).toEqual([]);
    expect(config.plugins?.[0]).toHaveProperty("buildStart", routerGenerator);
    expect(config.plugins?.[1]).toHaveProperty("transform", codeSplitter);
  });

  it("disables the complete Cloudflare plugin family", async () => {
    const plugins = [
      namedPlugin("vite-plugin-cloudflare", { config: vi.fn() }),
      namedPlugin("vite-plugin-cloudflare:dev", { configureServer: vi.fn() }),
      namedPlugin("vite-plugin-cloudflare:virtual-modules", { resolveId: vi.fn() }),
      namedPlugin("unrelated-cloudflare-helper", { load: vi.fn() }),
    ];
    const config: UserConfig = { plugins };

    expect(await applyOpenStoryCompatibility(config)).toEqual([
      "vite-plugin-cloudflare",
      "vite-plugin-cloudflare:dev",
      "vite-plugin-cloudflare:virtual-modules",
    ]);
    expect(plugins[1]?.configureServer).toBeUndefined();
    expect(plugins[2]?.resolveId).toBeUndefined();
    expect(plugins[3]?.load).toBeTypeOf("function");
  });

  it("supports exact custom disable and keep names with keep taking precedence", async () => {
    const plugins = [
      namedPlugin("vite-plugin-cloudflare", { config: vi.fn() }),
      namedPlugin("vite-plugin-cloudflare:dev", { configureServer: vi.fn() }),
      namedPlugin("custom-pipeline-owner", { configureServer: vi.fn() }),
    ];
    const config: UserConfig = { plugins };

    expect(
      await applyOpenStoryCompatibility(config, {
        disable: ["custom-pipeline-owner", "vite-plugin-cloudflare:dev"],
        keep: ["vite-plugin-cloudflare:dev"],
      }),
    ).toEqual(["vite-plugin-cloudflare", "custom-pipeline-owner"]);
    expect(plugins[1]?.configureServer).toBeTypeOf("function");
    expect(plugins[2]?.configureServer).toBeUndefined();
  });

  it("replaces a captured object config hook with a callable no-op", async () => {
    const original = vi.fn(() => ({ appType: "custom" as const }));
    const plugin = namedPlugin("vite-plugin-cloudflare", {
      config: { order: "post", handler: original },
    });
    const capturedPlugin = plugin;

    await applyOpenStoryCompatibility({ plugins: [plugin] });

    const hook = capturedPlugin.config;
    expect(hook).toBeTypeOf("object");
    if (!hook || typeof hook !== "object") throw new Error("expected object hook");
    expect(hook.order).toBe("post");
    expect(await hook.handler.call({} as never, {}, {} as never)).toBeUndefined();
    expect(original).not.toHaveBeenCalled();
  });
});
