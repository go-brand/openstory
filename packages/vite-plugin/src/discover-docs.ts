import { basename } from "node:path";
import { marked } from "marked";
import { humanize, kebabCase, type ManifestDoc } from "@gobrand/openstory-config";
import { deriveSection } from "./derive-section.js";

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
// Scalars only (the keys we read are all scalars). No js-yaml — supply-chain
// hygiene, consistent with the no-third-party-glob rule.
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

export function parseDoc(source: string, sourcePath: string): ManifestDoc {
  const { data, body } = parseFrontmatter(source);

  // Extract embeds + swap directives for placeholders before markdown render.
  const embeds: string[] = [];
  const preprocessed = body.replace(STORY_DIRECTIVE, (_full, id: string) => {
    embeds.push(id);
    return `<div data-openstory-story="${id}" class="openstory-embed"></div>`;
  });

  const html = marked.parse(preprocessed, { async: false }) as string;

  const fileBase = basename(sourcePath).replace(/\.stories\.md$/, "");
  const id = data.id ?? kebabCase(fileBase);
  const title = data.title ?? humanize(fileBase);

  const doc: ManifestDoc = {
    id,
    title,
    group: data.group ?? "",
    section: deriveSection(sourcePath),
    html,
    embeds,
    sourcePath,
  };
  if (data.status) doc.status = data.status;
  if (data.owner) doc.owner = data.owner;
  return doc;
}

export function discoverDocs(docFiles: string[], read: (abs: string) => string): ManifestDoc[] {
  const out: ManifestDoc[] = [];
  const seen = new Set<string>();
  for (const file of docFiles) {
    let source: string;
    try {
      source = read(file);
    } catch (err) {
      console.warn(`[openstory] failed to read ${file}: ${String(err)}`);
      continue;
    }
    const doc = parseDoc(source, file);
    if (seen.has(doc.id)) {
      console.warn(
        `[openstory] two docs resolve to id "${doc.id}"; keeping the first. Set frontmatter \`id\` to disambiguate.`,
      );
      continue;
    }
    seen.add(doc.id);
    out.push(doc);
  }
  return out;
}
