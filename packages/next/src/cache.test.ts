import { mkdtemp, mkdir, realpath, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertRealPathWithin, resolveNextCacheRoot } from "./cache.js";

describe("resolveNextCacheRoot", () => {
  it("is stable, project-specific, and contained by .openstory/cache", async () => {
    const root = await mkdtemp(join(tmpdir(), "openstory-next-cache-"));
    const first = await resolveNextCacheRoot(root);
    const second = await resolveNextCacheRoot(root);

    expect(first).toBe(second);
    expect(first).toMatch(/\.openstory[/\\]cache[/\\]next[/\\][a-f0-9]{16}$/);
  });
});

describe("assertRealPathWithin", () => {
  it("rejects a symlink whose real path escapes the allowed root", async () => {
    const root = await mkdtemp(join(tmpdir(), "openstory-next-root-"));
    const outside = await mkdtemp(join(tmpdir(), "openstory-next-outside-"));
    await writeFile(join(outside, "escaped.stories.tsx"), "export default {};");
    await mkdir(join(root, "src"));
    await symlink(join(outside, "escaped.stories.tsx"), join(root, "src", "escaped.stories.tsx"));

    await expect(
      assertRealPathWithin(join(root, "src", "escaped.stories.tsx"), [root]),
    ).rejects.toThrow(/outside the allowed roots/i);
  });

  it("returns the canonical path for an allowed file", async () => {
    const root = await mkdtemp(join(tmpdir(), "openstory-next-root-"));
    const file = join(root, "button.stories.tsx");
    await writeFile(file, "export default {};");

    await expect(assertRealPathWithin(file, [root])).resolves.toBe(await realpath(file));
  });
});
