import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePatterns, globToRegExp, discoverComponents } from "./discover";

describe("resolvePatterns", () => {
  it("defaults to **/*.stories.{ts,tsx} when no config or no stories field", () => {
    expect(resolvePatterns(null)).toEqual(["**/*.stories.{ts,tsx}"]);
    expect(resolvePatterns({ components: [] })).toEqual(["**/*.stories.{ts,tsx}"]);
  });

  it("uses the config's stories patterns when provided", () => {
    expect(resolvePatterns({ stories: ["src/**/*.stories.tsx"] })).toEqual([
      "src/**/*.stories.tsx",
    ]);
  });
});

describe("globToRegExp", () => {
  it("matches **, *, and {a,b} against POSIX-relative paths", () => {
    const re = globToRegExp("**/*.stories.{ts,tsx}");
    expect(re.test("button.stories.tsx")).toBe(true);
    expect(re.test("src/ui/button.stories.ts")).toBe(true);
    expect(re.test("src/ui/button.tsx")).toBe(false);
    expect(re.test("src/ui/button.stories.jsx")).toBe(false);
  });

  it("respects a leading path segment", () => {
    const re = globToRegExp("src/**/*.stories.tsx");
    expect(re.test("src/a/b/x.stories.tsx")).toBe(true);
    expect(re.test("test/x.stories.tsx")).toBe(false);
  });
});

describe("discoverComponents", () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "os-disc-"));
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "button.stories.tsx"), "//");
    writeFileSync(join(root, "src", "meta.stories.tsx"), "//"); // a Storybook-like file
    writeFileSync(join(root, "src", "plain.tsx"), "//"); // not a story file
    mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(root, "node_modules", "pkg", "x.stories.tsx"), "//"); // must be ignored
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("walks, matches, loads, keeps valid defineStories, skips invalid, defaults sourcePath", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const load = async (abs: string) => {
      if (abs.endsWith("button.stories.tsx")) {
        return { default: { id: "button", name: "Button", component: () => null, fixtures: [] } };
      }
      return { default: { component: () => null, title: "Meta" } }; // not a defineStories
    };
    const found = await discoverComponents(root, ["**/*.stories.{ts,tsx}"], load);
    expect(found.map((c) => c.id)).toEqual(["button"]);
    expect(found[0]?.sourcePath).toBe(join(root, "src", "button.stories.tsx"));
    expect(warn).toHaveBeenCalled(); // skipped meta.stories.tsx
    warn.mockRestore();
  });
});
