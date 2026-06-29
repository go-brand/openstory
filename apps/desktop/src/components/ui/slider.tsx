import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";

export function Slider({ className, ...props }: ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root className={cn("relative w-full", className)} {...props}>
      <SliderPrimitive.Control className="flex w-full touch-none items-center py-1 select-none">
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-accent">
          <SliderPrimitive.Indicator className="rounded-full bg-blue-600" />
          <SliderPrimitive.Thumb className="block h-3.5 w-3.5 rounded-full border border-border bg-card shadow focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none" />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}
