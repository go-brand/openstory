import { describe, it, expect } from "vitest";
import { defineOpenStoryConfig, defineStories, deriveControls, mergeControls } from "./define";
import type { Fixture, ManifestControl } from "./define";

describe("defineOpenStoryConfig", () => {
  it("returns the config unchanged", () => {
    const config = defineOpenStoryConfig({
      components: [
        {
          id: "linkedin",
          component: () => null,
          fixtures: [{ id: "short", label: "Short", props: {} }],
        },
      ],
    });

    expect(config.components).toHaveLength(1);
    expect(config.components[0].id).toBe("linkedin");
  });

  it("preserves provider component when given", () => {
    const Providers = ({ children }: { children: React.ReactNode }) => children;
    const config = defineOpenStoryConfig({
      components: [],
      providers: Providers,
    });

    expect(config.providers).toBe(Providers);
  });
});

describe("deriveControls", () => {
  const fixtures = [
    {
      id: "a",
      label: "A",
      props: { text: "hi", count: 2, dark: true, author: { name: "x" } },
    },
    { id: "b", label: "B", props: { text: "yo", extra: "z" } },
  ];

  it("infers primitive control kinds and unions keys across fixtures", () => {
    const controls = deriveControls(fixtures);
    expect(controls).toEqual([
      { name: "text", kind: "text" },
      { name: "count", kind: "number" },
      { name: "dark", kind: "boolean" },
      { name: "extra", kind: "text" },
    ]);
  });

  it("skips non-primitive props (objects/arrays/functions)", () => {
    const controls = deriveControls([
      {
        id: "a",
        label: "A",
        props: { author: { name: "x" }, tags: [1], fn: () => {} },
      },
    ]);
    expect(controls).toEqual([]);
  });

  it("drops a prop that is primitive in one fixture but non-primitive in another", () => {
    const controls = deriveControls([
      { id: "a", label: "A", props: { value: "hi" } },
      { id: "b", label: "B", props: { value: { nested: true } } },
    ]);
    expect(controls).toEqual([]);
  });

  it("drops a prop that is only ever null/undefined", () => {
    const controls = deriveControls([
      { id: "a", label: "A", props: { value: null } },
      { id: "b", label: "B", props: { value: undefined } },
    ]);
    expect(controls).toEqual([]);
  });

  it("returns an empty array for empty fixtures", () => {
    expect(deriveControls([])).toEqual([]);
  });
});

describe("defineStories name", () => {
  it("derives name from the component, stripping a Preview suffix and humanizing", () => {
    function LinkedinPreview() {
      return null;
    }
    const reg = defineStories({ component: LinkedinPreview, stories: { A: {} } });
    expect(reg.name).toBe("Linkedin");
    expect(reg.id).toBe("linkedin");
  });

  it("uses the component name verbatim (humanized) when there is no Preview suffix", () => {
    function Button() {
      return null;
    }
    const reg = defineStories({ component: Button, stories: { A: {} } });
    expect(reg.name).toBe("Button");
    expect(reg.id).toBe("button");
  });
});

describe("OpenStoryConfig.stories", () => {
  it("accepts a stories glob-patterns array", () => {
    const config = defineOpenStoryConfig({ stories: ["src/**/*.stories.tsx"], components: [] });
    expect(config.stories).toEqual(["src/**/*.stories.tsx"]);
  });
});

describe("mergeControls", () => {
  const fixtures: Fixture[] = [
    { id: "a", label: "A", props: { variant: "primary", label: "Hi", count: 1 } },
    { id: "b", label: "B", props: { variant: "secondary", label: "Yo", count: 2 } },
  ];

  it("prefers type-derived controls over value-inferred", () => {
    const types: Record<string, ManifestControl> = {
      variant: { name: "variant", kind: "radio", options: ["primary", "secondary"] },
    };
    const out = mergeControls(fixtures, types);
    expect(out).toContainEqual({
      name: "variant",
      kind: "radio",
      options: ["primary", "secondary"],
    });
    // label/count have no type info -> value fallback (text/number).
    expect(out).toContainEqual({ name: "label", kind: "text" });
    expect(out).toContainEqual({ name: "count", kind: "number" });
  });

  it("preserves first-seen prop order across fixtures", () => {
    const out = mergeControls(fixtures, {});
    expect(out.map((c) => c.name)).toEqual(["variant", "label", "count"]);
  });

  it("with no type info, equals deriveControls output", () => {
    const out = mergeControls(fixtures, {});
    expect(out).toEqual([
      { name: "variant", kind: "text" },
      { name: "label", kind: "text" },
      { name: "count", kind: "number" },
    ]);
  });

  it("appends typed props no fixture exercises, after fixture props", () => {
    const types: Record<string, ManifestControl> = {
      variant: { name: "variant", kind: "radio", options: ["primary", "secondary"] },
      size: { name: "size", kind: "select", options: ["sm", "md", "lg"] },
      disabled: { name: "disabled", kind: "boolean" },
    };
    const out = mergeControls(fixtures, types);
    // fixture props first (first-seen order), then type-only props in type order.
    expect(out.map((c) => c.name)).toEqual(["variant", "label", "count", "size", "disabled"]);
    expect(out).toContainEqual({ name: "size", kind: "select", options: ["sm", "md", "lg"] });
    expect(out).toContainEqual({ name: "disabled", kind: "boolean" });
  });
});
