import { createContext, useContext, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { OpenStoryConfig, PreviewDef, Fixture } from '@gobrand/openstory-config';
import {
  parseBridgeMessage,
  type RenderMessage,
  type ManifestMessage,
} from './bridge.js';

export type ViewportName = 'desktop' | 'mobile';

const ViewportContext = createContext<ViewportName>('desktop');

export function useOpenStoryViewport(): ViewportName {
  return useContext(ViewportContext);
}

type ActiveSelection = {
  previewId: string;
  variantId: string;
  viewport: 'desktop' | 'mobile';
};

const DEFAULT_PLATFORM_WIDTHS: Record<
  string,
  { desktop: number; mobile: number }
> = {
  linkedin: { desktop: 552, mobile: 360 },
  x: { desktop: 600, mobile: 360 },
  instagram: { desktop: 470, mobile: 360 },
  tiktok: { desktop: 540, mobile: 360 },
  threads: { desktop: 600, mobile: 360 },
  facebook: { desktop: 524, mobile: 360 },
  youtube: { desktop: 720, mobile: 360 },
  bluesky: { desktop: 600, mobile: 360 },
};

function readSelectionFromUrl(): ActiveSelection | null {
  const params = new URLSearchParams(window.location.search);
  const previewId = params.get('preview');
  const variantId = params.get('variant');
  const viewport = params.get('viewport') as 'desktop' | 'mobile' | null;
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
  if (!preview)
    return <FallbackMessage text={`Unknown preview: ${selection.previewId}`} />;

  const fixture = preview.fixtures.find((f) => f.id === selection.variantId) as
    | Fixture
    | undefined;
  if (!fixture)
    return <FallbackMessage text={`Unknown variant: ${selection.variantId}`} />;

  const viewportOverride = preview.viewports?.[selection.viewport];
  const defaultWidth =
    DEFAULT_PLATFORM_WIDTHS[preview.platform]?.[selection.viewport] ?? 600;
  const width = viewportOverride?.width ?? defaultWidth;

  const Providers = config.providers ?? (({ children }) => <>{children}</>);
  const Component = preview.component as React.ComponentType<
    Record<string, unknown>
  >;
  const props = (fixture.props ?? {}) as Record<string, unknown>;

  return (
    <Providers>
      <ViewportContext.Provider value={selection.viewport}>
        <Component {...props} />
      </ViewportContext.Provider>
    </Providers>
  );
}

function FallbackMessage({ text }: { text: string }) {
  return (
    <div style={{ padding: 16, fontFamily: 'monospace', color: '#a00' }}>
      OpenStory: {text}
    </div>
  );
}

function App({ config }: { config: OpenStoryConfig }) {
  const [selection, setSelection] = useState<ActiveSelection | null>(
    readSelectionFromUrl
  );

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = parseBridgeMessage(event.data);
      if (!msg) return;
      if (msg.type === 'pl:render') {
        const next: RenderMessage = msg;
        setSelection({
          previewId: next.previewId,
          variantId: next.variantId,
          viewport: next.viewport,
        });
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    const manifest: ManifestMessage = {
      type: 'pl:manifest',
      previews: config.previews.map((p) => ({
        id: p.id,
        platform: p.platform,
        variants: p.fixtures.map((f) => ({ id: f.id, label: f.label })),
      })),
    };
    window.parent.postMessage(manifest, '*');
    window.parent.postMessage({ type: 'pl:ready' }, '*');
  }, [config]);

  if (!selection) return <FallbackMessage text="Waiting for selection..." />;
  return <PreviewStage config={config} selection={selection} />;
}

export function mountPreviewHost(
  target: HTMLElement,
  config: OpenStoryConfig
): void {
  const root = createRoot(target);
  root.render(<App config={config} />);
}
