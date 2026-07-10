import { describe, expect, it } from "vitest";
import type { ProjectRecord } from "./types";
import type { ViteHostStatus } from "./vite-host";
import { shouldApplyManifestResponse } from "./manifest-request";

const project = {
  id: "app",
  path: "/repo/apps/app",
} as ProjectRecord;

describe("shouldApplyManifestResponse", () => {
  it("accepts only the project and Vite port captured when the request started", () => {
    const request = {
      projectId: "app",
      projectPath: "/repo/apps/app",
      port: 4100,
      generation: 3,
    };
    const ready = { status: "ready", port: 4100, error: null } satisfies ViteHostStatus;

    expect(shouldApplyManifestResponse(request, project, ready, 3, undefined)).toBe(true);
    expect(
      shouldApplyManifestResponse(request, { ...project, id: "admin" }, ready, 3, undefined),
    ).toBe(false);
    expect(
      shouldApplyManifestResponse(
        request,
        project,
        { status: "ready", port: 4200, error: null },
        3,
        undefined,
      ),
    ).toBe(false);
    expect(
      shouldApplyManifestResponse(
        request,
        project,
        { status: "starting", port: null, error: null },
        3,
        undefined,
      ),
    ).toBe(false);
    expect(shouldApplyManifestResponse(request, project, ready, 4, undefined)).toBe(false);
  });

  it("rejects a resolved identity for a different workspace root", () => {
    const request = {
      projectId: "app",
      projectPath: "/repo/apps/app",
      port: 4100,
      generation: 3,
    };
    const ready = { status: "ready", port: 4100, error: null } satisfies ViteHostStatus;

    expect(
      shouldApplyManifestResponse(
        request,
        project,
        ready,
        3,
        {
          repository: { label: "Repo", slug: null, rootPath: "/other" },
          workspace: { label: "App", relativePath: "apps/app", rootPath: "/other/apps/app" },
          source: "automatic",
        },
      ),
    ).toBe(false);
  });
});
