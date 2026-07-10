import { describe, expect, it } from "vitest";
import { DashboardSquare01Icon, File01Icon } from "../lib/icons";
import { MODE_DESCRIPTORS } from "./mode-switcher";

describe("MODE_DESCRIPTORS", () => {
  it("describes design system and documentation modes in display order", () => {
    expect(MODE_DESCRIPTORS).toEqual([
      {
        mode: "design",
        label: "Design System",
        description: "Browse components and stories",
        icon: DashboardSquare01Icon,
      },
      {
        mode: "docs",
        label: "Documentation",
        description: "Browse project documentation",
        icon: File01Icon,
      },
    ]);
  });
});
