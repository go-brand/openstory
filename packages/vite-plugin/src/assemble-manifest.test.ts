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
});
