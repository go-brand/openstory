import { describe, it, expect, vi } from "vitest";
import { isRegisteredComponent, mergeComponents } from "./discover";
import type { RegisteredComponent } from "./define";

function reg(id: string, name = id): RegisteredComponent {
  return { id, name, component: (() => null) as never, fixtures: [] };
}

describe("isRegisteredComponent", () => {
  it("accepts a defineStories-shaped object", () => {
    expect(isRegisteredComponent(reg("button"))).toBe(true);
  });

  it("rejects a Storybook Meta-like object (has component+title, no fixtures)", () => {
    expect(isRegisteredComponent({ component: () => null, title: "Button" })).toBe(false);
  });

  it("rejects non-objects and null", () => {
    expect(isRegisteredComponent(null)).toBe(false);
    expect(isRegisteredComponent(42)).toBe(false);
    expect(isRegisteredComponent(undefined)).toBe(false);
  });
});

describe("mergeComponents", () => {
  it("merges discovered + explicit, de-duped by id, explicit wins", () => {
    const discovered = [reg("a"), reg("b")];
    const explicit = [reg("b", "B-explicit"), reg("c")];
    const merged = mergeComponents(discovered, explicit);
    expect(merged.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(merged.find((c) => c.id === "b")?.name).toBe("B-explicit");
  });

  it("warns and keeps the first on a duplicate discovered id", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const merged = mergeComponents([reg("a", "first"), reg("a", "second")], []);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.name).toBe("first");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
