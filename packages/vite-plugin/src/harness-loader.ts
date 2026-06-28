const HTML_SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OpenStory</title>
    <style>
      html, body, #root { margin: 0; padding: 0; background: transparent; }
      body { font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/@id/virtual:openstory-entry"></script>
  </body>
</html>
`;

export function buildHtmlShell(): string {
  return HTML_SHELL;
}

// The React harness must not feed `.md` to import.meta.glob (Vite would try to
// transform markdown as a module). Remove `md` from `{ts,tsx,md}` alternations
// and drop any pure-`.md` pattern. The Node manifest walk keeps the wide glob.
export function stripMarkdownPatterns(patterns: string[]): string[] {
  return patterns
    .map((p) =>
      p.replace(
        /\{([^}]*)\}/g,
        (_full, inner: string) =>
          "{" +
          inner
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s !== "md")
            .join(",") +
          "}",
      ),
    )
    .filter((p) => !/\.md$/.test(p));
}

export function buildHarnessEntry(
  configPath: string | null,
  styles: string[] = [],
  patterns: string[] = ["**/*.stories.{ts,tsx}"],
): string {
  // ESM import specifiers use forward slashes on every OS; normalize so a
  // Windows path (C:\...) doesn't emit invalid backslash escapes in the string.
  const norm = (p: string) => p.replace(/\\/g, "/");
  // Side-effect imports of the project's CSS (e.g. the Tailwind entry). These
  // must be in the harness page's module graph or Tailwind v4 emits no utilities
  // for the components rendered here.
  const styleImports = styles.map((s) => `import '${norm(s)}'`);
  // Strip .md from patterns: Vite cannot transform markdown as a module.
  // The Node manifest walk keeps the wide glob; the browser harness is React-only.
  const reactPatterns = stripMarkdownPatterns(patterns);
  // Vite's import.meta.glob resolves a leading "/" against the project root; the
  // patterns are project-root-relative, so prefix one. Negative patterns exclude
  // build output (Vite already ignores node_modules).
  const globArg = JSON.stringify([
    ...reactPatterns.map((p) => "/" + p.replace(/^\//, "")),
    "!/**/dist/**",
    "!/**/build/**",
    "!/**/out/**",
  ]);
  // Config is optional (zero-config discovery). With no config file we still
  // bind `userConfig` so downstream `userConfig.components`/spread stays valid.
  const configLine = configPath
    ? `import userConfig from '${norm(configPath)}'`
    : `const userConfig = {}`;
  return [
    ...styleImports,
    "import { mountPreviewHost } from '@gobrand/openstory-runtime'",
    "import { isRegisteredComponent, mergeComponents } from '@gobrand/openstory-config'",
    configLine,
    `const modules = import.meta.glob(${globArg}, { eager: true })`,
    "const discovered = Object.values(modules).map((m) => m.default).filter(isRegisteredComponent)",
    "const components = mergeComponents(discovered, userConfig.components ?? [])",
    "const target = document.getElementById('root')",
    "if (!target) throw new Error('OpenStory: #root not found')",
    "mountPreviewHost(target, { ...userConfig, components })",
    // Force the harness document transparent so the manager's themed canvas
    // (bg-canvas, dark in dark mode) shows behind the preview — otherwise the
    // consumer app's own `body`/`:root` background (imported above) fills the
    // iframe (e.g. white in a light-themed app) and the preview never follows
    // the manager theme. Appended last + !important so it beats consumer CSS.
    "const __osTransparent = document.createElement('style')",
    "__osTransparent.textContent = ':root,html,body,#root{background:transparent !important}'",
    "document.head.appendChild(__osTransparent)",
  ].join("\n");
}
