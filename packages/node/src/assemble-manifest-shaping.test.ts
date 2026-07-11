import { describe, expect, it } from "vitest";
import { assembleManifest } from "./assemble-manifest";

describe("assembleManifest", () => {
  it("returns components + docs + schemaVersion on the zero-config path", async () => {
    const m = await assembleManifest({
      projectRoot: "/proj",
      resolvedConfigPath: null,
      ssrLoadModule: async () => ({}),
      readFile: () => "",
    });
    expect(m.schemaVersion).toBe(1);
    expect(Array.isArray(m.components)).toBe(true);
    expect(Array.isArray(m.docs)).toBe(true);
  });

  it("applies identity labels from the loaded config", async () => {
    const manifest = await assembleManifest({
      projectRoot: "/tmp/openstory/apps/app",
      resolvedConfigPath: "/tmp/openstory/apps/app/openstory.config.ts",
      ssrLoadModule: async () => ({
        default: { identity: { repository: "GoBrand", workspace: "Web App" } },
      }),
      readFile: () => "",
    });

    expect(manifest.identity.repository.label).toBe("GoBrand");
    expect(manifest.identity.workspace.label).toBe("Web App");
  });
});
