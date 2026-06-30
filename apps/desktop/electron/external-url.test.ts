import { describe, expect, it } from "vitest";
import { allowedExternalUrl } from "./external-url";

describe("allowedExternalUrl", () => {
  it("allows http, https, and mailto", () => {
    expect(allowedExternalUrl("https://anthropic.com")).toBe("https://anthropic.com/");
    expect(allowedExternalUrl("http://x.test/a")).toBe("http://x.test/a");
    expect(allowedExternalUrl("mailto:a@b.com")).toBe("mailto:a@b.com");
  });
  it("rejects dangerous schemes", () => {
    expect(allowedExternalUrl("file:///etc/passwd")).toBeNull();
    expect(allowedExternalUrl("javascript:alert(1)")).toBeNull();
    expect(allowedExternalUrl("data:text/html,<script>")).toBeNull();
  });
  it("rejects malformed input", () => {
    expect(allowedExternalUrl("not a url")).toBeNull();
    expect(allowedExternalUrl("")).toBeNull();
  });
});
