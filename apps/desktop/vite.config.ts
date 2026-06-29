import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { openStory } from "@gobrand/openstory-vite";

// Plain Vite config used ONLY when the OpenStory manager opens this folder as a
// project: ViteHost does `createServer({ root, mode: 'openstory' })`, which loads
// this file. The Electron build uses electron.vite.config.ts (electron-vite loads
// that one explicitly), so the two never collide.
//
// This is how OpenStory dogfoods its OWN design system: open `apps/desktop` in the
// app and the harness renders these real Base UI primitives — the very components
// the manager's UI is built from — on OpenStory's own canvas, with the manager's
// real Tailwind theme (src/styles.css, auto-detected by the plugin).
export default defineConfig({
  plugins: [react(), tailwindcss(), openStory()],
});
