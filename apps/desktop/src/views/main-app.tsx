import { useRef } from 'react';
import {
  FolderPlus,
  Layers,
  Maximize2,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import type { AppState } from '../../electron/types';
import type { OpenStoryApi } from '../../electron/preload';
import { useHarnessBridge } from '../lib/use-harness-bridge';
import { Button } from '../components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

type Api = OpenStoryApi | undefined;

export function MainApp({ state, api }: { state: AppState; api: Api }) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  useHarnessBridge(iframeRef, state.selection);

  const preview =
    state.manifest.find((p) => p.id === state.selection.previewId) ??
    state.manifest[0];
  const variant =
    preview?.variants.find((v) => v.id === state.selection.variantId) ??
    preview?.variants[0];

  async function onPickFolder() {
    if (!api) return;
    const path = await api.invoke('project:pickFolder');
    if (path) {
      const record = await api.invoke('project:add', path);
      await api.invoke('project:select', record.id);
    }
  }

  function selectPreview(previewId: string, variantId: string) {
    api?.invoke('preview:set', {
      previewId,
      variantId,
      viewport: state.selection.viewport,
    });
  }

  function setControl(name: string, value: unknown) {
    api?.invoke('preview:setProps', {
      ...state.selection.propOverrides,
      [name]: value,
    });
  }

  const groups = groupByPlatform(state.manifest);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-200">
      {/* Sidebar: project + component tree */}
      <aside className="flex w-64 flex-col border-r border-neutral-800 bg-neutral-900">
        <header className="drag flex h-11 items-center pr-3 pl-[78px] text-[11px] font-semibold tracking-[0.16em] text-neutral-300 uppercase">
          OpenStory
        </header>
        <div className="no-drag flex flex-1 flex-col gap-3 overflow-y-auto p-3">
          {state.projects.length === 0 ? (
            <Button
              variant="primary"
              size="lg"
              onClick={onPickFolder}
              disabled={!api}
            >
              <FolderPlus /> Open a project…
            </Button>
          ) : (
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
          )}
          {state.manifest.length === 0 ? (
            <p className="px-1 text-[11px] text-neutral-500">
              No previews found in <code>openstory.config.ts</code>.
            </p>
          ) : (
            groups.map(([platform, previews]) => (
              <div key={platform}>
                <div className="mb-1 text-[10px] tracking-wider text-neutral-500 uppercase">
                  {platform}
                </div>
                {previews.map((p) => (
                  <Button
                    key={p.id}
                    variant={p.id === preview?.id ? 'active' : 'ghost'}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => selectPreview(p.id, p.variants[0]?.id ?? '')}
                  >
                    {p.id}
                  </Button>
                ))}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Canvas */}
      <main className="relative flex flex-1 flex-col bg-neutral-100">
        <div className="no-drag flex h-11 items-center justify-between border-b border-neutral-800 bg-neutral-900 px-3">
          <div className="flex gap-1.5">
            {(['desktop', 'mobile'] as const).map((v) => (
              <Button
                key={v}
                variant={
                  state.selection.viewport === v ? 'active' : 'secondary'
                }
                size="sm"
                onClick={() => {
                  if (preview && variant) {
                    api?.invoke('preview:set', {
                      previewId: preview.id,
                      variantId: variant.id,
                      viewport: v,
                    });
                  }
                }}
              >
                {v === 'desktop' ? <Maximize2 /> : <Smartphone />}
                {v === 'desktop' ? 'Desktop' : 'Mobile'}
              </Button>
            ))}
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => api?.invoke('preview:popOut')}
          >
            <ExternalLink /> Pop out
          </Button>
        </div>
        <div className="flex flex-1 items-center justify-center overflow-auto">
          {state.iframeUrl ? (
            <iframe
              ref={iframeRef}
              src={state.iframeUrl}
              className="h-full w-full border-0 bg-transparent"
            />
          ) : (
            <div className="text-[13px] text-neutral-500">
              {state.vite.status === 'error'
                ? `Vite error: ${state.vite.error ?? 'unknown'}`
                : state.vite.status === 'starting'
                  ? 'Starting Vite…'
                  : 'Pick a project to load previews'}
            </div>
          )}
        </div>
      </main>

      {/* Right: presets + controls */}
      {preview && (
        <aside className="flex w-72 flex-col gap-4 overflow-y-auto border-l border-neutral-800 bg-neutral-900 p-3">
          <section>
            <div className="mb-2 flex items-center gap-1.5 text-[10px] tracking-wider text-neutral-500 uppercase">
              <Layers className="size-3" /> Presets
            </div>
            <div className="flex flex-col gap-1">
              {preview.variants.map((v) => (
                <Button
                  key={v.id}
                  variant={v.id === variant?.id ? 'active' : 'ghost'}
                  size="sm"
                  className="justify-start"
                  onClick={() => selectPreview(preview.id, v.id)}
                >
                  {v.label}
                </Button>
              ))}
            </div>
          </section>
          {preview.controls.length > 0 && variant && (
            <section>
              <div className="mb-2 text-[10px] tracking-wider text-neutral-500 uppercase">
                Controls
              </div>
              <div className="flex flex-col gap-3">
                {preview.controls.map((c) => {
                  const value =
                    state.selection.propOverrides[c.name] ??
                    variant.props[c.name];
                  return (
                    <label
                      key={c.name}
                      className="flex flex-col gap-1 text-[11px] text-neutral-400"
                    >
                      <span>{c.name}</span>
                      {c.kind === 'boolean' ? (
                        <input
                          type="checkbox"
                          checked={Boolean(value)}
                          onChange={(e) => setControl(c.name, e.target.checked)}
                        />
                      ) : c.kind === 'number' ? (
                        <input
                          type="number"
                          value={typeof value === 'number' ? value : ''}
                          onChange={(e) =>
                            setControl(c.name, e.target.valueAsNumber)
                          }
                          className="rounded bg-neutral-800 px-2 py-1 text-neutral-200"
                        />
                      ) : (
                        <input
                          type="text"
                          value={typeof value === 'string' ? value : ''}
                          onChange={(e) => setControl(c.name, e.target.value)}
                          className="rounded bg-neutral-800 px-2 py-1 text-neutral-200"
                        />
                      )}
                    </label>
                  );
                })}
              </div>
            </section>
          )}
        </aside>
      )}
    </div>
  );
}

function groupByPlatform(
  manifest: AppState['manifest']
): Array<[string, AppState['manifest']]> {
  const map = new Map<string, AppState['manifest']>();
  for (const p of manifest) {
    const list = map.get(p.platform) ?? [];
    list.push(p);
    map.set(p.platform, list);
  }
  return [...map.entries()];
}
