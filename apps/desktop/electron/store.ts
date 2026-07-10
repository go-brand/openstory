import Store from "electron-store";
import type { ActiveSelection, OverlayState, ProjectRecord } from "./types";
import {
  backfillProjectRecords,
  mergeProjectRecords,
  withProjectIdentity,
  type LegacyProjectRecord,
} from "./project-records";
import type { ProjectIdentity } from "@gobrand/openstory-config";
import {
  cachedWorkspaceDataForProject,
  nextWorkspaceDataCache,
  pruneWorkspaceDataCache,
  type WorkspaceData,
  type WorkspaceDataCache,
} from "./workspace-cache";

type PersistedState = {
  projects: LegacyProjectRecord[];
  selection: ActiveSelection;
  overlay: OverlayState;
  theme: "light" | "dark";
  hudBounds: { x: number; y: number; width: number; height: number } | null;
  workspaceDataCache: WorkspaceDataCache;
};

type HydratedState = Omit<PersistedState, "projects"> & { projects: ProjectRecord[] };

const defaults: PersistedState = {
  projects: [],
  selection: {
    projectId: null,
    componentId: null,
    storyId: null,
    docsComponentId: null,
    pageId: null,
    viewport: "desktop",
    mode: "design",
    layout: null,
    propOverrides: {},
  },
  overlay: {
    opacity: 1,
    clickThrough: false,
    blendMode: "normal",
    visible: true,
    alwaysOnTop: false,
  },
  theme: "light",
  hudBounds: null,
  workspaceDataCache: {},
};

export class AppStore {
  private store: Store<PersistedState>;

  constructor() {
    this.store = new Store<PersistedState>({
      name: "openstory",
      defaults,
    });
    // electron-store only fills whole missing top-level keys, not nested fields.
    // Migrate stores written by an older schema (e.g. before propOverrides) by
    // merging the persisted objects over the current defaults, so every nested
    // field is guaranteed present.
    this.store.set("selection", {
      ...defaults.selection,
      ...this.store.get("selection"),
    });
    this.store.set("overlay", {
      ...defaults.overlay,
      ...this.store.get("overlay"),
    });
    // Backfill theme for stores written before the field existed.
    if (this.store.get("theme") == null) {
      this.store.set("theme", defaults.theme);
    }
    if (this.store.get("workspaceDataCache") == null) {
      this.store.set("workspaceDataCache", defaults.workspaceDataCache);
    }
    this.store.set(
      "projects",
      backfillProjectRecords(this.store.get("projects") as LegacyProjectRecord[]),
    );
  }

  get state(): HydratedState {
    return this.store.store as HydratedState;
  }

  set<K extends keyof PersistedState>(key: K, value: PersistedState[K]): void {
    this.store.set(key, value);
  }

  patchOverlay(patch: Partial<OverlayState>): void {
    this.store.set("overlay", { ...this.store.get("overlay"), ...patch });
  }

  patchSelection(patch: Partial<ActiveSelection>): void {
    this.store.set("selection", { ...this.store.get("selection"), ...patch });
  }

  setTheme(theme: PersistedState["theme"]): void {
    this.store.set("theme", theme);
  }

  // Idempotent by path: returns the existing record if the project is already
  // registered, otherwise stores and returns the new one. Callers rely on the
  // returned record's id to select the project.
  addProject(record: ProjectRecord): ProjectRecord {
    return this.addProjects([record])[0]!;
  }

  addProjects(records: ProjectRecord[]): ProjectRecord[] {
    const merged = mergeProjectRecords(this.store.get("projects") as ProjectRecord[], records);
    if (merged.added.length > 0) this.store.set("projects", merged.projects);
    return merged.records;
  }

  removeProject(id: string): void {
    const projects = (this.store.get("projects") as ProjectRecord[]).filter((p) => p.id !== id);
    this.store.set("projects", projects);
    this.store.set(
      "workspaceDataCache",
      pruneWorkspaceDataCache(
        this.store.get("workspaceDataCache"),
        projects.map((p) => p.id),
      ),
    );
  }

  updateProjectIdentity(id: string, identity: ProjectIdentity): void {
    const projects = (this.store.get("projects") as ProjectRecord[]).map((project) =>
      project.id === id ? withProjectIdentity(project, identity) : project,
    );
    this.store.set("projects", projects);
  }

  getWorkspaceData(project: ProjectRecord): WorkspaceData | null {
    return cachedWorkspaceDataForProject(this.store.get("workspaceDataCache"), project);
  }

  setWorkspaceData(
    project: ProjectRecord,
    manifest: WorkspaceData["manifest"],
    docs: WorkspaceData["docs"],
  ): void {
    this.store.set(
      "workspaceDataCache",
      nextWorkspaceDataCache(this.store.get("workspaceDataCache"), project, manifest, docs),
    );
  }
}
