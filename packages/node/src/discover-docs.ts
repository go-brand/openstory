import { basename } from "node:path";
import { Marked, marked, type Tokens } from "marked";
import { humanize, kebabCase, type ManifestDoc } from "@gobrand/openstory-config";
import { deriveSection } from "./derive-section.js";
import {
  resolveLink,
  linkHtml,
  type ComponentTarget,
  type LinkResolveCtx,
} from "./resolve-doc-links.js";

// One `:::story <id>` directive per line → placeholder. The id is the only
// capture; trailing whitespace tolerated. Block-level raw HTML passes through
// `marked` untouched, so the placeholder survives rendering.
const STORY_DIRECTIVE = /^:::story[ \t]+(\S+)[ \t]*$/gm;

type Frontmatter = {
  title?: string;
  id?: string;
  group?: string;
  status?: ManifestDoc["status"];
  owner?: string;
};

// Hand-rolled frontmatter: a leading `---` fenced block of `key: value` lines.
// Scalars only. No js-yaml — supply-chain hygiene.
function parseFrontmatter(source: string): { data: Frontmatter; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(source);
  if (!match) return { data: {}, body: source };
  const data: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) data[key] = value;
  }
  return { data: data as Frontmatter, body: source.slice(match[0].length) };
}

export type DocMeta = {
  id: string;
  title: string;
  group: string;
  section: string | null;
  status?: ManifestDoc["status"];
  owner?: string;
  body: string;
  sourcePath: string;
};

// Pass 1: frontmatter + id derivation, no markdown render. Splitting render off
// lets discoverDocs learn every doc's id (to resolve cross-doc links) before any
// doc is rendered.
export function parseDocMeta(source: string, sourcePath: string): DocMeta {
  const { data, body } = parseFrontmatter(source);
  const fileBase = basename(sourcePath).replace(/\.stories\.md$/, "");
  const id = data.id ?? kebabCase(fileBase);
  const title = data.title ?? humanize(fileBase);
  const meta: DocMeta = {
    id,
    title,
    group: data.group ?? "",
    section: deriveSection(sourcePath),
    body,
    sourcePath,
  };
  if (data.status) meta.status = data.status;
  if (data.owner) meta.owner = data.owner;
  return meta;
}

function renderHtml(body: string, linkCtx?: LinkResolveCtx): { html: string; embeds: string[] } {
  const embeds: string[] = [];
  const preprocessed = body.replace(STORY_DIRECTIVE, (_full, id: string) => {
    embeds.push(id);
    return `<div data-openstory-story="${id}" class="openstory-embed"></div>`;
  });

  if (!linkCtx) {
    return { html: marked.parse(preprocessed, { async: false }) as string, embeds };
  }

  // A per-doc renderer so each link resolves against this doc's directory. marked
  // hands `link` the parsed token; we re-render its inner text via parseInline so
  // inline formatting inside the link survives, then swap the href.
  const md = new Marked({
    renderer: {
      link(token: Tokens.Link) {
        const inner = marked.parseInline(token.text, { async: false }) as string;
        const target = resolveLink(token.href, linkCtx);
        if (target.kind === "inert") {
          console.warn(
            `[openstory] doc ${linkCtx.fromPath}: unresolved link '${token.href}' — ${target.reason}. Rendering inert.`,
          );
        }
        return linkHtml(target, token.href, inner);
      },
    },
  });
  return { html: md.parse(preprocessed, { async: false }) as string, embeds };
}

// Pass 2: render a meta into a ManifestDoc, resolving links when a context is given.
export function renderDoc(meta: DocMeta, linkCtx?: LinkResolveCtx): ManifestDoc {
  const { html, embeds } = renderHtml(meta.body, linkCtx);
  const doc: ManifestDoc = {
    id: meta.id,
    title: meta.title,
    group: meta.group,
    section: meta.section,
    html,
    embeds,
    sourcePath: meta.sourcePath,
  };
  if (meta.status) doc.status = meta.status;
  if (meta.owner) doc.owner = meta.owner;
  return doc;
}

// Backward-compatible single-doc parse (no cross-doc link resolution unless a
// context is supplied). Retained for existing call sites/tests.
export function parseDoc(
  source: string,
  sourcePath: string,
  linkCtx?: LinkResolveCtx,
): ManifestDoc {
  return renderDoc(parseDocMeta(source, sourcePath), linkCtx);
}

export function discoverDocs(
  docFiles: string[],
  read: (abs: string) => string,
  componentByAbsPath: Map<string, ComponentTarget> = new Map(),
): ManifestDoc[] {
  // Pass 1: read + derive ids; dedupe (first wins); build path→id for pages so a
  // doc can link to another doc by file path.
  const metas: DocMeta[] = [];
  const seen = new Set<string>();
  const pageByAbsPath = new Map<string, string>();
  for (const file of docFiles) {
    let source: string;
    try {
      source = read(file);
    } catch (err) {
      console.warn(`[openstory] failed to read ${file}: ${String(err)}`);
      continue;
    }
    const meta = parseDocMeta(source, file);
    if (seen.has(meta.id)) {
      console.warn(
        `[openstory] two docs resolve to id "${meta.id}"; keeping the first. Set frontmatter \`id\` to disambiguate.`,
      );
      continue;
    }
    seen.add(meta.id);
    pageByAbsPath.set(meta.sourcePath, meta.id);
    metas.push(meta);
  }

  // Pass 2: render each kept doc with cross-doc + component link resolution.
  return metas.map((meta) =>
    renderDoc(meta, { fromPath: meta.sourcePath, pageByAbsPath, componentByAbsPath }),
  );
}
