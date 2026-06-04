import type { Variant } from "./variants";

// Plain function component (no React import needed — returns null). The
// extractor reads the first call-signature parameter as the props type.
export function Button(_props: {
  variant: Variant; // imported union, 6 members -> select
  size: "sm" | "md" | "lg"; // inline union, 3 members -> radio
  tone?: "a" | "b"; // optional union -> strip undefined -> radio
  disabled: boolean; // -> boolean
  count: number; // -> number
  label: string; // -> text
  onClick: () => void; // function -> omitted (value fallback)
}) {
  return null;
}
