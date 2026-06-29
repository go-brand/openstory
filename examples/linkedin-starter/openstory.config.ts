import { defineOpenStoryConfig } from "@gobrand/openstory-config";

// Story files (src/**/*.stories.{ts,tsx}) are auto-discovered — no manual registration.
export default defineOpenStoryConfig({
  styles: ["./src/styles.css"],
  // OpenStory ships only a neutral `default` preset; a project defines the
  // render widths/backgrounds it needs. This example renders LinkedIn posts, so
  // it declares a "linkedin" preset (the stories reference it via `preset`).
  presets: {
    linkedin: {
      viewport: { desktop: { width: 552 }, mobile: { width: 360 } },
      chrome: { background: "#f3f2ef" },
    },
  },
});
