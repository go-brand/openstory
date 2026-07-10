import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatProjectIdentity } from "@gobrand/openstory-config";
import type { Manifest } from "./assemble-manifest.js";
import {
  changedStories,
  type ChangedComponent,
  gitChangedFiles,
  gitDiffFile,
  mergeBase,
} from "./changed-stories.js";
import { detectAffectedDocs, buildDocSyncContext } from "./doc-sync.js";

// Everything the toolset needs, injected so the tools stay pure and testable
// without a live Vite server.
export type McpToolContext = {
  getManifest: () => Promise<Manifest>;
  projectRoot: string;
  // Origin for render URLs, e.g. "http://localhost:5180" — derived per request
  // from the Host header at mount time.
  baseUrl: string;
  gitChangedFiles: typeof gitChangedFiles;
  gitDiffFile: typeof gitDiffFile;
  mergeBase: typeof mergeBase;
  readFile: (absPath: string) => string;
};

type ToolDef = {
  description: string;
  // A Zod raw shape ({} = no args). Passed straight to McpServer.registerTool.
  inputSchema: z.ZodRawShape;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
};

export type McpToolset = Record<string, ToolDef>;

function findComponent(manifest: Manifest, id: unknown) {
  const component = manifest.components.find((c) => c.id === id);
  if (!component) throw new Error(`Unknown component: ${String(id)}`);
  return component;
}

const VIEWPORTS = ["desktop", "mobile"] as const;
const LAYOUTS = ["padded", "centered", "fullscreen"] as const;
const THEMES = ["light", "dark"] as const;

// Read-only toolset over the manifest. Read-only by design (the documented MCP
// safety default: narrow blast radius, no mutations). The agent loop:
// get_changed_stories -> get_render_url -> point a browser MCP at the URL.
export function buildMcpTools(ctx: McpToolContext): McpToolset {
  return {
    get_project_context: {
      description:
        "Identify the exact repository and workspace served by this OpenStory MCP endpoint.",
      inputSchema: {},
      handler: async () => {
        const { identity } = await ctx.getManifest();
        return {
          displayName: formatProjectIdentity(identity),
          repository: identity.repository,
          workspace: identity.workspace,
        };
      },
    },

    list_components: {
      description:
        "List every component in the design system with its id, name, group, section, and story ids/labels.",
      inputSchema: {},
      handler: async () => {
        const manifest = await ctx.getManifest();
        return manifest.components.map((c) => ({
          id: c.id,
          name: c.name,
          group: c.group,
          section: c.section,
          stories: c.stories.map((s) => ({ id: s.id, label: s.label })),
        }));
      },
    },

    list_stories: {
      description: "List the stories of one component, each with its id, label, and props.",
      inputSchema: { component: z.string().describe("Component id") },
      handler: async (args) => {
        const manifest = await ctx.getManifest();
        const component = findComponent(manifest, args.component);
        return component.stories;
      },
    },

    get_component_props: {
      description:
        "Get the derived controls (prop name, type, options, default) for one component — the component's prop API.",
      inputSchema: { component: z.string().describe("Component id") },
      handler: async (args) => {
        const manifest = await ctx.getManifest();
        return findComponent(manifest, args.component).controls;
      },
    },

    get_story_source: {
      description: "Get the absolute source file path and contents for a component's stories file.",
      inputSchema: { component: z.string().describe("Component id") },
      handler: async (args) => {
        const manifest = await ctx.getManifest();
        const component = findComponent(manifest, args.component);
        if (!component.sourcePath) return { sourcePath: null, source: null };
        return { sourcePath: component.sourcePath, source: ctx.readFile(component.sourcePath) };
      },
    },

    get_changed_stories: {
      description:
        "List the stories whose source files changed (git diff). Defaults to the working tree vs HEAD — 'what did I just touch'. Pass `base` for a different git ref.",
      inputSchema: { base: z.string().optional().describe("Git ref to diff against (optional)") },
      handler: async (args) => {
        const manifest = await ctx.getManifest();
        const { files } = ctx.gitChangedFiles(ctx.projectRoot, args.base as string | undefined);
        if (files === null) {
          // Not a git repo / git unavailable: degrade to all stories, flagged.
          const all: ChangedComponent[] = manifest.components.map((c) => ({
            id: c.id,
            name: c.name,
            stories: c.stories.map((s) => ({ id: s.id, label: s.label })),
          }));
          return { changed: all, degraded: "not-a-git-repo" };
        }
        return { changed: changedStories(manifest, files) };
      },
    },

    get_affected_docs: {
      description:
        "List the *.stories.md docs affected by your cumulative changes since `base` (default: merge-base with origin/main, else working tree vs HEAD), each with structured reasons (embed/link to a changed component, the doc file itself changed, or a broken embed). Call ONCE at a completion boundary; then open each flagged doc and reconcile it with get_doc_sync_context.",
      inputSchema: { base: z.string().optional().describe("Git ref to diff against (optional)") },
      handler: async (args) => {
        const manifest = await ctx.getManifest();
        const base =
          (args.base as string | undefined) ?? ctx.mergeBase(ctx.projectRoot) ?? undefined;
        const { files } = ctx.gitChangedFiles(ctx.projectRoot, base);
        if (files === null) return { affected: [], degraded: "not-a-git-repo" };
        return { affected: detectAffectedDocs(manifest, files), base: base ?? null };
      },
    },

    get_doc_sync_context: {
      description:
        "Get everything needed to reconcile ONE affected doc (from get_affected_docs): its current source, plus each changed component's git diff and current prop/story API. Read the diff for the before/after, then edit the *.stories.md with your own tools.",
      inputSchema: {
        doc: z.string().describe("Doc id from get_affected_docs"),
        base: z.string().optional().describe("Git ref to diff against (optional)"),
      },
      handler: async (args) => {
        const manifest = await ctx.getManifest();
        const base =
          (args.base as string | undefined) ?? ctx.mergeBase(ctx.projectRoot) ?? undefined;
        const { files } = ctx.gitChangedFiles(ctx.projectRoot, base);
        const affected = (files === null ? [] : detectAffectedDocs(manifest, files)).find(
          (a) => a.docId === args.doc,
        );
        if (!affected) throw new Error(`Unknown or unaffected doc: ${String(args.doc)}`);
        return buildDocSyncContext(
          manifest,
          affected,
          {
            readFile: ctx.readFile,
            gitDiffFile: (abs, b) => ctx.gitDiffFile(ctx.projectRoot, abs, b),
          },
          base,
        );
      },
    },

    get_render_url: {
      description:
        "Build a navigable URL that renders ONE story headlessly. Point a browser MCP at it to snapshot the accessibility tree (and screenshot). Returns a structured object, not a bare string.",
      inputSchema: {
        component: z.string().describe("Component id"),
        story: z.string().describe("Story id"),
        viewport: z.enum(VIEWPORTS).optional().describe("Defaults to desktop"),
        theme: z.enum(THEMES).optional().describe("Defaults to light"),
        layout: z.enum(LAYOUTS).optional().describe("Overrides the component's declared layout"),
      },
      handler: async (args) => {
        const viewport = (args.viewport as string) ?? "desktop";
        const theme = (args.theme as string) ?? "light";
        const params = new URLSearchParams({
          component: String(args.component),
          story: String(args.story),
          viewport,
          theme,
        });
        if (args.layout) params.set("layout", String(args.layout));
        return {
          url: `${ctx.baseUrl}/__pl__/?${params.toString()}`,
          component: args.component,
          story: args.story,
          viewport,
          theme,
        };
      },
    },
  };
}

// Wire the pure toolset into an McpServer. Each tool returns its result as a
// text-JSON content block (the lowest-common-denominator MCP result shape).
export function createMcpServer(ctx: McpToolContext): McpServer {
  const server = new McpServer({ name: "openstory", version: "1" });
  const tools = buildMcpTools(ctx);
  for (const [name, def] of Object.entries(tools)) {
    server.registerTool(
      name,
      { description: def.description, inputSchema: def.inputSchema },
      async (args: Record<string, unknown>) => {
        const result = await def.handler(args ?? {});
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      },
    );
  }
  return server;
}
