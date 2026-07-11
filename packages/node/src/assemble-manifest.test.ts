import { describe, expect, it } from "vitest";
import { defineOpenStoryConfig, defineStories } from "@gobrand/openstory-config";
import { assembleLoadedManifest } from "./assemble-manifest";

function Button() {
  return null;
}

describe("assembleLoadedManifest", () => {
  it("shapes already-loaded components without a builder module runner", () => {
    const component = defineStories({
      id: "button",
      component: Button,
      sourcePath: "src/button.tsx",
      stories: { Primary: { label: "Continue" } },
    });

    const manifest = assembleLoadedManifest({
      projectRoot: "/repo/apps/web",
      loaded: {
        config: defineOpenStoryConfig({ identity: { workspace: "Web" } }),
        components: [component],
      },
      readFile: () => "",
    });

    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.identity.workspace.label).toBe("Web");
    expect(manifest.components[0]).toMatchObject({ id: "button", name: "Button" });
  });
});
