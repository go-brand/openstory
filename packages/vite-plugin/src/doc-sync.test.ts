import { describe, expect, it } from "vitest";
import { detectAffectedDocs } from "./doc-sync";
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
