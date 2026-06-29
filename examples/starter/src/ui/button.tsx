import type { ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
};

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-neutral-900 text-white hover:bg-neutral-700",
  secondary: "bg-neutral-100 text-neutral-900 hover:bg-neutral-200",
  ghost: "bg-transparent text-neutral-900 hover:bg-neutral-100",
  danger: "bg-red-600 text-white hover:bg-red-500",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

/** A minimal design-system button — the kind of component you'd document in OpenStory. */
export function Button({ children, variant = "primary", size = "md", disabled }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]}`}
    >
      {children}
    </button>
  );
}
