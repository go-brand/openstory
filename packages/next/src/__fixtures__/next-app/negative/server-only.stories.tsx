import "server-only";
import { defineStories } from "@gobrand/openstory-config";
import { FixtureCard } from "@fixture/card";

export default defineStories({
  id: "server-only-card",
  component: FixtureCard,
  stories: { Invalid: { label: "This must not compile as a Client Component" } },
});
