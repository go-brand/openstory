import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
  {
    variants: {
      variant: {
        idle: "bg-accent text-foreground",
        ready: "bg-green-600/20 text-green-400",
        starting: "bg-yellow-600/20 text-yellow-400",
        error: "bg-red-600/20 text-red-400",
      },
    },
    defaultVariants: { variant: "idle" },
  },
);

type BadgeProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
