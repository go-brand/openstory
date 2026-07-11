import { describe, expect, it } from "vitest";
import type { AppState, ProjectRecord } from "../../electron/types";
import { commandPaletteItems } from "./command-palette";

function project(id: string, repository: string): ProjectRecord {
  const repositoryRoot = `/repos/${repository}`;
  const path = `${repositoryRoot}/apps/app`;
  return {
    id,
    name: "app",
    path,
    addedAt: "2026-07-10",
    identity: {
      repository: { label: repository, slug: `team/${repository}`, rootPath: repositoryRoot },
      workspace: { label: "app", relativePath: "apps/app", rootPath: path },
      source: "automatic",
    },
  };
}

const projects = [project("gobrand", "gb-monorepo"), project("openstory", "openstory")];
const state = {
  projects,
  selection: {
    projectId: null,
    componentId: null,
    storyId: null,
    docsComponentId: null,
    pageId: null,
    viewport: "desktop",
    mode: "design",
    propOverrides: {},
  },
  manifest: [],
  docs: [],
} as unknown as AppState;

describe("commandPaletteItems", () => {
  it("keeps generic workspace names distinguishable and searchable by repository", () => {
    expect(commandPaletteItems(state, "app").map((item) => item.label)).toEqual([
      "gb-monorepo · app",
      "openstory · app",
    ]);
    expect(commandPaletteItems(state, "gb mono").map((item) => item.label)).toEqual([
      "gb-monorepo · app",
    ]);
    expect(commandPaletteItems(state, "team/openstory").map((item) => item.label)).toEqual([
      "openstory · app",
    ]);
  });
});
