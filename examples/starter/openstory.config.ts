import { defineOpenStoryConfig } from "@gobrand/openstory-config";

// Stories (src/**/*.stories.{ts,tsx}) and docs (src/**/*.stories.md) are
// auto-discovered — no manual registration.
export default defineOpenStoryConfig({
  styles: ["./src/styles.css"],
  // A preset is a named render setting: the canvas width(s) a story renders at
  // and the background behind it. OpenStory ships only a neutral `default`
  // (600px desktop / 360px mobile, #f4f4f5); declare your own here. The Badge
  // stories opt into "panel" via `preset: "panel"`.
  presets: {
    panel: {
      viewport: { desktop: { width: 420 }, mobile: { width: 320 } },
      chrome: { background: "#f4f4f5" },
    },
  },
});
