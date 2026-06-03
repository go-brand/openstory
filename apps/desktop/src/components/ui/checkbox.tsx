import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import type { ComponentProps } from "react";
import { cn } from "../../lib/utils";
import { HugeiconsIcon, Tick02Icon } from "../../lib/icons";

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer h-4 w-4 shrink-0 rounded-sm border border-input bg-accent focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:outline-none data-[state=checked]:border-blue-600 data-[state=checked]:bg-blue-600",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-primary-foreground">
        <HugeiconsIcon icon={Tick02Icon} className="h-3 w-3" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
