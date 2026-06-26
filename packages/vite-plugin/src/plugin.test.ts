import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineOpenStoryConfig, deriveControls } from "@gobrand/openstory-config";
import { buildHarnessEntry } from "./harness-loader";
import { buildManifest } from "./plugin";

describe("buildHarnessEntry", () => {
  it("imports the consumer config and mounts the runtime", () => {
    const code = buildHarnessEntry("/abs/path/openstory.config.ts");
    expect(code).toContain("from '@gobrand/openstory-runtime'");
    expect(code).toContain("from '/abs/path/openstory.config.ts'");
    expect(code).toContain("mountPreviewHost");
  });

  it("normalizes Windows backslash paths to forward slashes", () => {
    const code = buildHarnessEntry("C:\\Users\\me\\proj\\openstory.config.ts");
    expect(code).toContain("from 'C:/Users/me/proj/openstory.config.ts'");
    expect(code).not.toContain("\\");
  });

  it("side-effect-imports the configured styles before the runtime", () => {
    const code = buildHarnessEntry("/abs/openstory.config.ts", ["/abs/src/styles.css"]);
    expect(code).toContain("import '/abs/src/styles.css'");
    // CSS must precede the runtime/config imports so it lands in the graph.
    expect(code.indexOf("import '/abs/src/styles.css'")).toBeLessThan(
      code.indexOf("@gobrand/openstory-runtime"),
    );
  });

  it("normalizes backslashes in style paths", () => {
    const code = buildHarnessEntry("/abs/openstory.config.ts", ["C:\\proj\\src\\styles.css"]);
    expect(code).toContain("import 'C:/proj/src/styles.css'");
    expect(code).not.toContain("\\");
  });

  it("emits no style imports when none are configured", () => {
    const code = buildHarnessEntry("/abs/openstory.config.ts");
    expect(code).not.toContain(".css");
  });

  it("emits an import.meta.glob over the resolved patterns and merges discovered + config", () => {
    const code = buildHarnessEntry("/abs/openstory.config.ts", [], ["**/*.stories.{ts,tsx}"]);
    expect(code).toContain("import.meta.glob");
    expect(code).toContain("/**/*.stories.{ts,tsx}"); // root-relative form for Vite
    expect(code).toContain("mergeComponents");
    expect(code).toContain("isRegisteredComponent");
    expect(code).toContain("from '/abs/openstory.config.ts'");
  });

  it("works with no config file (zero-config discovery)", () => {
    const code = buildHarnessEntry(null, [], ["**/*.stories.{ts,tsx}"]);
    expect(code).toContain("const userConfig = {}");
    expect(code).toContain("import.meta.glob");
    expect(code).not.toContain("openstory.config");
  });
});

describe("buildManifest", () => {
  it("emits stories with props and inferred controls", () => {
    const config = defineOpenStoryConfig({
      components: [
        {
          id: "linkedin",
          group: "LinkedIn",
          preset: "linkedin",
          component: () => null,
          fixtures: [
            { id: "a", label: "A", props: { text: "hi", dark: true } },
            { id: "b", label: "B", props: { text: "yo" } },
          ],
        },
      ],
    });
    const manifest = buildManifest(config);
    expect(manifest.components[0]).toEqual({
      id: "linkedin",
      name: "linkedin",
      group: "LinkedIn",
      section: null,
      background: "#f3f2ef",
      layout: "padded",
      stories: [
        { id: "a", label: "A", props: { text: "hi", dark: true } },
        { id: "b", label: "B", props: { text: "yo" } },
      ],
      controls: deriveControls(config.components[0].fixtures),
      sourcePath: null,
    });
  });

  it("resolves a relative sourcePath against the project root", () => {
    const config = defineOpenStoryConfig({
      components: [
        {
          id: "linkedin",
          component: () => null,
          fixtures: [],
          sourcePath: "./src/components/linkedin.tsx",
        },
      ],
    });
    const manifest = buildManifest(config, "/project");
    expect(manifest.components[0]?.sourcePath).toBe("/project/src/components/linkedin.tsx");
  });

  it("leaves sourcePath null when no project root is provided", () => {
    const config = defineOpenStoryConfig({
      components: [
        {
          id: "linkedin",
          component: () => null,
          fixtures: [],
          sourcePath: "./x.tsx",
        },
      ],
    });
    expect(buildManifest(config).components[0]?.sourcePath).toBeNull();
  });

  it("returns no components for an empty config", () => {
    const config = defineOpenStoryConfig({ components: [] });
    expect(buildManifest(config)).toEqual({ components: [] });
  });

  it("emits empty stories and controls for a preview with zero fixtures", () => {
    const config = defineOpenStoryConfig({
      components: [
        {
          id: "linkedin",
          component: () => null,
          fixtures: [],
        },
      ],
    });
    expect(buildManifest(config).components[0]).toEqual({
      id: "linkedin",
      name: "linkedin",
      group: "",
      section: null,
      background: "#f4f4f5",
      layout: "padded",
      stories: [],
      controls: [],
      sourcePath: null,
    });
  });

  it("emits layout — defaulting to padded, passing an explicit value through", () => {
    const config = defineOpenStoryConfig({
      components: [
        { id: "a", component: () => null, fixtures: [] },
        { id: "b", component: () => null, fixtures: [], layout: "centered" },
      ],
    });
    const [a, b] = buildManifest(config).components;
    expect(a?.layout).toBe("padded");
    expect(b?.layout).toBe("centered");
  });

  it("derives a section from a monorepo sourcePath", () => {
    // This repo IS a pnpm monorepo; resolve a real file under apps/desktop.
    const config = defineOpenStoryConfig({
      components: [
        { id: "x", component: () => null, fixtures: [], sourcePath: "./electron/types.ts" },
      ],
    });
    // projectRoot = apps/desktop → workspace member basename "desktop".
    const root = new URL("../../../apps/desktop", import.meta.url).pathname;
    expect(buildManifest(config, root).components[0]?.section).toBe("desktop");
  });

  it("buildManifest derives a select control from prop types", () => {
    const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "__fixtures__/types");
    const config = {
      components: [
        {
          id: "button",
          name: "Button",
          component: (() => null) as any,
          sourcePath: "button.tsx",
          fixtures: [{ id: "p", label: "P", props: { variant: "primary", label: "Hi" } }],
        },
      ],
    };
    const manifest = buildManifest(config as any, root);
    const controls = manifest.components[0].controls;
    expect(controls).toContainEqual({
      name: "variant",
      kind: "select",
      options: ["primary", "secondary", "ghost", "danger", "link", "subtle"],
    });
    // `label` is a plain string prop -> text.
    expect(controls).toContainEqual({ name: "label", kind: "text" });
  });
});
