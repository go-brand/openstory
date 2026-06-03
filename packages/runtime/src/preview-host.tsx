import { createContext, useContext, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  resolvePresets,
  resolveRender,
  type OpenStoryConfig,
  type PreviewDef,
  type Fixture,
} from "@gobrand/openstory-config";
import { parseBridgeMessage, type RenderMessage, type ManifestMessage } from "./bridge.js";

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

type ActiveSelection = {
  previewId: string;
  variantId: string;
  viewport: "desktop" | "mobile";
  fixtureOverrides?: Record<string, unknown>;
};

function readSelectionFromUrl(): ActiveSelection | null {
  const params = new URLSearchParams(window.location.search);
  const previewId = params.get("preview");
  const variantId = params.get("variant");
  const viewport = params.get("viewport") as "desktop" | "mobile" | null;
  if (!previewId || !variantId || !viewport) return null;
  return { previewId, variantId, viewport };
}

function PreviewStage({
  config,
  selection,
}: {
  config: OpenStoryConfig;
  selection: ActiveSelection;
}) {
  const preview = config.previews.find((p) => p.id === selection.previewId) as
    | PreviewDef
    | undefined;
  if (!preview) return <FallbackMessage text={`Unknown preview: ${selection.previewId}`} />;

  const fixture = preview.fixtures.find((f) => f.id === selection.variantId) as Fixture | undefined;
  if (!fixture) return <FallbackMessage text={`Unknown variant: ${selection.variantId}`} />;

  const presets = resolvePresets(config.presets);
  const render = resolveRender(preview, presets);
  const width = render.viewport[selection.viewport].width;

  const Providers = config.providers ?? (({ children }) => <>{children}</>);
  const Component = preview.component as React.ComponentType<Record<string, unknown>>;
  const props = mergeProps(
    (fixture.props ?? {}) as Record<string, unknown>,
    selection.fixtureOverrides,
  );

  // Constrain the rendered component to the resolved viewport width and center
  // it. This is what makes the desktop/mobile toggle visibly resize the preview:
  // `width` is re-derived from `selection.viewport` on every render message.
  return (
    <Providers>
      <ViewportContext.Provider value={selection.viewport}>
        <div style={{ width, maxWidth: "100%", margin: "0 auto" }}>
          <Component {...props} />
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

function App({ config }: { config: OpenStoryConfig }) {
  const [selection, setSelection] = useState<ActiveSelection | null>(readSelectionFromUrl);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = parseBridgeMessage(event.data);
      if (!msg) return;
      if (msg.type === "pl:render") {
        const next: RenderMessage = msg;
        setSelection({
          previewId: next.previewId,
          variantId: next.variantId,
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

  useEffect(() => {
    const manifest: ManifestMessage = {
      type: "pl:manifest",
      previews: config.previews.map((p) => ({
        id: p.id,
        group: p.group ?? "",
        variants: p.fixtures.map((f) => ({ id: f.id, label: f.label })),
      })),
    };
    window.parent.postMessage(manifest, "*");
    window.parent.postMessage({ type: "pl:ready" }, "*");
  }, [config]);

  if (!selection) return <FallbackMessage text="Waiting for selection..." />;
  return <PreviewStage config={config} selection={selection} />;
}

export function mountPreviewHost(target: HTMLElement, config: OpenStoryConfig): void {
  const root = createRoot(target);
  root.render(<App config={config} />);
}
