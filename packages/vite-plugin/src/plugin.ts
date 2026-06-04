import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { buildHarnessEntry, buildHtmlShell } from "./harness-loader.js";
import { deriveSection } from "./derive-section.js";
import {
  mergeControls,
  mergeComponents,
  resolvePresets,
  resolveRender,
  type ManifestControl,
} from "@gobrand/openstory-config";
import type { OpenStoryConfig } from "@gobrand/openstory-config";
import { extractPropTypes } from "./extract-prop-types.js";
import { discoverComponents, resolvePatterns } from "./discover.js";

const VIRTUAL_ID = "virtual:openstory-entry";
const RESOLVED_VIRTUAL_ID = "\0virtual:openstory-entry";
const ROUTE = "/__pl__";
const MANIFEST_ROUTE = "/__pl__/manifest.json";
const CONFIG_CANDIDATES = ["openstory.config.ts", "openstory.config.js"];

// Candidate CSS entry files (relative to projectRoot) probed when the consumer
// project doesn't declare `styles` explicitly. Order matters: first match wins
// among files that exist AND contain a Tailwind import/directive.
const STYLE_CANDIDATES = [
  "src/styles.css",
  "src/index.css",
  "src/app.css",
  "src/main.css",
  "src/global.css",
  "src/globals.css",
  "src/styles/globals.css",
  "src/styles/index.css",
  "src/styles/app.css",
  "src/styles/main.css",
  "app/globals.css",
  "app/styles.css",
  "styles/globals.css",
  "styles.css",
  "index.css",
  "app.css",
  "global.css",
  "globals.css",
];

// True when the CSS source pulls in Tailwind. Covers: v4 `@import "tailwindcss"`
// (either quote), v3 `@tailwind` directives, other v4 at-rules (`@theme`,
// `@source`, `@plugin`), and indirect imports via a shared config package whose
// specifier mentions tailwind (e.g. `@import '@acme/tailwind-config/style.css'`).
function hasTailwind(css: string): boolean {
  return (
    /@import\s+['"][^'"]*tailwind[^'"]*['"]/.test(css) ||
    /@tailwind\b/.test(css) ||
    /@(?:theme|source|plugin)\b/.test(css)
  );
}

// Auto-detect a Tailwind CSS entry when the consumer hasn't declared `styles`.
// Probes STYLE_CANDIDATES under projectRoot and returns the first existing file
// whose contents reference Tailwind, as an absolute path. Side-effect-safe:
// any fs error is swallowed and detection continues / returns nothing.
function detectStyles(projectRoot: string): string[] {
  for (const rel of STYLE_CANDIDATES) {
    const abs = resolve(projectRoot, rel);
    try {
      if (!existsSync(abs)) continue;
      const css = readFileSync(abs, "utf8");
      if (hasTailwind(css)) return [abs];
    } catch {
      // Unreadable candidate (perms, race) — skip and keep probing.
    }
  }
  return [];
}

type PluginOptions = {
  configFile?: string;
};

export function buildManifest(config: OpenStoryConfig, projectRoot?: string) {
  const presets = resolvePresets(config.presets);
  return {
    components: (config.components ?? []).map((p) => {
      const render = resolveRender(p, presets);
      const sourcePath = p.sourcePath && projectRoot ? resolve(projectRoot, p.sourcePath) : null;

      // Type-derived controls (authoritative). Falls back to {} on any miss so
      // mergeControls degrades gracefully to pure value inference.
      const typeInfo =
        sourcePath && projectRoot ? extractPropTypes(sourcePath, p.name ?? p.id, projectRoot) : {};
      const typeControls: Record<string, ManifestControl> = Object.fromEntries(
        Object.entries(typeInfo).map(([name, info]) => [name, { name, ...info }]),
      );

      return {
        id: p.id,
        name: p.name ?? p.id,
        group: p.group ?? "",
        section: deriveSection(sourcePath),
        background: render.background,
        layout: p.layout ?? "padded",
        stories: p.fixtures.map((f) => ({
          id: f.id,
          label: f.label,
          props: f.props,
        })),
        controls: mergeControls(p.fixtures, typeControls),
        sourcePath,
      };
    }),
  };
}

function findConfig(root: string): string | null {
  for (const name of CONFIG_CANDIDATES) {
    const candidate = resolve(root, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function openStory(options: PluginOptions = {}): Plugin {
  let resolvedConfigPath: string | null = null;
  let projectRoot = process.cwd();
  let devServer: ViteDevServer | null = null;

  // Resolve the consumer config's `styles` entries to absolute paths so the
  // harness entry can side-effect-import them (the Tailwind CSS must be in the
  // /__pl__ module graph). Bare specifiers (npm packages) are left untouched.
  async function resolveStyles(): Promise<string[]> {
    if (!resolvedConfigPath || !devServer) return [];
    try {
      const mod = await devServer.ssrLoadModule(resolvedConfigPath);
      const config = (mod.default ?? mod) as OpenStoryConfig;
      const styles = config.styles ?? [];
      // Explicit `styles` always wins: resolve relative/absolute paths against
      // the project root, leave bare specifiers (npm packages) untouched.
      if (styles.length > 0) {
        return styles.map((s) =>
          s.startsWith(".") || s.startsWith("/") ? resolve(projectRoot, s) : s,
        );
      }
      // Zero-config fallback: probe well-known Tailwind entry locations so
      // components render styled even when the project declares no `styles`.
      return detectStyles(projectRoot);
    } catch {
      return [];
    }
  }

  // Resolve the story-file glob patterns the harness entry's `import.meta.glob`
  // discovers. Mirrors the manifest route so the sidebar (Node) and the rendered
  // components (browser) can't disagree. Falls back to defaults with no config.
  async function resolveEntryPatterns(): Promise<string[]> {
    if (!resolvedConfigPath || !devServer) return resolvePatterns(null);
    try {
      const mod = await devServer.ssrLoadModule(resolvedConfigPath);
      return resolvePatterns((mod.default ?? mod) as OpenStoryConfig);
    } catch {
      return resolvePatterns(null);
    }
  }

  return {
    name: "@gobrand/openstory-vite",
    enforce: "pre",

    configResolved(config) {
      projectRoot = config.root;
      resolvedConfigPath = options.configFile
        ? resolve(projectRoot, options.configFile)
        : findConfig(projectRoot);
    },

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_VIRTUAL_ID;
      return null;
    },

    async load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null;
      // Config is optional: zero-config discovery via import.meta.glob is valid.
      return buildHarnessEntry(
        resolvedConfigPath,
        await resolveStyles(),
        await resolveEntryPatterns(),
      );
    },

    configureServer(server: ViteDevServer) {
      devServer = server;
      server.middlewares.use(ROUTE, async (req, res, next) => {
        if (!req.url) return next();
        const url = req.url.split("?")[0];
        if (url === "/" || url === "") {
          res.setHeader("content-type", "text/html; charset=utf-8");
          const html = await server.transformIndexHtml(ROUTE, buildHtmlShell());
          res.end(html);
          return;
        }
        if (url === "/manifest.json" || req.url === MANIFEST_ROUTE) {
          try {
            const config = resolvedConfigPath
              ? (((await server.ssrLoadModule(resolvedConfigPath)).default ??
                  {}) as OpenStoryConfig)
              : null;
            const patterns = resolvePatterns(config);
            const discovered = await discoverComponents(projectRoot, patterns, (p) =>
              server.ssrLoadModule(p),
            );
            const components = mergeComponents(discovered, config?.components ?? []);
            const manifest = buildManifest({ ...(config ?? {}), components }, projectRoot);
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(manifest));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: String(err) }));
          }
          return;
        }
        next();
      });
    },
  };
}
