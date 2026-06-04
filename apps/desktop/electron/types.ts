export type ProjectRecord = {
  id: string;
  name: string;
  path: string;
  addedAt: string;
};

export type Theme = "light" | "dark";

export type OverlayState = {
  opacity: number;
  clickThrough: boolean;
  blendMode: "normal" | "difference";
  visible: boolean;
  alwaysOnTop: boolean;
};

export type ActiveSelection = {
  projectId: string | null;
  componentId: string | null;
  storyId: string | null;
  /** Component id whose Docs node is the active selection, else null. */
  docsComponentId: string | null;
  viewport: "desktop" | "mobile";
  propOverrides: Record<string, unknown>;
};

export type ManifestControl = {
  name: string;
  kind: "text" | "boolean" | "number";
};

export type ManifestComponent = {
  id: string;
  /** Human display label for the sidebar tree. */
  name: string;
  /** Slash-delimited sidebar path. "" means the sidebar root. */
  group: string;
  /** Auto-derived workspace section (package basename) or null. Rendered uppercase. */
  section: string | null;
  /** Resolved chrome background for this preview's preset. */
  background: string;
  stories: Array<{
    id: string;
    label: string;
    props: Record<string, unknown>;
  }>;
  controls: ManifestControl[];
  // Absolute path of the component source file, resolved by the vite-plugin.
  // null when the preview's config does not declare a `sourcePath`.
  sourcePath: string | null;
};

export type PreviewSource = {
  path: string;
  code: string;
};

export type AppState = {
  projects: ProjectRecord[];
  selection: ActiveSelection;
  overlay: OverlayState;
  theme: Theme;
  manifest: ManifestComponent[];
  iframeUrl: string | null;
  detachedOpen: boolean;
  vite: {
    status: "idle" | "starting" | "ready" | "error";
    port: number | null;
    error: string | null;
  };
};

export type IpcInvoke = {
  "project:add": (path: string) => ProjectRecord;
  "project:pickFolder": () => string | null;
  "project:select": (projectId: string) => void;
  "project:remove": (projectId: string) => void;
  "preview:set": (input: {
    componentId: string;
    storyId: string;
    viewport: "desktop" | "mobile";
  }) => void;
  "preview:setProps": (overrides: Record<string, unknown>) => void;
  "preview:setDocs": (componentId: string | null) => void;
  "preview:getSource": (componentId: string) => PreviewSource | null;
  "preview:popOut": () => void;
  "preview:popIn": () => void;
  "overlay:setOpacity": (value: number) => void;
  "overlay:setClickThrough": (enabled: boolean) => void;
  "overlay:setBlendMode": (mode: "normal" | "difference") => void;
  "overlay:setVisible": (visible: boolean) => void;
  "window:setAlwaysOnTop": (enabled: boolean) => void;
  "theme:set": (theme: Theme) => void;
  "state:get": () => AppState;
};

export type IpcEvents = {
  "state:update": (state: AppState) => void;
};
