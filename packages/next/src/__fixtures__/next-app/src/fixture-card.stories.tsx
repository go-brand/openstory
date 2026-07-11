import { defineStories } from "@gobrand/openstory-config";
import { FixtureCard } from "@fixture/card";

export default defineStories({
  id: "fixture-card",
  component: FixtureCard,
  stories: {
    Primary: { label: "Rendered by Turbopack" },
  },
});
