import { describe, expect, it } from "vitest";
import { changedStories, gitChangedFiles } from "./changed-stories";
import type { Manifest } from "./assemble-manifest";

const manifest = {
  schemaVersion: 1,
  docs: [],
  components: [
    {
      id: "button",
      name: "Button",
      group: "",
      section: "",
      background: "#fff",
      layout: "padded",
      stories: [{ id: "primary", label: "Primary", props: {} }],
      controls: {},
      sourcePath: "/p/src/button.tsx",
    },
    {
      id: "badge",
      name: "Badge",
      group: "",
      section: "",
      background: "#fff",
      layout: "padded",
      stories: [{ id: "ok", label: "Ok", props: {} }],
      controls: {},
      sourcePath: "/p/src/badge.tsx",
    },
  ],
} as unknown as Manifest;

describe("changedStories", () => {
  it("returns only components whose sourcePath changed", () => {
    const r = changedStories(manifest, ["/p/src/button.tsx"]);
    expect(r.map((c) => c.id)).toEqual(["button"]);
    expect(r[0].stories).toEqual([{ id: "primary", label: "Primary" }]);
  });

  it("returns empty when nothing matches", () => {
    expect(changedStories(manifest, ["/p/src/unrelated.ts"])).toEqual([]);
  });

  it("ignores components with a null sourcePath", () => {
    const m = {
      ...manifest,
      components: [{ ...manifest.components[0], sourcePath: null }],
    } as unknown as Manifest;
    expect(changedStories(m, ["/p/src/button.tsx"])).toEqual([]);
  });
});

describe("gitChangedFiles flag-injection guard", () => {
  // `base` is agent-controlled; a value starting with `-` could smuggle a git
  // flag (argv injection). It must be rejected before reaching execFileSync —
  // returning files:null without ever invoking git.
  it("rejects a base that starts with a dash", () => {
    expect(gitChangedFiles("/p", "--output=/tmp/x")).toEqual({ files: null });
    expect(gitChangedFiles("/p", "-anything")).toEqual({ files: null });
  });
});
