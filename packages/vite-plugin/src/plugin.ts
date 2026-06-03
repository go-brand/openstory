import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { buildHarnessEntry, buildHtmlShell } from "./harness-loader.js";
import { deriveControls, resolvePresets, resolveRender } from "@gobrand/openstory-config";
import type { OpenStoryConfig } from "@gobrand/openstory-config";

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
    previews: config.previews.map((p) => {
      const render = resolveRender(p, presets);
      return {
        id: p.id,
        group: p.group ?? "",
        background: render.background,
        variants: p.fixtures.map((f) => ({
          id: f.id,
          label: f.label,
          props: f.props,
        })),
        controls: deriveControls(p.fixtures),
        // Project-root-relative `sourcePath` resolved to an absolute path so the
        // desktop app can fs-read it for the Code panel. null when unset.
        sourcePath: p.sourcePath && projectRoot ? resolve(projectRoot, p.sourcePath) : null,
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
      // previews render styled even when the project declares no `styles`.
      return detectStyles(projectRoot);
    } catch {
      return [];
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
      if (!resolvedConfigPath) {
        return [
          "console.error('[@gobrand/openstory-vite] no openstory.config.ts found')",
          "const msg = document.createElement('pre')",
          "msg.style.padding = '16px'",
          "msg.style.color = '#a00'",
          "msg.textContent = 'OpenStory: openstory.config.ts not found in project root.'",
          "document.body.appendChild(msg)",
        ].join("\n");
      }
      return buildHarnessEntry(resolvedConfigPath, await resolveStyles());
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
          if (!resolvedConfigPath) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: "no config" }));
            return;
          }
          try {
            const mod = await server.ssrLoadModule(resolvedConfigPath);
            const config = (mod.default ?? mod) as OpenStoryConfig;
            const manifest = buildManifest(config, projectRoot);
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
