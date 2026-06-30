import { describe, expect, it, vi } from "vitest";
import { parseDoc, discoverDocs } from "./discover-docs.js";

const DOC = `---
title: Notifications
status: shipped
group: Features
owner: growth
---

# Notifications

Users get a bell.

:::story notification-bell--unread
`;

describe("parseDoc", () => {
  it("reads frontmatter and renders markdown", () => {
    const d = parseDoc(DOC, "/p/Notifications.stories.md");
    expect(d.title).toBe("Notifications");
    expect(d.status).toBe("shipped");
    expect(d.group).toBe("Features");
    expect(d.owner).toBe("growth");
    expect(d.html).toContain("<h1>Notifications</h1>");
  });

  it("turns :::story into a placeholder div and collects the embed", () => {
    const d = parseDoc(DOC, "/p/Notifications.stories.md");
    expect(d.embeds).toEqual(["notification-bell--unread"]);
    expect(d.html).toContain('data-openstory-story="notification-bell--unread"');
  });

  it("defaults id/title from the filename when frontmatter is absent", () => {
    const d = parseDoc("# Hi\n\nbody", "/p/Billing-Dunning.stories.md");
    expect(d.id).toBe("billing-dunning");
    expect(d.title).toBe("Billing Dunning");
    expect(d.group).toBe("");
    expect(d.embeds).toEqual([]);
  });

  it("leaves a non-directive ::: line alone", () => {
    const d = parseDoc("::: not a directive", "/p/X.stories.md");
    expect(d.embeds).toEqual([]);
  });
});

describe("discoverDocs", () => {
  it("reads each file and parses it", () => {
    const read = vi.fn(() => DOC);
    const docs = discoverDocs(["/p/Notifications.stories.md"], read);
    expect(read).toHaveBeenCalledWith("/p/Notifications.stories.md");
    expect(docs).toHaveLength(1);
    expect(docs[0]!.id).toBe("notifications");
  });
});

describe("discoverDocs link resolution", () => {
  it("rewrites a sibling-doc link to an openstory:page href", () => {
    const files = ["/p/a.stories.md", "/p/b.stories.md"];
    const read = (f: string) =>
      f.endsWith("a.stories.md") ? "# A\n\n[to B](./b.stories.md)\n" : "# B\n";
    const docs = discoverDocs(files, read);
    const a = docs.find((d) => d.id === "a")!;
    expect(a.html).toContain('href="openstory:page/b"');
  });

  it("rewrites a component link (+fragment) to docs/story hrefs and warns on a miss", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const components = new Map([
      ["/p/button.stories.tsx", { id: "button", storyIds: new Set(["primary"]) }],
    ]);
    const read = () =>
      "# Doc\n\n[docs](./button.stories.tsx) [story](./button.stories.tsx#primary) [bad](./button.stories.tsx#nope)\n";
    const docs = discoverDocs(["/p/doc.stories.md"], read, components);
    const html = docs[0]!.html;
    expect(html).toContain('href="openstory:docs/button"');
    expect(html).toContain('href="openstory:story/button/primary"');
    expect(html).toContain('class="openstory-doc-deadlink"');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("unresolved link"));
    warn.mockRestore();
  });

  it("keeps an external link with rel=noopener", () => {
    const read = () => "# Doc\n\n[site](https://anthropic.com)\n";
    const docs = discoverDocs(["/p/doc.stories.md"], read);
    expect(docs[0]!.html).toContain('href="https://anthropic.com" rel="noopener noreferrer"');
  });
});
