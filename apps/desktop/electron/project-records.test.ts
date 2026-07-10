import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  backfillProjectRecords,
  createProjectRecord,
  isProjectIdentity,
  mergeProjectRecords,
  withProjectIdentity,
} from "./project-records";

const roots: string[] = [];

function workspace(name = "app") {
  const root = mkdtempSync(join(tmpdir(), "openstory-record-"));
  roots.push(root);
  const path = join(root, "apps", name);
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "package.json"), JSON.stringify({ name }));
  return path;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("createProjectRecord", () => {
  it("creates a record with canonical identity", () => {
    const record = createProjectRecord(workspace(), "2026-07-10", "fixed-id");

    expect(record.id).toBe("fixed-id");
    expect(record.path).toBe(record.identity.workspace.rootPath);
    expect(record.name).toBe(record.identity.workspace.label);
    expect(record.addedAt).toBe("2026-07-10");
  });
});

describe("backfillProjectRecords", () => {
  it("adds identity without changing stable persisted fields", () => {
    const path = workspace();
    const record = backfillProjectRecords([
      { id: "saved", name: "legacy", path, addedAt: "then" },
    ])[0]!;

    expect(record.id).toBe("saved");
    expect(record.path).toBe(path);
    expect(record.name).toBe("app");
    expect(record.addedAt).toBe("then");
    expect(record.identity.repository.label).toBeTruthy();
  });

  it("preserves an existing complete identity", () => {
    const original = createProjectRecord(workspace(), "then", "saved");

    expect(backfillProjectRecords([original])).toEqual([original]);
  });

  it("rebuilds a partial persisted identity", () => {
    const path = workspace();
    const record = backfillProjectRecords([
      {
        id: "partial",
        name: "legacy",
        path,
        addedAt: "then",
        identity: {
          repository: { label: "Repo", slug: null, rootPath: "/repo" },
          workspace: { label: "App", relativePath: "apps/app", rootPath: path },
        } as never,
      },
    ])[0]!;

    expect(record.identity.source).toBe("automatic");
    expect(record.identity.repository.rootPath).not.toBe("/repo");
  });
});

describe("withProjectIdentity", () => {
  it("updates labels without changing stable project fields", () => {
    const original = createProjectRecord(workspace(), "then", "saved");
    const identity = {
      ...original.identity,
      repository: { ...original.identity.repository, label: "GoBrand" },
      workspace: { ...original.identity.workspace, label: "Web App" },
      source: "config" as const,
    };

    expect(withProjectIdentity(original, identity)).toEqual({
      ...original,
      name: "Web App",
      identity,
    });
  });
});

describe("isProjectIdentity", () => {
  it("rejects whitespace-only required strings from runtime manifests", () => {
    const identity = createProjectRecord(workspace()).identity;

    expect(
      isProjectIdentity({
        ...identity,
        repository: { ...identity.repository, label: "   " },
      }),
    ).toBe(false);
    expect(
      isProjectIdentity({
        ...identity,
        workspace: { ...identity.workspace, relativePath: "   " },
      }),
    ).toBe(false);
  });
});

describe("mergeProjectRecords", () => {
  it("preserves requested order while adding canonical paths idempotently", () => {
    const first = createProjectRecord(workspace("app"), "then", "first");
    const migrated = { ...first, path: "/legacy/symlink/apps/app" };
    const duplicate = createProjectRecord(first.path, "later", "duplicate");
    const second = createProjectRecord(workspace("admin"), "now", "second");

    const result = mergeProjectRecords([migrated], [duplicate, second]);

    expect(result.projects.map((project) => project.id)).toEqual(["first", "second"]);
    expect(result.records.map((project) => project.id)).toEqual(["first", "second"]);
    expect(result.added.map((project) => project.id)).toEqual(["second"]);
  });
});
