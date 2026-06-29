import { defineStories } from "@gobrand/openstory-config";
import { Button } from "./button";

export default defineStories({
  component: Button,
  group: "Design System/Controls",
  sourcePath: "src/components/ui/button.tsx",
  stories: {
    Primary: { variant: "primary", children: "Save changes" },
    Secondary: { variant: "secondary", children: "Cancel" },
    Ghost: { variant: "ghost", children: "Dismiss" },
    Active: { variant: "active", children: "Selected" },
    Large: { variant: "primary", size: "lg", children: "Large action" },
    Small: { variant: "secondary", size: "sm", children: "Small" },
    Disabled: {
      args: { variant: "primary", children: "Save changes", disabled: true },
      label: "Primary (disabled)",
    },
  },
});
