import { describe, expect, it } from "vitest";
import { resolveEmbed } from "./doc-host.js";

function Bell() {
  return null;
}
const components = [
  {
    id: "bell",
    name: "Bell",
    component: Bell,
    fixtures: [{ id: "unread", label: "Unread", props: { tone: "warn" } }],
  },
] as never[];

describe("resolveEmbed", () => {
  it("resolves a known componentId--storyId to its component + fixture props", () => {
    const r = resolveEmbed(components, "bell--unread");
    expect(r?.Comp).toBe(Bell);
    expect(r?.props).toEqual({ tone: "warn" });
  });
  it("returns null for an unknown component or story", () => {
    expect(resolveEmbed(components, "ghost--x")).toBeNull();
    expect(resolveEmbed(components, "bell--missing")).toBeNull();
  });
  it("returns null when the id has no -- separator", () => {
    expect(resolveEmbed(components, "bell")).toBeNull();
  });
});
