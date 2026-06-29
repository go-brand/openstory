import { defineStories } from "@gobrand/openstory-config";
import { Slider } from "./slider";

export default defineStories({
  component: Slider,
  group: "Design System/Controls",
  sourcePath: "src/components/ui/slider.tsx",
  stories: {
    Default: { defaultValue: 50 },
    Low: { defaultValue: 15 },
    High: { defaultValue: 90 },
    Disabled: { args: { defaultValue: 50, disabled: true }, label: "Disabled" },
  },
});
