import { describe, expect, it, vi } from "vitest";
import type { ProjectRecord } from "./types";
import { addProjectPaths, addProjectPathsAndBroadcast } from "./project-actions";

describe("addProjectPaths", () => {
  it("creates requested records and performs one batch store call", () => {
    const records = [{ id: "app" }, { id: "admin" }] as ProjectRecord[];
    const addProjects = vi.fn((incoming: ProjectRecord[]) => incoming);
    const create = vi
      .fn<(path: string) => ProjectRecord>()
      .mockReturnValueOnce(records[0]!)
      .mockReturnValueOnce(records[1]!);

    expect(
      addProjectPaths({ addProjects }, ["/repo/apps/app", "/repo/apps/admin"], create),
    ).toEqual(records);
    expect(create.mock.calls).toEqual([["/repo/apps/app"], ["/repo/apps/admin"]]);
    expect(addProjects).toHaveBeenCalledOnce();
    expect(addProjects).toHaveBeenCalledWith(records);
  });

  it("broadcasts once after a batch add", () => {
    const record = { id: "app" } as ProjectRecord;
    const addProjects = vi.fn(() => [record]);
    const broadcast = vi.fn();

    expect(
      addProjectPathsAndBroadcast({ addProjects }, ["/repo/apps/app"], broadcast, () => record),
    ).toEqual([record]);
    expect(addProjects).toHaveBeenCalledOnce();
    expect(broadcast).toHaveBeenCalledOnce();
  });
});
