import { describe, expect, it, vi } from "vitest";
import { resolveConfig, type Plugin, type UserConfig } from "vite";
import { applyOpenStoryCompatibility } from "./compatibility";
import { openStory } from "./plugin";

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

  it("clears application scan entries and warmup files without changing related config", async () => {
    const include = ["react", "react-dom"];
    const exclude = ["sqlite"];
    const alias = { "@": "/project/src" };
    const config: UserConfig = {
      optimizeDeps: {
        entries: ["src/**/*.{ts,tsx}"],
        include,
        exclude,
      },
      environments: {
        client: {
          optimizeDeps: {
            entries: ["src/routes/**/*.tsx"],
            include: ["react/jsx-runtime"],
          },
        },
      },
      resolve: { alias },
      server: {
        host: "127.0.0.1",
        warmup: {
          clientFiles: ["src/routes/**/*.tsx"],
          ssrFiles: ["src/server.ts"],
        },
      },
    };

    await applyOpenStoryCompatibility(config);

    expect(config.optimizeDeps).toEqual({ entries: [], include, exclude });
    expect(config.environments?.client?.optimizeDeps).toEqual({
      entries: [],
      include: ["react/jsx-runtime"],
    });
    expect(config.server).toMatchObject({
      host: "127.0.0.1",
      warmup: { clientFiles: [], ssrFiles: [] },
    });
    expect(config.resolve?.alias).toBe(alias);
  });

  it("suppresses adapter config hooks during real Vite resolution only in openstory mode", async () => {
    const openStoryAdapterHook = vi.fn(() => {
      throw new Error("adapter config hook should be suppressed");
    });
    const unrelatedHook = vi.fn();
    const openstory = await resolveConfig(
      {
        configFile: false,
        mode: "openstory",
        optimizeDeps: { entries: ["src/**/*.ts"] },
        plugins: [
          openStory(),
          namedPlugin("tanstack-react-start:config", {
            enforce: "pre",
            config: openStoryAdapterHook,
          }),
          namedPlugin("tanstack-start-core:config", {
            enforce: "pre",
            config: openStoryAdapterHook,
          }),
          namedPlugin("vite-plugin-cloudflare", { config: openStoryAdapterHook }),
          namedPlugin("vite-plugin-cloudflare:config", { config: openStoryAdapterHook }),
          namedPlugin("unrelated", { config: unrelatedHook }),
        ],
      },
      "serve",
    );

    expect(openStoryAdapterHook).not.toHaveBeenCalled();
    expect(unrelatedHook).toHaveBeenCalledOnce();
    expect(openstory.optimizeDeps.entries).toEqual([]);

    const normalAdapterHook = vi.fn();
    const normal = await resolveConfig(
      {
        configFile: false,
        mode: "development",
        optimizeDeps: { entries: ["src/**/*.ts"] },
        plugins: [
          openStory(),
          namedPlugin("vite-plugin-cloudflare", { config: normalAdapterHook }),
        ],
      },
      "serve",
    );

    expect(normalAdapterHook).toHaveBeenCalledOnce();
    expect(normal.optimizeDeps.entries).toEqual(["src/**/*.ts"]);
  });
});
