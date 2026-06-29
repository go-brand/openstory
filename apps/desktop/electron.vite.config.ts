import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve(__dirname, "electron/main.ts"),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        output: {
          format: "cjs",
          entryFileNames: "preload.cjs",
        },
      },
      lib: {
        entry: resolve(__dirname, "electron/preload.ts"),
      },
    },
  },
  renderer: {
    root: ".",
    // Pre-bundle the renderer's deps up front. Otherwise Vite discovers them
    // lazily (e.g. only once the project/Select path renders), re-optimizes
    // mid-session, and force-reloads the window — which briefly tears down React
    // and surfaces a transient "Invalid hook call" before the reload settles.
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "class-variance-authority",
        "tailwind-merge",
        "@hugeicons/react",
        "@hugeicons/core-free-icons",
      ],
    },
    build: {
      rollupOptions: {
        input: {
          hud: resolve(__dirname, "index.html"),
        },
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
