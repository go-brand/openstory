import { describe, expect, it } from "vitest";
import { mergeProps, layoutStyle } from "./preview-host";

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

describe("layoutStyle", () => {
  it("padded adds 1rem breathing room on every side", () => {
    expect(layoutStyle("padded")).toMatchObject({ padding: "1rem" });
  });
  it("centered centers the render and pads it", () => {
    expect(layoutStyle("centered")).toMatchObject({
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem",
    });
  });
  it("fullscreen is flush — no padding", () => {
    expect(layoutStyle("fullscreen")).toEqual({});
  });
});
