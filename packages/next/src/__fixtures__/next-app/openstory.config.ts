import { defineOpenStoryConfig } from "@gobrand/openstory-config";
import { FixtureProvider } from "./src/providers";

export default defineOpenStoryConfig({
  identity: { workspace: "Next fixture" },
  providers: FixtureProvider,
  styles: ["./app/globals.css"],
});
