import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveSection } from "./derive-section";

let root: string;

beforeAll(() => {
  // Build a temp pnpm monorepo:
  //   <root>/pnpm-workspace.yaml
  //   <root>/package.json
  //   <root>/apps/app/package.json + src/Card.tsx
  //   <root>/packages/ui/package.json + src/Button.tsx
  root = mkdtempSync(join(tmpdir(), "os-ws-"));
  writeFileSync(join(root, "pnpm-workspace.yaml"), "packages:\n  - apps/*\n  - packages/*\n");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "root", private: true }));
  for (const [dir, file] of [
    ["apps/app", "Card.tsx"],
    ["packages/ui", "Button.tsx"],
  ] as const) {
    mkdirSync(join(root, dir, "src"), { recursive: true });
    writeFileSync(join(root, dir, "package.json"), JSON.stringify({ name: dir }));
    writeFileSync(join(root, dir, "src", file), "export default null;");
  }
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("deriveSection", () => {
  it("returns the workspace package basename for a monorepo member", () => {
    expect(deriveSection(join(root, "apps/app/src/Card.tsx"))).toBe("app");
    expect(deriveSection(join(root, "packages/ui/src/Button.tsx"))).toBe("ui");
  });

  it("returns null when sourcePath is null", () => {
    expect(deriveSection(null)).toBeNull();
  });

  it("returns null for a single-package repo (no workspace markers)", () => {
    const solo = mkdtempSync(join(tmpdir(), "os-solo-"));
    mkdirSync(join(solo, "src"), { recursive: true });
    writeFileSync(join(solo, "package.json"), JSON.stringify({ name: "solo" }));
    writeFileSync(join(solo, "src", "App.tsx"), "export default null;");
    try {
      expect(deriveSection(join(solo, "src/App.tsx"))).toBeNull();
    } finally {
      rmSync(solo, { recursive: true, force: true });
    }
  });

  it("returns null for a component in the workspace root package itself", () => {
    mkdirSync(join(root, "src"), { recursive: true });
    writeFileSync(join(root, "src", "Root.tsx"), "export default null;");
    expect(deriveSection(join(root, "src/Root.tsx"))).toBeNull();
  });
});
