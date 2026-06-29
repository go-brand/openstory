import { defineStories } from "@gobrand/openstory-config";
import { Button, type ButtonProps } from "./button";

// Auto-discovered (no manual registration). Each key becomes a story:
// the id is the kebab-cased key, the value is the component's props.
export default defineStories<ButtonProps>({
  id: "button",
  component: Button,
  group: "Design System",
  sourcePath: "./src/ui/button.tsx",
  stories: {
    Primary: { variant: "primary", children: "Save changes" },
    Secondary: { variant: "secondary", children: "Cancel" },
    Ghost: { variant: "ghost", children: "Learn more" },
    Danger: { variant: "danger", children: "Delete" },
    Large: { variant: "primary", size: "lg", children: "Get started" },
    Disabled: { variant: "primary", children: "Saving…", disabled: true },
  },
});
