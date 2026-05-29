import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 rounded-md text-[12px] font-medium transition-all duration-150 ease-out focus-visible:ring-1 focus-visible:ring-neutral-500/60 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-indigo-500 text-white shadow-sm shadow-indigo-500/30 hover:bg-indigo-500/90',
        secondary: 'bg-neutral-700/60 text-neutral-100 hover:bg-neutral-700/80',
        ghost:
          'text-neutral-300 hover:bg-neutral-700/40 hover:text-neutral-100',
        active:
          'bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30 ring-inset hover:bg-indigo-500/20',
      },
      size: {
        sm: 'h-7 px-2.5 text-[11px]',
        md: 'h-8 px-3',
        lg: 'h-9 px-3.5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  }
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
