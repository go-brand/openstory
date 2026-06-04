import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractPropTypes } from "./extract-prop-types.js";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "__fixtures__/types");
const buttonPath = resolve(root, "button.tsx");

describe("extractPropTypes", () => {
  const info = extractPropTypes(buttonPath, "Button", root);

  it("maps an imported >5 string union to select with options", () => {
    expect(info.variant).toEqual({
      kind: "select",
      options: ["primary", "secondary", "ghost", "danger", "link", "subtle"],
    });
  });

  it("maps an inline <=5 string union to radio with options", () => {
    expect(info.size).toEqual({ kind: "radio", options: ["sm", "md", "lg"] });
  });

  it("strips undefined from an optional union", () => {
    expect(info.tone).toEqual({ kind: "radio", options: ["a", "b"] });
  });

  it("maps primitive props to boolean/number/text", () => {
    expect(info.disabled).toEqual({ kind: "boolean" });
    expect(info.count).toEqual({ kind: "number" });
    expect(info.label).toEqual({ kind: "text" });
  });

  it("omits non-primitive props (function) for value fallback", () => {
    expect(info.onClick).toBeUndefined();
  });

  it("returns {} when the source file is unknown", () => {
    expect(extractPropTypes(resolve(root, "nope.tsx"), "Nope", root)).toEqual({});
  });
});
