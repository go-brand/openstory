import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineOpenStoryConfig, deriveControls } from "@gobrand/openstory-config";
import type { ManifestDoc } from "@gobrand/openstory-config";
import { buildHarnessEntry, stripMarkdownPatterns } from "./harness-loader";
import { buildManifest } from "./plugin";

describe("buildHarnessEntry", () => {
  it("imports the consumer config and mounts the runtime", () => {
    const code = buildHarnessEntry("/abs/path/openstory.config.ts");
    expect(code).toContain("from '@gobrand/openstory-runtime'");
    expect(code).toContain("from '/abs/path/openstory.config.ts'");
    expect(code).toContain("mountPreviewHost");
  });

  it("can import the runtime from a plugin-resolved file path", () => {
    const code = buildHarnessEntry(
      "/abs/path/openstory.config.ts",
      [],
      ["**/*.stories.{ts,tsx}"],
      "/@fs/abs/node_modules/@gobrand/openstory-runtime/dist/index.js",
    );
    expect(code).toContain("from '/@fs/abs/node_modules/@gobrand/openstory-runtime/dist/index.js'");
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

  it("drops markdown-only patterns from the browser harness glob", () => {
    expect(stripMarkdownPatterns(["**/*.stories.{ts,tsx,md}", "**/*.stories.{md}"])).toEqual([
      "**/*.stories.{ts,tsx}",
    ]);
    expect(stripMarkdownPatterns(["**/*.stories.md"])).toEqual([]);
  });
});

describe("package dependencies", () => {
  it("declares the runtime package because the virtual harness imports it", () => {
    const pkgPath = resolve(fileURLToPath(new URL("..", import.meta.url)), "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      dependencies?: Record<string, string>;
    };

    expect(pkg.dependencies).toHaveProperty("@gobrand/openstory-runtime");
  });
});

describe("buildManifest", () => {
  it("includes resolved project identity", () => {
    const manifest = buildManifest(
      defineOpenStoryConfig({
        identity: { repository: "GoBrand", workspace: "Web App" },
        components: [],
      }),
      "/tmp/openstory/apps/app",
    );

    expect(manifest.identity.repository.label).toBe("GoBrand");
    expect(manifest.identity.workspace.label).toBe("Web App");
    expect(manifest.identity.workspace.rootPath).toBe("/tmp/openstory/apps/app");
  });

  it("emits stories with props and inferred controls", () => {
    const config = defineOpenStoryConfig({
      // Presets are project-defined (OpenStory ships only `default`).
      presets: {
        linkedin: {
          viewport: { desktop: { width: 552 }, mobile: { width: 360 } },
          chrome: { background: "#f3f2ef" },
        },
      },
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
    expect(buildManifest(config)).toMatchObject({ schemaVersion: 1, components: [], docs: [] });
    expect(buildManifest(config).identity.workspace.rootPath).toBeTruthy();
  });

  it("carries schemaVersion 1", () => {
    expect(buildManifest(defineOpenStoryConfig({ components: [] })).schemaVersion).toBe(1);
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
      stories: [],
      controls: [],
      sourcePath: null,
    });
  });

  it("emits preview padding for components and stories", () => {
    const config = defineOpenStoryConfig({
      components: [
        {
          id: "slider",
          component: () => null,
          fixtures: [{ id: "default", label: "Default", props: {}, previewPadding: { top: 12 } }],
          previewPadding: { top: 8 },
        },
      ],
    });

    const slider = buildManifest(config).components[0];
    expect(slider?.previewPadding).toEqual({ top: 8 });
    expect(slider?.stories[0]?.previewPadding).toEqual({ top: 12 });
  });

  it("derives a section from a monorepo sourcePath", () => {
    const root = mkdtempSync(resolve(tmpdir(), "openstory-manifest-workspace-"));
    const projectRoot = resolve(root, "apps/app");
    mkdirSync(resolve(projectRoot, "src"), { recursive: true });
    writeFileSync(resolve(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n");
    writeFileSync(resolve(root, "package.json"), JSON.stringify({ private: true }));
    writeFileSync(resolve(projectRoot, "package.json"), JSON.stringify({ name: "app" }));
    writeFileSync(resolve(projectRoot, "src/Card.tsx"), "export const Card = () => null;\n");

    try {
      const config = defineOpenStoryConfig({
        components: [
          { id: "Card", component: () => null, fixtures: [], sourcePath: "./src/Card.tsx" },
        ],
      });
      expect(buildManifest(config, projectRoot).components[0]?.section).toBe("app");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it(
    "buildManifest derives a select control from prop types",
    () => {
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
    },
    15_000,
  );
});

describe("buildManifest docs", () => {
  it("passes docs through onto the manifest", () => {
    const docs: ManifestDoc[] = [
      {
        id: "notifications",
        title: "Notifications",
        group: "Features",
        section: null,
        html: "<h1>x</h1>",
        embeds: [],
        sourcePath: "/p/N.stories.md",
      },
    ];
    const m = buildManifest({ components: [] }, "/p", docs);
    expect(m.docs).toEqual(docs);
  });
  it("defaults docs to [] when omitted", () => {
    const m = buildManifest({ components: [] }, "/p");
    expect(m.docs).toEqual([]);
  });
});

describe("stripMarkdownPatterns", () => {
  it("removes md from a brace alternation", () => {
    expect(stripMarkdownPatterns(["**/*.stories.{ts,tsx,md}"])).toEqual(["**/*.stories.{ts,tsx}"]);
  });
  it("drops a pure .md pattern entirely", () => {
    expect(stripMarkdownPatterns(["**/*.stories.md", "**/*.stories.tsx"])).toEqual([
      "**/*.stories.tsx",
    ]);
  });
});
