const HTML_SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OpenStory</title>
    <style>
      /* OpenStory's OWN themed canvas — the background behind every preview comes
         from here, not from the consumer app loaded into OpenStory. The manager
         mirrors its light/dark theme by toggling \`.dark\` on this document's root
         (os:theme bridge message), so --os-canvas flips with the manager. Matches
         the manager's --canvas tokens (#ffffff / #1b1c1d). */
      :root { --os-canvas: #ffffff; }
      .dark { --os-canvas: #1b1c1d; }
      html, body, #root { margin: 0; padding: 0; }
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
    // Paint OpenStory's OWN themed canvas (--os-canvas, defined in the HTML shell
    // and flipped by the `.dark` class the os:theme bridge toggles) behind every
    // preview. Appended AFTER the consumer's CSS imports above, with !important,
    // so it beats whatever `body`/`:root` background the consumer app ships — the
    // canvas always follows the OpenStory manager theme, never the loaded app.
    // (Replaces the old transparent-harness trick, which depended on the manager
    // canvas compositing through the iframe and rendered white on some setups.)
    "const __osCanvas = document.createElement('style')",
    "__osCanvas.textContent = ':root,html,body,#root{background:var(--os-canvas) !important}'",
    "document.head.appendChild(__osCanvas)",
  ].join("\n");
}
