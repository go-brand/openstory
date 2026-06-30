// Scheme allowlist for shell.openExternal. Handing it file:/javascript:/etc. is a
// documented Electron footgun, so only http(s)/mailto pass. Returns the parsed,
// normalized URL string when allowed, else null.
const ALLOWED = new Set(["http:", "https:", "mailto:"]);

export function allowedExternalUrl(href: string): string | null {
  try {
    const url = new URL(href);
    return ALLOWED.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
