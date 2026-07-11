import type { Plugin, PluginOption, UserConfig } from "vite";

export type OpenStoryCompatibilityOptions = {
  disable?: string[];
  keep?: string[];
};

const TANSTACK_START_MARKER = "tanstack-react-start:config";
const CLOUDFLARE_MARKER = "vite-plugin-cloudflare";
const HARNESS_OPTIMIZE_DEPS = ["react", "react/jsx-runtime", "react-dom", "react-dom/client"];

function includeHarnessDependencies(include: string[] | undefined): string[] {
  return [...new Set([...(include ?? []), ...HARNESS_OPTIMIZE_DEPS])];
}

async function flattenPlugins(options: PluginOption[] | undefined): Promise<Plugin[]> {
  const plugins: Plugin[] = [];

  async function visit(option: PluginOption): Promise<void> {
    const resolved = await option;
    if (!resolved) return;
    if (Array.isArray(resolved)) {
      for (const child of resolved) await visit(child);
      return;
    }
    plugins.push(resolved);
  }

  for (const option of options ?? []) await visit(option);
  return plugins;
}

function belongsToTanStackStart(name: string): boolean {
  return (
    name.startsWith("tanstack-react-start:") ||
    name.startsWith("tanstack-start-core:") ||
    name.startsWith("tanstack-start:") ||
    name === "tanstack:router-generator" ||
    name.startsWith("tanstack-router:code-splitter:")
  );
}

function belongsToCloudflare(name: string): boolean {
  return name === CLOUDFLARE_MARKER || name.startsWith(`${CLOUDFLARE_MARKER}:`);
}

function neutralizePlugin(plugin: Plugin): void {
  for (const key of Object.keys(plugin) as Array<keyof Plugin>) {
    if (key === "name") continue;
    if (key === "config") {
      const hook = plugin.config;
      plugin.config =
        hook && typeof hook === "object" ? { ...hook, handler: () => undefined } : () => undefined;
      continue;
    }
    delete plugin[key];
  }
}

export async function applyOpenStoryCompatibility(
  config: UserConfig,
  options: OpenStoryCompatibilityOptions = {},
): Promise<string[]> {
  config.optimizeDeps ??= {};
  config.optimizeDeps.entries = [];
  config.optimizeDeps.include = includeHarnessDependencies(config.optimizeDeps.include);

  const clientOptimizeDeps = config.environments?.client?.optimizeDeps;
  if (clientOptimizeDeps) {
    clientOptimizeDeps.entries = [];
    clientOptimizeDeps.include = includeHarnessDependencies(clientOptimizeDeps.include);
  }

  const warmup = config.server?.warmup;
  if (warmup?.clientFiles) warmup.clientFiles = [];
  if (warmup?.ssrFiles) warmup.ssrFiles = [];

  const plugins = await flattenPlugins(config.plugins);
  const names = new Set(plugins.map((plugin) => plugin.name));
  const hasTanStackStart = names.has(TANSTACK_START_MARKER);
  const hasCloudflare = names.has(CLOUDFLARE_MARKER);
  const customDisable = new Set(options.disable ?? []);
  const keep = new Set(options.keep ?? []);
  const disabled: string[] = [];

  for (const plugin of plugins) {
    const shouldDisable =
      customDisable.has(plugin.name) ||
      (hasTanStackStart && belongsToTanStackStart(plugin.name)) ||
      (hasCloudflare && belongsToCloudflare(plugin.name));
    if (!shouldDisable || keep.has(plugin.name)) continue;
    neutralizePlugin(plugin);
    disabled.push(plugin.name);
  }

  return disabled;
}
