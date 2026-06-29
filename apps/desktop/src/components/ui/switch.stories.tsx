import { defineStories } from "@gobrand/openstory-config";
import { Switch } from "./switch";

export default defineStories({
  component: Switch,
  group: "Design System/Controls",
  sourcePath: "src/components/ui/switch.tsx",
  stories: {
    Off: {},
    On: { defaultChecked: true },
    Disabled: { args: { disabled: true }, label: "Disabled (off)" },
    DisabledOn: { args: { defaultChecked: true, disabled: true }, label: "Disabled (on)" },
  },
});
