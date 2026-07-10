import type { ProjectRecord } from "./types";
import { createProjectRecord } from "./project-records";

type ProjectBatchStore = {
  addProjects: (records: ProjectRecord[]) => ProjectRecord[];
};

export function addProjectPaths(
  store: ProjectBatchStore,
  paths: string[],
  create: (path: string) => ProjectRecord = createProjectRecord,
): ProjectRecord[] {
  return store.addProjects(paths.map((path) => create(path)));
}

export function addProjectPathsAndBroadcast(
  store: ProjectBatchStore,
  paths: string[],
  broadcast: () => void,
  create: (path: string) => ProjectRecord = createProjectRecord,
): ProjectRecord[] {
  const records = addProjectPaths(store, paths, create);
  broadcast();
  return records;
}
