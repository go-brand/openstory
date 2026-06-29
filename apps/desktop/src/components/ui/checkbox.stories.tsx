import { defineStories } from "@gobrand/openstory-config";
import { Checkbox } from "./checkbox";

export default defineStories({
  component: Checkbox,
  group: "Design System/Controls",
  sourcePath: "src/components/ui/checkbox.tsx",
  stories: {
    Unchecked: {},
    Checked: { defaultChecked: true },
    Disabled: { args: { disabled: true }, label: "Disabled (unchecked)" },
    DisabledChecked: {
      args: { defaultChecked: true, disabled: true },
      label: "Disabled (checked)",
    },
  },
});
