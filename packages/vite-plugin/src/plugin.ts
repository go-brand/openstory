import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin, ViteDevServer } from 'vite';
import { buildHarnessEntry, buildHtmlShell } from './harness-loader.js';

const VIRTUAL_ID = 'virtual:openstory-entry';
const RESOLVED_VIRTUAL_ID = '\0virtual:openstory-entry';
const ROUTE = '/__pl__';
const MANIFEST_ROUTE = '/__pl__/manifest.json';
const CONFIG_CANDIDATES = ['openstory.config.ts', 'openstory.config.js'];

type PluginOptions = {
  configFile?: string;
};

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

  return {
    name: '@gobrand/openstory-vite',
    enforce: 'pre',

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

    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return null;
      if (!resolvedConfigPath) {
        return [
          "console.error('[@gobrand/openstory-vite] no openstory.config.ts found')",
          "const msg = document.createElement('pre')",
          "msg.style.padding = '16px'",
          "msg.style.color = '#a00'",
          "msg.textContent = 'OpenStory: openstory.config.ts not found in project root.'",
          'document.body.appendChild(msg)',
        ].join('\n');
      }
      return buildHarnessEntry(resolvedConfigPath);
    },

    configureServer(server: ViteDevServer) {
      server.middlewares.use(ROUTE, async (req, res, next) => {
        if (!req.url) return next();
        const url = req.url.split('?')[0];
        if (url === '/' || url === '') {
          res.setHeader('content-type', 'text/html; charset=utf-8');
          const html = await server.transformIndexHtml(ROUTE, buildHtmlShell());
          res.end(html);
          return;
        }
        if (url === '/manifest.json' || req.url === MANIFEST_ROUTE) {
          if (!resolvedConfigPath) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'no config' }));
            return;
          }
          try {
            const mod = await server.ssrLoadModule(resolvedConfigPath);
            const config = (mod.default ?? mod) as {
              previews: Array<{
                id: string;
                platform: string;
                fixtures: Array<{ id: string; label: string }>;
              }>;
            };
            const manifest = {
              previews: config.previews.map((p) => ({
                id: p.id,
                platform: p.platform,
                variants: p.fixtures.map((f) => ({ id: f.id, label: f.label })),
              })),
            };
            res.setHeader('content-type', 'application/json');
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
