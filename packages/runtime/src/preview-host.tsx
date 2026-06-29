import { createContext, useContext, useEffect, useRef, useState } from "react";
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
import { DocHost, DOC_THEME_VARS } from "./doc-host.js";
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

// Wraps the rendered story and reports its OWN size to the manager (pl:size) so
// the manager can size the preview iframe to the component and center it on the
// OpenStory canvas — instead of stretching the iframe to fill the canvas. This
// is what lets the manager paint its themed background AROUND the component and
// keeps OpenStory's chrome independent of whatever CSS the loaded app ships: we
// only ever render the component, never a full-canvas surface.
//
// `padded`/`centered`: an inline-block wrapper shrink-wraps to the component box
// (plus breathing room) so offsetWidth/Height is the component's real size. The
// manager does the centering, so both layouts measure the same here.
// `fullscreen`: the component is meant to fill the canvas, so we post a 0×0
// sentinel telling the manager to stretch the iframe full instead of fitting.
function MeasuredStage({
  layout,
  width,
  children,
}: {
  layout: Layout;
  width: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (layout === "fullscreen") {
      window.parent.postMessage({ type: "pl:size", width: 0, height: 0 }, "*");
      return;
    }
    const el = ref.current;
    if (!el) return;
    const post = () =>
      window.parent.postMessage(
        { type: "pl:size", width: Math.ceil(el.offsetWidth), height: Math.ceil(el.offsetHeight) },
        "*",
      );
    post();
    // ResizeObserver is universal in browsers but absent in jsdom; the one-shot
    // post above keeps the harness working without it.
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(post);
    ro.observe(el);
    return () => ro.disconnect();
  }, [layout, width]);

  if (layout === "fullscreen") {
    return <div style={{ width: "100%", minHeight: "100vh" }}>{children}</div>;
  }
  // inline-block shrink-wraps to the component so the reported size IS the
  // component box (no padding) — the manager supplies breathing room around the
  // iframe on the canvas, so the iframe matches the component exactly.
  return (
    <div ref={ref} style={{ display: "inline-block", verticalAlign: "top" }}>
      <div style={{ width, maxWidth: "100%" }}>{children}</div>
    </div>
  );
}

type ActiveSelection = {
  componentId: string;
  storyId: string;
  viewport: "desktop" | "mobile";
  /** Layout override from the manager toolbar; falls back to the component's
   *  declared `layout` when absent. */
  layout?: Layout;
  fixtureOverrides?: Record<string, unknown>;
};

const VALID_LAYOUTS: ReadonlySet<string> = new Set(["padded", "centered", "fullscreen"]);

// The headless render contract (versioned by the manifest `schemaVersion`): an
// agent points its browser MCP at `/__pl__/?component=&story=&viewport=&theme=&
// layout=` and the harness renders that one story, identical to what the Electron
// manager shows. `component`/`story`/`viewport` are required; `layout` overrides
// the component's declared layout when valid; `theme` is applied separately by
// `applyThemeFromUrl` on mount. Same renderer as the postMessage path — one
// renderer, two triggers — so an agent's accessibility-tree snapshot can't drift
// from the human view.
export function readSelectionFromUrl(): ActiveSelection | null {
  const params = new URLSearchParams(window.location.search);
  const componentId = params.get("component");
  const storyId = params.get("story");
  const viewport = params.get("viewport") as "desktop" | "mobile" | null;
  if (!componentId || !storyId || !viewport) return null;
  const rawLayout = params.get("layout");
  const layout = rawLayout && VALID_LAYOUTS.has(rawLayout) ? (rawLayout as Layout) : undefined;
  return { componentId, storyId, viewport, ...(layout && { layout }) };
}

// Apply the `theme` URL param on a headless boot by toggling `.dark` on the
// document root — the same class the `os:theme` bridge toggles for the manager.
// Only `theme=dark` opts in; absent/anything-else stays light. The manager's
// runtime `os:theme` messages still win after mount.
export function applyThemeFromUrl(): void {
  const theme = new URLSearchParams(window.location.search).get("theme");
  if (theme === "dark") document.documentElement.classList.add("dark");
}

export function PreviewStage({
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
  // The outer layout wrapper supplies the Storybook-style breathing room. A
  // toolbar override (selection.layout) wins over the component's declared layout.
  const layout = selection.layout ?? component.layout ?? "padded";
  return (
    <Providers>
      <ViewportContext.Provider value={selection.viewport}>
        <MeasuredStage layout={layout} width={width}>
          <Component {...props} />
        </MeasuredStage>
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
export function DocsPage({
  config,
  componentId,
  layoutOverride,
}: {
  config: OpenStoryConfig;
  componentId: string;
  layoutOverride?: Layout | undefined;
}) {
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
  // Each docs canvas card honors the component's `layout`, mirroring how
  // PreviewStage positions the live render: `padded` (default) keeps the 24px
  // card inset, `centered` flex-centers the render in the card, `fullscreen`
  // drops the inset so the render sits flush to the card edge.
  const layout = layoutOverride ?? component.layout ?? "padded";

  return (
    <ViewportContext.Provider value="desktop">
      {/* OpenStory chrome, themed by the manager (DOC_THEME_VARS flips on the
          `.dark` class the os:theme bridge toggles) — not by consumer tokens,
          so the cards aren't a glaring white block in dark mode. The outer
          surface paints the full-width themed background (Storybook's DocsWrapper
          model); the inner column centers the content. */}
      <style>{DOC_THEME_VARS}</style>
      <div style={{ minHeight: "100vh", background: "var(--os-doc-bg)" }}>
        <div
          style={{
            maxWidth: 1000,
            margin: "0 auto",
            padding: "40px 20px",
            boxSizing: "border-box",
            fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
            color: "var(--os-doc-fg)",
          }}
        >
          <h1 style={{ fontSize: 30, fontWeight: 700, margin: "0 0 24px" }}>{title}</h1>
          {component.fixtures.map((fixture) => (
            <section key={fixture.id} style={{ marginBottom: 40 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>{fixture.label}</h2>
              {fixture.notes ? (
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: "var(--os-doc-fg-muted)",
                    margin: "0 0 12px",
                  }}
                >
                  {fixture.notes}
                </p>
              ) : null}
              <div
                style={{
                  border: "1px solid var(--os-doc-border)",
                  borderRadius: 8,
                  padding: layout === "fullscreen" ? 0 : 24,
                  background: "var(--os-doc-card)",
                  overflow: "hidden",
                  ...(layout === "centered"
                    ? { display: "flex", alignItems: "center", justifyContent: "center" }
                    : {}),
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
      </div>
    </ViewportContext.Provider>
  );
}

function App({ config }: { config: OpenStoryConfig }) {
  const [selection, setSelection] = useState<ActiveSelection | null>(readSelectionFromUrl);
  const [page, setPage] = useState<{ html: string; embeds: string[] } | null>(null);
  const [docsComponentId, setDocsComponentId] = useState<string | null>(null);
  const [docsLayout, setDocsLayout] = useState<Layout | undefined>(undefined);
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
      // The manager mirrors its light/dark theme here (the iframe is a separate
      // document and can't see the manager's `.dark` class). Toggle `.dark` on
      // this root so the consumer's shadcn tokens — and the DocHost doc surface
      // (bg-background/text-foreground) — resolve in the manager's theme.
      if (raw?.type === "os:theme") {
        document.documentElement.classList.toggle(
          "dark",
          (raw as { theme?: string }).theme === "dark",
        );
        return;
      }
      const msg = parseBridgeMessage(event.data);
      if (!msg) return;
      if (msg.type === "pl:render") {
        const next: RenderMessage = msg;
        if (next.mode === "page") {
          setPage({ html: next.pageHtml ?? "", embeds: next.pageEmbeds ?? [] });
          setDocsComponentId(null);
          return;
        }
        setPage(null);
        if (next.mode === "docs") {
          setDocsComponentId(next.componentId);
          setDocsLayout(next.layout);
          return;
        }
        setDocsComponentId(null);
        setSelection({
          componentId: next.componentId,
          storyId: next.storyId,
          viewport: next.viewport,
          ...(next.layout !== undefined && { layout: next.layout }),
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

  // Headless boot: honor `?theme=` before the manager (if any) connects.
  useEffect(() => {
    applyThemeFromUrl();
  }, []);

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

  if (page) {
    return (
      <DocHost
        key={`page:${remountKey}`}
        html={page.html}
        embeds={page.embeds}
        components={config.components ?? []}
      />
    );
  }
  if (docsComponentId) {
    return (
      <DocsPage
        key={`docs:${docsComponentId}:${remountKey}`}
        config={config}
        componentId={docsComponentId}
        layoutOverride={docsLayout}
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
