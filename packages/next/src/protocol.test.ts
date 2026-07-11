import { describe, expect, it } from "vitest";
import { createProtocolReporter } from "./protocol.js";

describe("createProtocolReporter", () => {
  it("writes machine-readable ready, manifest, and error events", () => {
    const lines: string[] = [];
    const reporter = createProtocolReporter((line) => lines.push(line));

    reporter.ready(4123);
    reporter.ready(9999);
    reporter.manifestChanged();
    reporter.error(new Error("compile failed"));

    expect(lines.map((line) => JSON.parse(line))).toEqual([
      { type: "ready", adapter: "next", port: 4123 },
      { type: "manifest-changed", adapter: "next" },
      { type: "error", adapter: "next", message: "compile failed" },
    ]);
  });
});
