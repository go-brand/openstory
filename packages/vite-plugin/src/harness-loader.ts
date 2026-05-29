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

export function buildHarnessEntry(configPath: string): string {
  // ESM import specifiers use forward slashes on every OS; normalize so a
  // Windows path (C:\...) doesn't emit invalid backslash escapes in the string.
  const specifier = configPath.replace(/\\/g, '/');
  return [
    "import { mountPreviewHost } from '@gobrand/openstory-runtime'",
    `import config from '${specifier}'`,
    "const target = document.getElementById('root')",
    "if (!target) throw new Error('OpenStory: #root not found')",
    'mountPreviewHost(target, config)',
  ].join('\n');
}
