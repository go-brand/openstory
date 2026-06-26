import type { ButtonHTMLAttributes } from "react";

// Mirrors the real-world shape: a component spreads the native button
// attributes and adds its own props. The inherited HTML/DOM attributes
// (type, disabled, formNoValidate, autoFocus, popover…) must NOT leak into the
// controls — only `variant`, `size`, `label` are real authoring knobs.
export function NativeButton(
  _props: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant: "primary" | "secondary";
    size: "sm" | "md" | "lg";
    label: string;
  },
) {
  return null;
}
