import { useEffect, useState } from 'react';
import {
  Folder,
  FolderPlus,
  Layers,
  Maximize2,
  MousePointerClick,
  Pin,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import type { AppState } from '../electron/types';
import { Button } from './components/ui/button';
import { Slider } from './components/ui/slider';
import { Checkbox } from './components/ui/checkbox';
import { Separator } from './components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './components/ui/select';
import { cn } from './lib/utils';

const FALLBACK_STATE: AppState = {
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
  manifest: [],
  iframeUrl: null,
  vite: { status: 'idle', port: null, error: null },
};

const PLATFORM_BG: Record<string, string> = {
  linkedin: '#f3f2ef',
  x: '#000000',
  instagram: '#fafafa',
  tiktok: '#000000',
  threads: '#101010',
  facebook: '#f0f2f5',
  youtube: '#0f0f0f',
  bluesky: '#ffffff',
};

const STATUS_DOT: Record<string, string> = {
  idle: 'bg-neutral-500',
  starting: 'bg-amber-400 animate-pulse',
  ready: 'bg-emerald-400',
  error: 'bg-rose-400',
};

function getApi() {
  return typeof window !== 'undefined' ? window.openStory : undefined;
}

function SectionLabel({
  icon,
  children,
  count,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium tracking-[0.12em] text-neutral-500 uppercase">
      {icon}
      <span>{children}</span>
      {count !== undefined && (
        <span className="text-neutral-600">· {count}</span>
      )}
    </div>
  );
}

export function App() {
  const api = getApi();
  const [state, setState] = useState<AppState>(FALLBACK_STATE);

  useEffect(() => {
    if (!api) return;
    let mounted = true;
    api
      .invoke('state:get')
      .then((next) => {
        if (mounted) setState(next);
      })
      .catch(() => {});
    const off = api.on('state:update', (next) => setState(next));
    return () => {
      mounted = false;
      off();
    };
  }, [api]);

  async function onPickFolder() {
    if (!api) return;
    const path = await api.invoke('project:pickFolder');
    if (path) {
      const record = await api.invoke('project:add', path);
      await api.invoke('project:select', record.id);
    }
  }

  const preview =
    state.manifest.find((p) => p.id === state.selection.previewId) ??
    state.manifest[0];

  const platformBg = (preview && PLATFORM_BG[preview.platform]) ?? '#f3f2ef';

  return (
    <div className="relative flex h-screen w-screen overflow-hidden rounded-[12px] bg-transparent text-neutral-200">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-50 rounded-[12px]"
        style={{
          boxShadow:
            'inset 0 0 0 1px rgba(255,255,255,0.12), inset 0 1px 0 0 rgba(255,255,255,0.22)',
        }}
      />
      <aside className="flex w-[288px] flex-shrink-0 flex-col overflow-hidden border-r border-neutral-700/60 bg-neutral-800/95 backdrop-blur-md">
        <header className="drag flex min-h-[44px] items-center justify-between border-b border-neutral-700/60 py-2.5 pr-4 pl-[78px]">
          <span className="text-[11px] font-semibold tracking-[0.16em] text-neutral-300 uppercase">
            OpenStory
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-neutral-500">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                STATUS_DOT[state.vite.status]
              )}
            />
            {state.vite.status}
            {state.vite.port ? (
              <span className="text-neutral-600">:{state.vite.port}</span>
            ) : null}
          </span>
        </header>

        <div className="no-drag flex flex-1 flex-col overflow-y-auto px-4 py-5">
          {!api && (
            <div className="mb-4 rounded-md bg-rose-950/60 px-3 py-2 text-[11px] text-rose-200 ring-1 ring-rose-900/60">
              Preload bridge did not load.
            </div>
          )}

          <section>
            <SectionLabel icon={<Folder className="size-3" />}>
              Project
            </SectionLabel>
            {state.projects.length === 0 ? (
              <div className="flex flex-col gap-1.5">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={onPickFolder}
                  disabled={!api}
                >
                  <FolderPlus />
                  Open a project…
                </Button>
                <p className="px-0.5 text-[10px] leading-relaxed text-neutral-500">
                  Pick a folder containing a{' '}
                  <code className="text-neutral-400">openstory.config.ts</code>
                  .
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Select
                  value={state.selection.projectId ?? ''}
                  onValueChange={(v) => api?.invoke('project:select', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select project" />
                  </SelectTrigger>
                  <SelectContent>
                    {state.projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onPickFolder}
                  disabled={!api}
                >
                  <FolderPlus />
                  Add another
                </Button>
              </div>
            )}
          </section>

          {preview && (
            <>
              <Separator className="my-5" />

              <section>
                <SectionLabel icon={<Maximize2 className="size-3" />}>
                  Viewport
                </SectionLabel>
                <div className="flex gap-1.5">
                  {(['desktop', 'mobile'] as const).map((v) => {
                    const active = state.selection.viewport === v;
                    return (
                      <Button
                        key={v}
                        variant={active ? 'active' : 'secondary'}
                        size="sm"
                        className="flex-1"
                        onClick={() =>
                          api?.invoke('preview:set', {
                            previewId: preview.id,
                            variantId:
                              state.selection.variantId ??
                              preview.variants[0]?.id ??
                              '',
                            viewport: v,
                          })
                        }
                      >
                        {v === 'desktop' ? <Maximize2 /> : <Smartphone />}
                        {v === 'desktop' ? 'Desktop' : 'Mobile'}
                      </Button>
                    );
                  })}
                </div>
              </section>

              <Separator className="my-5" />

              <section>
                <SectionLabel
                  icon={<Layers className="size-3" />}
                  count={preview.variants.length}
                >
                  Variant
                </SectionLabel>
                <div className="flex flex-col gap-1">
                  {preview.variants.map((v) => {
                    const active = state.selection.variantId === v.id;
                    return (
                      <Button
                        key={v.id}
                        variant={active ? 'active' : 'ghost'}
                        size="sm"
                        className="justify-start"
                        onClick={() =>
                          api?.invoke('preview:set', {
                            previewId: preview.id,
                            variantId: v.id,
                            viewport: state.selection.viewport,
                          })
                        }
                      >
                        {v.label}
                      </Button>
                    );
                  })}
                </div>
              </section>
            </>
          )}

          <Separator className="my-5" />

          <section>
            <SectionLabel icon={<Sparkles className="size-3" />}>
              Overlay
            </SectionLabel>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-[11px] text-neutral-400">Opacity</span>
              <span className="text-[11px] text-neutral-500 tabular-nums">
                {Math.round(state.overlay.opacity * 100)}%
              </span>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={[state.overlay.opacity]}
              onValueChange={(v) =>
                api?.invoke('overlay:setOpacity', v[0] ?? 1)
              }
              className="mb-4"
            />

            <label className="flex cursor-pointer items-center gap-2 py-1 text-[11px] text-neutral-400 hover:text-neutral-200">
              <Checkbox
                checked={state.overlay.blendMode === 'difference'}
                onCheckedChange={(c) =>
                  api?.invoke(
                    'overlay:setBlendMode',
                    c ? 'difference' : 'normal'
                  )
                }
              />
              <span>Difference blend</span>
              <kbd className="ml-auto rounded bg-neutral-800/80 px-1.5 py-0.5 font-mono text-[9px] text-neutral-500">
                ⌘B
              </kbd>
            </label>
            <label className="flex cursor-pointer items-center gap-2 py-1 text-[11px] text-neutral-400 hover:text-neutral-200">
              <Checkbox
                checked={state.overlay.clickThrough}
                onCheckedChange={(c) =>
                  api?.invoke('overlay:setClickThrough', Boolean(c))
                }
              />
              <MousePointerClick className="size-3 text-neutral-500" />
              <span>Click-through</span>
              <kbd className="ml-auto rounded bg-neutral-800/80 px-1.5 py-0.5 font-mono text-[9px] text-neutral-500">
                F8
              </kbd>
            </label>
            <label className="flex cursor-pointer items-center gap-2 py-1 text-[11px] text-neutral-400 hover:text-neutral-200">
              <Checkbox
                checked={state.overlay.alwaysOnTop}
                onCheckedChange={(c) =>
                  api?.invoke('window:setAlwaysOnTop', Boolean(c))
                }
              />
              <Pin className="size-3 text-neutral-500" />
              <span>Always on top</span>
            </label>
          </section>
        </div>

        <div className="border-t border-neutral-700/60 px-4 py-2.5 text-[10px] leading-relaxed text-neutral-500">
          Drag title bar · ⌘↑↓ opacity · F8 click-through
        </div>
      </aside>

      <main
        className="relative box-border flex-1 overflow-hidden bg-transparent"
        style={{ border: '20px solid #1f1f23' }}
      >
        <div className="box-border h-full w-full overflow-hidden rounded-xl border border-neutral-700/40 shadow-2xl shadow-black/30">
          <div
            className="h-full w-full"
            style={{
              background: platformBg,
              opacity: state.overlay.opacity,
              mixBlendMode: state.overlay.blendMode,
            }}
          >
            {state.iframeUrl ? (
              <iframe
                key={state.iframeUrl}
                src={state.iframeUrl}
                className="h-full w-full border-0 bg-transparent"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-center text-[13px] text-neutral-500">
                <div>
                  {state.vite.status === 'starting' && (
                    <>
                      <Sparkles className="mx-auto mb-2 size-5 animate-pulse text-neutral-400" />
                      <div>Starting Vite…</div>
                    </>
                  )}
                  {state.vite.status === 'error' && (
                    <>
                      <div className="mb-2 text-rose-400">Vite error</div>
                      <div className="font-mono text-[11px] text-neutral-500">
                        {state.vite.error ?? 'unknown'}
                      </div>
                    </>
                  )}
                  {state.vite.status === 'idle' && (
                    <>
                      <Folder className="mx-auto mb-2 size-5 text-neutral-600" />
                      <div>Pick a project to load the preview</div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
