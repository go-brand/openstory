import { resolve } from "node:path";
import {
  mergeControls,
  mergeComponents,
  resolvePresets,
  resolveRender,
  type ManifestControl,
  type ManifestDoc,
  type OpenStoryConfig,
} from "@gobrand/openstory-config";
import { deriveSection } from "./derive-section.js";
import { extractPropTypes } from "./extract-prop-types.js";
import {
  discoverComponentsFrom,
  matchFiles,
  partitionByExtension,
  resolvePatterns,
} from "./discover.js";
import { discoverDocs } from "./discover-docs.js";
import type { ComponentTarget } from "./resolve-doc-links.js";
import { resolveProjectIdentity } from "./project-identity.js";

// Pure manifest shaping from a resolved config. Lives here (not in plugin.ts) so
// both the `/manifest.json` route AND the MCP tools can build the same manifest
// from the same code — the one-renderer/one-manifest invariant that keeps Node
// discovery and the browser render from disagreeing.
export function buildManifest(
  config: OpenStoryConfig,
  projectRoot?: string,
  docs: ManifestDoc[] = [],
) {
  const presets = resolvePresets(config.presets);
  return {
    // Versioned public contract: the manifest shape AND the headless render-route
    // query params (component/story/viewport/theme) are stable under this
    // number. Bump on any breaking change to either. See the agent-first spec.
    schemaVersion: 1 as const,
    identity: resolveProjectIdentity(projectRoot ?? process.cwd(), config.identity),
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
        ...(p.previewPadding !== undefined && { previewPadding: p.previewPadding }),
        stories: p.fixtures.map((f) => ({
          id: f.id,
          label: f.label,
          props: f.props,
          ...(f.previewPadding !== undefined && { previewPadding: f.previewPadding }),
        })),
        controls: mergeControls(p.fixtures, typeControls),
        sourcePath,
      };
    }),
    docs,
  };
}

export type Manifest = ReturnType<typeof buildManifest>;

export type AssembleManifestDeps = {
  projectRoot: string;
  resolvedConfigPath: string | null;
  ssrLoadModule: (path: string) => Promise<Record<string, unknown>>;
  readFile: (absPath: string) => string;
};

// Discover + assemble the full manifest against a live project: load the optional
// config, glob story/doc files, extract components, validate doc embeds, shape.
// Extracted verbatim from the `/manifest.json` route so the MCP tools reuse it.
export async function assembleManifest(deps: AssembleManifestDeps): Promise<Manifest> {
  const { projectRoot, resolvedConfigPath, ssrLoadModule, readFile } = deps;

  const config = resolvedConfigPath
    ? (((await ssrLoadModule(resolvedConfigPath)).default ?? {}) as OpenStoryConfig)
    : null;
  const patterns = resolvePatterns(config);

  // One walk + glob match, then split by extension.
  const matched = matchFiles(projectRoot, patterns);
  const { storyFiles, docFiles } = partitionByExtension(matched);

  const discovered = await discoverComponentsFrom(storyFiles, (p) => ssrLoadModule(p));
  const components = mergeComponents(discovered, config?.components ?? []);
  // Map each component's absolute source path → { id, storyIds } so doc links to
  // a component file resolve to its auto-docs (no fragment) or a story (#story).
  const componentByAbsPath = new Map<string, ComponentTarget>();
  for (const c of components) {
    if (!c.sourcePath) continue;
    componentByAbsPath.set(resolve(projectRoot, c.sourcePath), {
      id: c.id,
      storyIds: new Set(c.fixtures.map((f) => f.id)),
    });
  }
  const docs = discoverDocs(docFiles, (abs) => readFile(abs), componentByAbsPath);

  // Validate embeds against the assembled story registry; warn on misses.
  const storyKeys = new Set(components.flatMap((c) => c.fixtures.map((f) => `${c.id}--${f.id}`)));
  for (const doc of docs) {
    for (const id of doc.embeds) {
      if (!storyKeys.has(id)) {
        console.warn(`[openstory] doc ${doc.sourcePath}: embed ${id} matches no story`);
      }
    }
  }

  return buildManifest({ ...config, components }, projectRoot, docs);
}
