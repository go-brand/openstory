import { describe, expect, it } from "vitest";
import { detectAffectedDocs, buildDocSyncContext } from "./doc-sync";
import type { Manifest } from "./assemble-manifest";

const manifest = {
  schemaVersion: 1,
  components: [
    {
      id: "button",
      name: "Button",
      group: "",
      section: "",
      background: "#fff",
      layout: "padded",
      stories: [
        { id: "primary", label: "Primary", props: {} },
        { id: "small", label: "Small", props: {} },
      ],
      controls: {},
      sourcePath: "/p/button.stories.tsx",
    },
    {
      id: "card",
      name: "Card",
      group: "",
      section: "",
      background: "#fff",
      layout: "padded",
      stories: [{ id: "basic", label: "Basic", props: {} }],
      controls: {},
      sourcePath: "/p/card.stories.tsx",
    },
  ],
  docs: [
    {
      id: "buttons",
      title: "Buttons",
      group: "",
      section: "",
      sourcePath: "/p/buttons.stories.md",
      embeds: ["button--primary"],
      html: '<p><a href="openstory:docs/button">api</a></p>',
    },
    {
      id: "layout",
      title: "Layout",
      group: "",
      section: "",
      sourcePath: "/p/layout.stories.md",
      embeds: ["card--basic"],
      html: "<p>no links</p>",
    },
    {
      id: "broken",
      title: "Broken",
      group: "",
      section: "",
      sourcePath: "/p/broken.stories.md",
      embeds: ["button--smal"],
      html: "",
    },
  ],
} as unknown as Manifest;

describe("detectAffectedDocs", () => {
  it("flags embed + link reasons when a referenced component's source changed", () => {
    const r = detectAffectedDocs(manifest, ["/p/button.stories.tsx"]);
    const buttons = r.find((d) => d.docId === "buttons")!;
    expect(buttons.reasons).toContainEqual({
      kind: "embed-component-changed",
      componentId: "button",
      storyId: "primary",
    });
    expect(buttons.reasons).toContainEqual({
      kind: "link-target-changed",
      targetKind: "docs",
      componentId: "button",
    });
  });

  it("flags an embed-only doc when its embedded component changed", () => {
    const r = detectAffectedDocs(manifest, ["/p/card.stories.tsx"]);
    const layout = r.find((d) => d.docId === "layout")!;
    expect(layout.reasons).toEqual([
      { kind: "embed-component-changed", componentId: "card", storyId: "basic" },
    ]);
  });

  it("flags a doc whose own source file changed", () => {
    const r = detectAffectedDocs(manifest, ["/p/layout.stories.md"]);
    const layout = r.find((d) => d.docId === "layout")!;
    expect(layout.reasons).toContainEqual({ kind: "doc-file-changed" });
  });

  it("always flags a broken embed with a fuzzy suggestion, regardless of changes", () => {
    const r = detectAffectedDocs(manifest, []);
    const broken = r.find((d) => d.docId === "broken")!;
    expect(broken.reasons).toEqual([
      { kind: "broken-embed", embedId: "button--smal", suggestion: "button--small" },
    ]);
  });

  it("suggests null for a broken embed with no close story", () => {
    const m = {
      ...manifest,
      docs: [{ ...manifest.docs[2], embeds: ["button--zzzzz"] }],
    } as unknown as Manifest;
    const r = detectAffectedDocs(m, []);
    expect(r[0].reasons).toEqual([
      { kind: "broken-embed", embedId: "button--zzzzz", suggestion: null },
    ]);
  });

  it("returns no entry for a doc with no reasons", () => {
    const r = detectAffectedDocs(manifest, ["/p/unrelated.ts"]);
    expect(r.map((d) => d.docId)).toEqual(["broken"]); // only the always-broken doc
  });
});

describe("buildDocSyncContext", () => {
  const affectedButtons = {
    docId: "buttons",
    sourcePath: "/p/buttons.stories.md",
    reasons: [
      { kind: "embed-component-changed", componentId: "button", storyId: "primary" },
      { kind: "link-target-changed", targetKind: "docs", componentId: "button" },
    ],
  } as const;

  const deps = {
    readFile: (abs: string) => `# Buttons doc at ${abs}`,
    gitDiffFile: (abs: string) => `diff --git a${abs} b${abs}\n+changed`,
  };

  it("assembles doc source + one entry per distinct changed component", () => {
    const ctx = buildDocSyncContext(manifest, affectedButtons, deps);
    expect(ctx.docId).toBe("buttons");
    expect(ctx.docSource).toBe("# Buttons doc at /p/buttons.stories.md");
    expect(ctx.changedComponents).toHaveLength(1); // button appears in two reasons -> deduped
    expect(ctx.changedComponents[0].componentId).toBe("button");
    expect(ctx.changedComponents[0].gitDiff).toContain("+changed");
    expect(ctx.changedComponents[0].manifestEntry.id).toBe("button");
  });

  it("degrades docSource to empty string when the doc is unreadable", () => {
    const ctx = buildDocSyncContext(manifest, affectedButtons, {
      readFile: () => {
        throw new Error("ENOENT");
      },
      gitDiffFile: () => "",
    });
    expect(ctx.docSource).toBe("");
  });

  it("skips a component that is not in the manifest", () => {
    const affected = {
      docId: "x", sourcePath: "/p/x.stories.md",
      reasons: [{ kind: "embed-component-changed", componentId: "ghost", storyId: "z" }],
    } as const;
    const ctx = buildDocSyncContext(manifest, affected, deps);
    expect(ctx.changedComponents).toEqual([]);
  });

  it("does not pull a component diff for a broken-embed-only doc", () => {
    const affected = {
      docId: "broken", sourcePath: "/p/broken.stories.md",
      reasons: [{ kind: "broken-embed", embedId: "button--smal", suggestion: "button--small" }],
    } as const;
    const ctx = buildDocSyncContext(manifest, affected, deps);
    expect(ctx.changedComponents).toEqual([]);
    expect(ctx.reasons).toEqual(affected.reasons);
  });
});
