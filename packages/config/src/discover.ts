import type { RegisteredComponent } from "./define.js";

// A discovered/registered component is distinguished from a Storybook CSF `Meta`
// (which has `component` + `title` but no `fixtures`) by its `fixtures` array.
export function isRegisteredComponent(value: unknown): value is RegisteredComponent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" && "component" in v && v.component != null && Array.isArray(v.fixtures)
  );
}

// Merge discovered + explicitly-registered components, de-duped by id. Explicit
// components win a collision (escape hatch overrides discovery). A duplicate among
// the discovered set keeps the first and warns (ids must be unique — set an
// explicit `id` on same-named components).
export function mergeComponents(
  discovered: RegisteredComponent[],
  explicit: RegisteredComponent[],
): RegisteredComponent[] {
  const byId = new Map<string, RegisteredComponent>();
  for (const c of discovered) {
    if (byId.has(c.id)) {
      console.warn(
        `[openstory] two discovered components resolve to id "${c.id}"; keeping the first. Set an explicit \`id\` to disambiguate.`,
      );
      continue;
    }
    byId.set(c.id, c);
  }
  for (const c of explicit) byId.set(c.id, c);
  return [...byId.values()];
}
