export type ProjectRecord = {
  id: string;
  name: string;
  path: string;
  addedAt: string;
};

export type OverlayState = {
  opacity: number;
  clickThrough: boolean;
  blendMode: 'normal' | 'difference';
  visible: boolean;
  alwaysOnTop: boolean;
};

export type ActiveSelection = {
  projectId: string | null;
  previewId: string | null;
  variantId: string | null;
  viewport: 'desktop' | 'mobile';
  propOverrides: Record<string, unknown>;
};

export type ManifestControl = {
  name: string;
  kind: 'text' | 'boolean' | 'number';
};

export type ManifestPreview = {
  id: string;
  platform: string;
  variants: Array<{
    id: string;
    label: string;
    props: Record<string, unknown>;
  }>;
  controls: ManifestControl[];
};

export type AppState = {
  projects: ProjectRecord[];
  selection: ActiveSelection;
  overlay: OverlayState;
  manifest: ManifestPreview[];
  iframeUrl: string | null;
  vite: {
    status: 'idle' | 'starting' | 'ready' | 'error';
    port: number | null;
    error: string | null;
  };
};

export type IpcInvoke = {
  'project:add': (path: string) => ProjectRecord;
  'project:pickFolder': () => string | null;
  'project:select': (projectId: string) => void;
  'project:remove': (projectId: string) => void;
  'preview:set': (input: {
    previewId: string;
    variantId: string;
    viewport: 'desktop' | 'mobile';
  }) => void;
  'preview:setProps': (overrides: Record<string, unknown>) => void;
  'preview:popOut': () => void;
  'preview:popIn': () => void;
  'overlay:setOpacity': (value: number) => void;
  'overlay:setClickThrough': (enabled: boolean) => void;
  'overlay:setBlendMode': (mode: 'normal' | 'difference') => void;
  'overlay:setVisible': (visible: boolean) => void;
  'window:setAlwaysOnTop': (enabled: boolean) => void;
  'state:get': () => AppState;
};

export type IpcEvents = {
  'state:update': (state: AppState) => void;
};
