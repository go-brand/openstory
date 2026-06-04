import { createContext, useContext, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  resolvePresets,
  resolveRender,
  type OpenStoryConfig,
  type ComponentDef,
  type Fixture,
  type Layout,
  type RegisteredComponent,
} from "@gobrand/openstory-config";
import { parseBridgeMessage, type RenderMessage, type ManifestMessage } from "./bridge.js";
import { applyAddons, type AddonState } from "./addons/index.js";

export type ViewportName = "desktop" | "mobile";

export function mergeProps(
  presetProps: Record<string, unknown>,
  overrides: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return overrides ? { ...presetProps, ...overrides } : presetProps;
}

const ViewportContext = createContext<ViewportName>("desktop");

export function useOpenStoryViewport(): ViewportName {
  return useContext(ViewportContext);
}

// Breathing room around the render, mirroring Storybook's `sb-main-*` classes:
// `padded` (default) adds 1rem on every side so the component never touches the
// canvas edges or the toolbar; `centered` also centers it in the surface;
// `fullscreen` is flush. Applied inside the iframe (the render surface), never
// in the manager — same split Storybook uses.
const LAYOUT_PADDING = "1rem";

export function layoutStyle(layout: Layout): React.CSSProperties {
  switch (layout) {
    case "fullscreen":
      return {};
    case "centered":
      return {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: LAYOUT_PADDING,
        boxSizing: "border-box",
      };
    case "padded":
    default:
      return { padding: LAYOUT_PADDING, boxSizing: "border-box" };
  }
}

type ActiveSelection = {
  componentId: string;
  storyId: string;
  viewport: "desktop" | "mobile";
  fixtureOverrides?: Record<string, unknown>;
};

function readSelectionFromUrl(): ActiveSelection | null {
  const params = new URLSearchParams(window.location.search);
  const componentId = params.get("component");
  const storyId = params.get("story");
  const viewport = params.get("viewport") as "desktop" | "mobile" | null;
  if (!componentId || !storyId || !viewport) return null;
  return { componentId, storyId, viewport };
}

function PreviewStage({
  config,
  selection,
}: {
  config: OpenStoryConfig;
  selection: ActiveSelection;
}) {
  const component = (config.components ?? []).find((p) => p.id === selection.componentId) as
    | ComponentDef
    | undefined;
  if (!component) return <FallbackMessage text={`Unknown component: ${selection.componentId}`} />;

  const fixture = component.fixtures.find((f) => f.id === selection.storyId) as Fixture | undefined;
  if (!fixture) return <FallbackMessage text={`Unknown story: ${selection.storyId}`} />;

  const presets = resolvePresets(config.presets);
  const render = resolveRender(component, presets);
  const width = render.viewport[selection.viewport].width;

  const Providers = config.providers ?? (({ children }) => <>{children}</>);
  const Component = component.component as React.ComponentType<Record<string, unknown>>;
  const props = mergeProps(
    (fixture.props ?? {}) as Record<string, unknown>,
    selection.fixtureOverrides,
  );

  // Constrain the rendered component to the resolved viewport width and center
  // it. This is what makes the desktop/mobile toggle visibly resize the preview:
  // `width` is re-derived from `selection.viewport` on every render message.
  // The outer layout wrapper supplies the Storybook-style breathing room.
  const layout = component.layout ?? "padded";
  return (
    <Providers>
      <ViewportContext.Provider value={selection.viewport}>
        <div style={layoutStyle(layout)}>
          <div style={{ width, maxWidth: "100%", margin: "0 auto" }}>
            <Component {...props} />
          </div>
        </div>
      </ViewportContext.Provider>
    </Providers>
  );
}

function FallbackMessage({ text }: { text: string }) {
  return (
    <div style={{ padding: 16, fontFamily: "monospace", color: "#a00" }}>OpenStory: {text}</div>
  );
}

// Auto-docs page, mirroring Storybook's default DocsPage: the component title
// followed by every story stacked vertically — each in a bordered "canvas" card
// with its label as a heading and any notes as a description. One scrollable
// document, so clicking a component shows docs first and the stories appear as
// you scroll down. Rendered inside the iframe because only the iframe holds the
// real component modules + providers (the manager has metadata alone).
function DocsPage({ config, componentId }: { config: OpenStoryConfig; componentId: string }) {
  const component = (config.components ?? []).find((p) => p.id === componentId) as
    | RegisteredComponent
    | undefined;
  if (!component) return <FallbackMessage text={`Unknown component: ${componentId}`} />;

  const presets = resolvePresets(config.presets);
  const render = resolveRender(component, presets);
  const width = render.viewport.desktop.width;

  const Providers = config.providers ?? (({ children }) => <>{children}</>);
  const Component = component.component as React.ComponentType<Record<string, unknown>>;
  const title = component.name ?? component.id;

  return (
    <ViewportContext.Provider value="desktop">
      <div
        style={{
          maxWidth: 1000,
          margin: "0 auto",
          padding: "40px 20px",
          boxSizing: "border-box",
          fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
          color: "#1a1a1a",
        }}
      >
        <h1 style={{ fontSize: 30, fontWeight: 700, margin: "0 0 24px" }}>{title}</h1>
        {component.fixtures.map((fixture) => (
          <section key={fixture.id} style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>{fixture.label}</h2>
            {fixture.notes ? (
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "#555", margin: "0 0 12px" }}>
                {fixture.notes}
              </p>
            ) : null}
            <div
              style={{
                border: "1px solid #e6e6e6",
                borderRadius: 8,
                padding: 24,
                background: "#fff",
              }}
            >
              <Providers>
                <div style={{ width, maxWidth: "100%", margin: "0 auto" }}>
                  <Component {...((fixture.props ?? {}) as Record<string, unknown>)} />
                </div>
              </Providers>
            </div>
          </section>
        ))}
      </div>
    </ViewportContext.Provider>
  );
}

function App({ config }: { config: OpenStoryConfig }) {
  const [selection, setSelection] = useState<ActiveSelection | null>(readSelectionFromUrl);
  const [docsComponentId, setDocsComponentId] = useState<string | null>(null);
  const [addons, setAddons] = useState<AddonState>({
    outline: false,
    grid: false,
    measure: false,
  });
  const [remountKey, setRemountKey] = useState(0);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const raw = event.data as { type?: string; addon?: keyof AddonState; enabled?: boolean };
      if (raw?.type === "os:addon" && raw.addon) {
        const addon = raw.addon;
        const enabled = Boolean(raw.enabled);
        setAddons((a) => ({ ...a, [addon]: enabled }));
        return;
      }
      if (raw?.type === "os:reload") {
        setRemountKey((k) => k + 1);
        return;
      }
      const msg = parseBridgeMessage(event.data);
      if (!msg) return;
      if (msg.type === "pl:render") {
        const next: RenderMessage = msg;
        if (next.mode === "docs") {
          setDocsComponentId(next.componentId);
          return;
        }
        setDocsComponentId(null);
        setSelection({
          componentId: next.componentId,
          storyId: next.storyId,
          viewport: next.viewport,
          ...(next.fixtureOverrides !== undefined && {
            fixtureOverrides: next.fixtureOverrides,
          }),
        });
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Reconcile overlays to the toggled state. Setters are idempotent.
  useEffect(() => {
    applyAddons(addons);
  }, [addons]);

  useEffect(() => {
    const manifest: ManifestMessage = {
      type: "pl:manifest",
      components: (config.components ?? []).map((p) => ({
        id: p.id,
        group: p.group ?? "",
        stories: p.fixtures.map((f) => ({ id: f.id, label: f.label })),
      })),
    };
    window.parent.postMessage(manifest, "*");
    window.parent.postMessage({ type: "pl:ready" }, "*");
  }, [config]);

  if (docsComponentId) {
    return (
      <DocsPage
        key={`docs:${docsComponentId}:${remountKey}`}
        config={config}
        componentId={docsComponentId}
      />
    );
  }
  if (!selection) return <FallbackMessage text="Waiting for selection..." />;
  return <PreviewStage key={remountKey} config={config} selection={selection} />;
}

export function mountPreviewHost(target: HTMLElement, config: OpenStoryConfig): void {
  const root = createRoot(target);
  root.render(<App config={config} />);
}
