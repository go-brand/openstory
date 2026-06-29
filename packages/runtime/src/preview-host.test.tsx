import { describe, expect, it } from "vitest";
import { mergeProps } from "./preview-host";

describe("mergeProps", () => {
  it("overrides preset props with fixture overrides", () => {
    expect(mergeProps({ text: "preset", author: "a" }, { text: "edited" })).toEqual({
      text: "edited",
      author: "a",
    });
  });
  it("returns preset props unchanged when no overrides", () => {
    expect(mergeProps({ text: "preset" }, undefined)).toEqual({
      text: "preset",
    });
  });
});
