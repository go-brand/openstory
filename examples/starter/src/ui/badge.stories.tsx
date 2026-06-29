import { defineStories } from "@gobrand/openstory-config";
import { Badge, type BadgeProps } from "./badge";

// `preset: "panel"` is declared in openstory.config.ts — it renders these on a
// narrower, tinted canvas. A story with no preset uses the neutral `default`.
export default defineStories<BadgeProps>({
  id: "badge",
  component: Badge,
  group: "Design System",
  preset: "panel",
  sourcePath: "./src/ui/badge.tsx",
  stories: {
    Neutral: { tone: "neutral", children: "Draft" },
    Success: { tone: "success", children: "Shipped" },
    Warning: { tone: "warning", children: "Deprecated" },
    Danger: { tone: "danger", children: "Breaking" },
  },
});
