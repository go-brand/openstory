import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure logic modules only (renderer build-tree/search + main-process
    // selection reconcile) — no DOM needed.
    environment: "node",
    include: ["src/**/*.test.ts", "electron/**/*.test.ts"],
  },
});
