import { describe, it, expect } from "vitest";
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
});

describe("buildManifest", () => {
  it("emits variants with props and inferred controls", () => {
    const config = defineOpenStoryConfig({
      previews: [
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
    expect(manifest.previews[0]).toEqual({
      id: "linkedin",
      group: "LinkedIn",
      background: "#f3f2ef",
      variants: [
        { id: "a", label: "A", props: { text: "hi", dark: true } },
        { id: "b", label: "B", props: { text: "yo" } },
      ],
      controls: deriveControls(config.previews[0].fixtures),
      sourcePath: null,
    });
  });

  it("resolves a relative sourcePath against the project root", () => {
    const config = defineOpenStoryConfig({
      previews: [
        {
          id: "linkedin",
          component: () => null,
          fixtures: [],
          sourcePath: "./src/previews/linkedin.tsx",
        },
      ],
    });
    const manifest = buildManifest(config, "/project");
    expect(manifest.previews[0]?.sourcePath).toBe("/project/src/previews/linkedin.tsx");
  });

  it("leaves sourcePath null when no project root is provided", () => {
    const config = defineOpenStoryConfig({
      previews: [
        {
          id: "linkedin",
          component: () => null,
          fixtures: [],
          sourcePath: "./x.tsx",
        },
      ],
    });
    expect(buildManifest(config).previews[0]?.sourcePath).toBeNull();
  });

  it("returns no previews for an empty config", () => {
    const config = defineOpenStoryConfig({ previews: [] });
    expect(buildManifest(config)).toEqual({ previews: [] });
  });

  it("emits empty variants and controls for a preview with zero fixtures", () => {
    const config = defineOpenStoryConfig({
      previews: [
        {
          id: "linkedin",
          component: () => null,
          fixtures: [],
        },
      ],
    });
    expect(buildManifest(config).previews[0]).toEqual({
      id: "linkedin",
      group: "",
      background: "#f4f4f5",
      variants: [],
      controls: [],
      sourcePath: null,
    });
  });
});
