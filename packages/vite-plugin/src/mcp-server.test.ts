import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildMcpTools, createMcpServer, type McpToolContext } from "./mcp-server";
import type { Manifest } from "./assemble-manifest";

const manifest = {
  schemaVersion: 1,
  identity: {
    repository: {
      label: "GoBrand",
      slug: "go-brand/gb-monorepo",
      rootPath: "/repo",
    },
    workspace: {
      label: "Web App",
      relativePath: "apps/app",
      rootPath: "/repo/apps/app",
    },
    source: "config",
  },
  docs: [],
  components: [
    {
      id: "button",
      name: "Button",
      group: "Forms",
      section: "ui",
      background: "#fff",
      layout: "padded",
      stories: [{ id: "primary", label: "Primary", props: { variant: "primary" } }],
      controls: { variant: { name: "variant", type: "enum", options: ["primary", "danger"] } },
      sourcePath: "/p/src/button.tsx",
    },
  ],
} as unknown as Manifest;

const manifestWithDoc = {
  ...manifest,
  docs: [
    {
      id: "buttons",
      title: "Buttons",
      group: "",
      section: "",
      sourcePath: "/p/buttons.stories.md",
      embeds: ["button--primary"],
      html: '<a href="openstory:docs/button">api</a>',
    },
  ],
} as unknown as Manifest;

function makeCtx(over: Partial<McpToolContext> = {}): McpToolContext {
  return {
    getManifest: async () => manifest,
    projectRoot: "/p",
    baseUrl: "http://localhost:5180",
    gitChangedFiles: () => ({ files: ["/p/src/button.tsx"] }),
    gitDiffFile: () => "diff --git a/button.stories.tsx b/button.stories.tsx\n+changed",
    mergeBase: () => null,
    readFile: () => "export const Button = () => null;",
    ...over,
  };
}

describe("buildMcpTools", () => {
  it("get_project_context identifies the exact repository and workspace", async () => {
    const result = await buildMcpTools(makeCtx()).get_project_context.handler({});

    expect(result).toEqual({
      displayName: "GoBrand · Web App",
      repository: manifest.identity.repository,
      workspace: manifest.identity.workspace,
    });
  });

  it("list_components returns id/name/stories", async () => {
    const r = (await buildMcpTools(makeCtx()).list_components.handler({})) as Array<{
      id: string;
      name: string;
    }>;
    expect(r[0]).toMatchObject({ id: "button", name: "Button", group: "Forms" });
  });

  it("list_stories returns the component's stories with props", async () => {
    const r = (await buildMcpTools(makeCtx()).list_stories.handler({
      component: "button",
    })) as Array<{ id: string }>;
    expect(r).toEqual([{ id: "primary", label: "Primary", props: { variant: "primary" } }]);
  });

  it("get_component_props returns derived controls", async () => {
    const r = await buildMcpTools(makeCtx()).get_component_props.handler({ component: "button" });
    expect(r).toEqual({
      variant: { name: "variant", type: "enum", options: ["primary", "danger"] },
    });
  });

  it("get_story_source returns path + contents", async () => {
    const r = (await buildMcpTools(makeCtx()).get_story_source.handler({
      component: "button",
    })) as {
      sourcePath: string;
      source: string;
    };
    expect(r.sourcePath).toBe("/p/src/button.tsx");
    expect(r.source).toContain("Button");
  });

  it("get_render_url builds a structured, navigable URL", async () => {
    const r = (await buildMcpTools(makeCtx()).get_render_url.handler({
      component: "button",
      story: "primary",
      theme: "dark",
    })) as { url: string; viewport: string; theme: string };
    expect(r).toMatchObject({
      component: "button",
      story: "primary",
      viewport: "desktop",
      theme: "dark",
    });
    expect(r.url).toBe(
      "http://localhost:5180/__pl__/?component=button&story=primary&viewport=desktop&theme=dark",
    );
  });

  it("get_render_url appends layout only when provided", async () => {
    const r = (await buildMcpTools(makeCtx()).get_render_url.handler({
      component: "button",
      story: "primary",
      layout: "fullscreen",
    })) as { url: string };
    expect(r.url).toContain("layout=fullscreen");
  });

  it("get_changed_stories maps git diff to stories", async () => {
    const r = (await buildMcpTools(makeCtx()).get_changed_stories.handler({})) as {
      changed: Array<{ id: string }>;
    };
    expect(r.changed.map((c) => c.id)).toEqual(["button"]);
  });

  it("get_changed_stories degrades to all stories outside a git repo", async () => {
    const ctx = makeCtx({ gitChangedFiles: () => ({ files: null }) });
    const r = (await buildMcpTools(ctx).get_changed_stories.handler({})) as {
      changed: Array<{ id: string }>;
      degraded?: string;
    };
    expect(r.degraded).toBe("not-a-git-repo");
    expect(r.changed.map((c) => c.id)).toEqual(["button"]);
  });

  it("throws on an unknown component", async () => {
    await expect(
      buildMcpTools(makeCtx()).list_stories.handler({ component: "nope" }),
    ).rejects.toThrow(/Unknown component/);
  });

  it("get_affected_docs returns affected docs with reasons", async () => {
    const ctx = makeCtx({ getManifest: async () => manifestWithDoc });
    const r = (await buildMcpTools(ctx).get_affected_docs.handler({})) as {
      affected: Array<{ docId: string; reasons: Array<{ kind: string }> }>;
    };
    expect(r.affected.map((a) => a.docId)).toEqual(["buttons"]);
    expect(r.affected[0].reasons.map((x) => x.kind)).toContain("embed-component-changed");
  });

  it("get_affected_docs degrades outside a git repo", async () => {
    const ctx = makeCtx({
      getManifest: async () => manifestWithDoc,
      gitChangedFiles: () => ({ files: null }),
    });
    const r = (await buildMcpTools(ctx).get_affected_docs.handler({})) as {
      degraded?: string;
      affected: unknown[];
    };
    expect(r.degraded).toBe("not-a-git-repo");
    expect(r.affected).toEqual([]);
  });

  it("get_doc_sync_context returns the package for an affected doc", async () => {
    const ctx = makeCtx({ getManifest: async () => manifestWithDoc });
    const r = (await buildMcpTools(ctx).get_doc_sync_context.handler({ doc: "buttons" })) as {
      docId: string;
      changedComponents: Array<{ componentId: string; gitDiff: string }>;
    };
    expect(r.docId).toBe("buttons");
    expect(r.changedComponents[0].componentId).toBe("button");
    expect(r.changedComponents[0].gitDiff).toContain("+changed");
  });

  it("get_doc_sync_context throws on an unaffected doc", async () => {
    const ctx = makeCtx({ getManifest: async () => manifestWithDoc });
    await expect(buildMcpTools(ctx).get_doc_sync_context.handler({ doc: "nope" })).rejects.toThrow(
      /Unknown or unaffected/,
    );
  });
});

describe("createMcpServer round-trip (in-memory transport)", () => {
  async function connect() {
    const server = createMcpServer(makeCtx());
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1" });
    await Promise.all([server.connect(serverT), client.connect(clientT)]);
    return { client, server };
  }

  it("exposes the nine read-only tools", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_affected_docs",
      "get_changed_stories",
      "get_component_props",
      "get_doc_sync_context",
      "get_project_context",
      "get_render_url",
      "get_story_source",
      "list_components",
      "list_stories",
    ]);
  });

  it("calls get_render_url and returns the URL in a text content block", async () => {
    const { client } = await connect();
    const res = await client.callTool({
      name: "get_render_url",
      arguments: { component: "button", story: "primary" },
    });
    const text = (res.content as Array<{ type: string; text: string }>)[0].text;
    expect(JSON.parse(text).url).toBe(
      "http://localhost:5180/__pl__/?component=button&story=primary&viewport=desktop&theme=light",
    );
  });
});
