import Store from 'electron-store';
import type { ActiveSelection, OverlayState, ProjectRecord } from './types';

type PersistedState = {
  projects: ProjectRecord[];
  selection: ActiveSelection;
  overlay: OverlayState;
  hudBounds: { x: number; y: number; width: number; height: number } | null;
};

const defaults: PersistedState = {
  projects: [],
  selection: {
    projectId: null,
    previewId: null,
    variantId: null,
    viewport: 'desktop',
  },
  overlay: {
    opacity: 1,
    clickThrough: false,
    blendMode: 'normal',
    visible: true,
    alwaysOnTop: false,
  },
  hudBounds: null,
};

export class AppStore {
  private store: Store<PersistedState>;

  constructor() {
    this.store = new Store<PersistedState>({
      name: 'openstory',
      defaults,
    });
  }

  get state(): PersistedState {
    return this.store.store;
  }

  set<K extends keyof PersistedState>(key: K, value: PersistedState[K]): void {
    this.store.set(key, value);
  }

  patchOverlay(patch: Partial<OverlayState>): void {
    this.store.set('overlay', { ...this.store.get('overlay'), ...patch });
  }

  patchSelection(patch: Partial<ActiveSelection>): void {
    this.store.set('selection', { ...this.store.get('selection'), ...patch });
  }

  // Idempotent by path: returns the existing record if the project is already
  // registered, otherwise stores and returns the new one. Callers rely on the
  // returned record's id to select the project.
  addProject(record: ProjectRecord): ProjectRecord {
    const projects = this.store.get('projects');
    const existing = projects.find((p) => p.path === record.path);
    if (existing) return existing;
    this.store.set('projects', [...projects, record]);
    return record;
  }

  removeProject(id: string): void {
    const projects = this.store.get('projects').filter((p) => p.id !== id);
    this.store.set('projects', projects);
  }
}
