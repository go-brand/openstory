import Store from "electron-store";
import type { ActiveSelection, OverlayState, ProjectRecord } from "./types";

type PersistedState = {
  projects: ProjectRecord[];
  selection: ActiveSelection;
  overlay: OverlayState;
  theme: "light" | "dark";
  hudBounds: { x: number; y: number; width: number; height: number } | null;
};

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
  }

  get state(): PersistedState {
    return this.store.store;
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
    const projects = this.store.get("projects");
    const existing = projects.find((p) => p.path === record.path);
    if (existing) return existing;
    this.store.set("projects", [...projects, record]);
    return record;
  }

  removeProject(id: string): void {
    const projects = this.store.get("projects").filter((p) => p.id !== id);
    this.store.set("projects", projects);
  }
}
