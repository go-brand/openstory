import { dirname, resolve } from "node:path";

export type ComponentTarget = { id: string; storyIds: Set<string> };

export type LinkResolveCtx = {
  /** Absolute path of the doc the link lives in (links resolve relative to it). */
  fromPath: string;
  /** Absolute doc source path → page id. */
  pageByAbsPath: Map<string, string>;
  /** Absolute component source path → { id, storyIds }. */
  componentByAbsPath: Map<string, ComponentTarget>;
};

export type LinkTarget =
  | { kind: "external" } // http/https/mailto — keep href, open in real browser
  | { kind: "passthrough" } // in-page #anchor — leave to the browser untouched
  | { kind: "page"; id: string }
  | { kind: "docs"; componentId: string }
  | { kind: "story"; componentId: string; storyId: string }
  | { kind: "inert"; reason: string };

const EXTERNAL = /^(?:https?|mailto):/i;
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

// Pure: classify a raw markdown link href against the build manifest. Relative
// paths resolve against the doc's directory; a #fragment on a component file
// selects a story. No I/O, no logging — the caller warns on `inert`.
export function resolveLink(href: string, ctx: LinkResolveCtx): LinkTarget {
  if (!href || href.startsWith("#")) return { kind: "passthrough" };
  if (EXTERNAL.test(href)) return { kind: "external" };
  if (HAS_SCHEME.test(href)) return { kind: "inert", reason: "unsupported link scheme" };

  const hashIdx = href.indexOf("#");
  const pathPart = hashIdx === -1 ? href : href.slice(0, hashIdx);
  const fragment = hashIdx === -1 ? "" : decodeURIComponent(href.slice(hashIdx + 1));

  const abs = resolve(dirname(ctx.fromPath), pathPart);

  const pageId = ctx.pageByAbsPath.get(abs);
  if (pageId) return { kind: "page", id: pageId };

  const comp = ctx.componentByAbsPath.get(abs);
  if (comp) {
    if (!fragment) return { kind: "docs", componentId: comp.id };
    if (comp.storyIds.has(fragment))
      return { kind: "story", componentId: comp.id, storyId: fragment };
    return { kind: "inert", reason: `story "${fragment}" not found in component "${comp.id}"` };
  }

  return { kind: "inert", reason: "no matching doc or component" };
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Pure: render a resolved target to an anchor (or inert span). `inner` is already
// HTML (the link's rendered inline content). Id segments are percent-encoded so
// the runtime can split the custom-scheme path on "/" unambiguously.
export function linkHtml(target: LinkTarget, href: string, inner: string): string {
  const enc = encodeURIComponent;
  switch (target.kind) {
    case "external":
      return `<a href="${escapeAttr(href)}" rel="noopener noreferrer">${inner}</a>`;
    case "passthrough":
      return `<a href="${escapeAttr(href)}">${inner}</a>`;
    case "page":
      return `<a href="openstory:page/${enc(target.id)}">${inner}</a>`;
    case "docs":
      return `<a href="openstory:docs/${enc(target.componentId)}">${inner}</a>`;
    case "story":
      return `<a href="openstory:story/${enc(target.componentId)}/${enc(target.storyId)}">${inner}</a>`;
    case "inert":
      return `<span class="openstory-doc-deadlink" title="unresolved link">${inner}</span>`;
  }
}
