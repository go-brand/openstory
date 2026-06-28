export type ProjectRecord = {
  id: string;
  name: string;
  path: string;
  addedAt: string;
};

export type Theme = "light" | "dark";

/** Positioning of the render within the preview surface. Mirrors config's
 *  `Layout` (duplicated to keep the Electron main process free of a
 *  `@gobrand/openstory-config` import, same as `ManifestControl`). */
export type Layout = "padded" | "centered" | "fullscreen";

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
  /** Feature-doc page id whose page is the active selection, else null.
   *  Distinct from `docsComponentId` (a component's auto-docs). */
  pageId: string | null;
  viewport: "desktop" | "mobile";
  /** Which sidebar tree is active. Design System = components[]; Docs = docs[]. */
  mode: "design" | "docs";
  /** Per-selection layout override; null falls back to the component's declared
   *  `layout`. Reset to null whenever a new story is selected. */
  layout: Layout | null;
  propOverrides: Record<string, unknown>;
};

export type ManifestControl = {
  name: string;
  kind: "text" | "boolean" | "number" | "select" | "radio";
  /** Allowed values; present only for `select` / `radio`. */
  options?: string[];
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
  /** Positioning of the render within the preview surface. Defaults to `padded`. */
  layout: Layout;
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

export type ManifestDoc = {
  id: string;
  title: string;
  group: string;
  section: string | null;
  html: string;
  embeds: string[];
  sourcePath: string;
  status?: "shipped" | "beta" | "planned";
  owner?: string;
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
  docs: ManifestDoc[];
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
  "preview:setLayout": (layout: Layout | null) => void;
  "preview:setDocs": (componentId: string | null) => void;
  "preview:setPage": (pageId: string | null) => void;
  "preview:setMode": (mode: "design" | "docs") => void;
  "preview:refreshManifest": () => void;
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
