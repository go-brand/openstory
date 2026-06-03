import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure logic modules only (build-tree, search) — no DOM needed.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
