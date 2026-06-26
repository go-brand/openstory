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
