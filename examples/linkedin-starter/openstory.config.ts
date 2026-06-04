import { defineOpenStoryConfig } from "@gobrand/openstory-config";

// Story files (src/**/*.stories.{ts,tsx}) are auto-discovered — no manual registration.
export default defineOpenStoryConfig({
  styles: ["./src/styles.css"],
});
