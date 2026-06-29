import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-lg text-[12px] font-medium transition-all duration-150 ease-out focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:outline-none active:translate-y-px disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-brand text-primary-foreground hover:bg-brand/90",
        secondary: "bg-foreground/[0.05] text-foreground hover:bg-foreground/[0.09]",
        ghost: "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
        active: "bg-brand-soft text-brand hover:bg-brand-soft",
      },
      size: {
        sm: "h-7 px-2.5 text-[11px]",
        md: "h-8 px-3",
        lg: "h-9 px-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
