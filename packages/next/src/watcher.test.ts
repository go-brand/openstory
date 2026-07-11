import { describe, expect, it } from "vitest";
import { isRelevantManifestEvent } from "./watcher.js";

const patterns = ["**/*.stories.{ts,tsx,md}"];

describe("isRelevantManifestEvent", () => {
  it.each(["add", "unlink"] as const)("regenerates for a story %s", (event) => {
    expect(
      isRelevantManifestEvent({
        event,
        path: "src/button.stories.tsx",
        patterns,
        configPath: "openstory.config.ts",
      }),
    ).toBe(true);
  });

  it("leaves edits to existing story modules to Turbopack HMR", () => {
    expect(
      isRelevantManifestEvent({
        event: "change",
        path: "src/button.stories.tsx",
        patterns,
        configPath: "openstory.config.ts",
      }),
    ).toBe(false);
  });

  it.each(["add", "change", "unlink"] as const)("refreshes the manifest for a doc %s", (event) => {
    expect(
      isRelevantManifestEvent({
        event,
        path: "src/button.stories.md",
        patterns,
        configPath: "openstory.config.ts",
      }),
    ).toBe(true);
  });

  it("regenerates when the OpenStory config changes", () => {
    expect(
      isRelevantManifestEvent({
        event: "change",
        path: "openstory.config.ts",
        patterns,
        configPath: "openstory.config.ts",
      }),
    ).toBe(true);
  });

  it("ignores unrelated source files", () => {
    expect(
      isRelevantManifestEvent({
        event: "add",
        path: "src/button.tsx",
        patterns,
        configPath: "openstory.config.ts",
      }),
    ).toBe(false);
  });
});
