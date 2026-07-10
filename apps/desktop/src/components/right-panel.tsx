import { useEffect, useMemo, useRef, useState } from "react";
import type { AppState, ManifestComponent, PreviewSource } from "../../electron/types";
import type { Api } from "../lib/api";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { HugeiconsIcon, Copy01Icon } from "../lib/icons";
import { cn } from "../lib/utils";

export type PanelTab = "controls" | "code";

type Story = ManifestComponent["stories"][number] | undefined;

const PANEL_WIDTH = 320;
const PANEL_MIN_WIDTH = 260;
const PANEL_MAX_WIDTH = 520;
const PANEL_WIDTH_STORAGE_KEY = "openstory:right-panel-width";

export { PANEL_WIDTH, PANEL_MIN_WIDTH, PANEL_MAX_WIDTH };

export type PanelCloseMode = "animated" | "instant";

export function panelShellSnapshot({
  isOpen,
  closeMode,
  panelWidth = PANEL_WIDTH,
}: {
  isOpen: boolean;
  closeMode: PanelCloseMode;
  panelWidth?: number;
}): { width: number; transform: "translateX(0)" | "translateX(100%)"; shouldTransition: boolean } {
  return {
    width: isOpen ? panelWidth : 0,
    transform: isOpen ? "translateX(0)" : "translateX(100%)",
    shouldTransition: closeMode === "animated",
  };
}

export function clampPanelWidth(width: number): number {
  return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, Math.round(width)));
}

export function readStoredPanelWidth(): number {
  if (typeof window === "undefined") return PANEL_WIDTH;
  const raw = window.localStorage.getItem(PANEL_WIDTH_STORAGE_KEY);
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) ? clampPanelWidth(parsed) : PANEL_WIDTH;
}

export function RightPanel({
  isOpen,
  closeMode = "animated",
  panelWidth,
  onPanelWidthChange,
  tab,
  onTabChange,
  state,
  api,
  component,
  story,
  onSetControl,
}: {
  isOpen: boolean;
  closeMode?: PanelCloseMode;
  panelWidth?: number | undefined;
  onPanelWidthChange?: ((width: number) => void) | undefined;
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  state: AppState;
  api: Api;
  component: ManifestComponent;
  story: Story;
  onSetControl: (name: string, value: unknown) => void;
}) {
  // ── Page branch: a feature-doc page has no controls; show only the Code panel.
  const pageId = state.selection.pageId;
  if (pageId) {
    return (
      <PanelShell
        isOpen={isOpen}
        closeMode={closeMode}
        panelWidth={panelWidth}
        onPanelWidthChange={onPanelWidthChange}
      >
        <div className="flex h-11 shrink-0 items-center gap-4 border-b border-border px-4">
          <button
            type="button"
            className="relative flex h-11 items-center text-[12px] font-semibold text-foreground"
          >
            Code
            <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />
          </button>
        </div>
        <CodePanel state={state} api={api} id={pageId} />
      </PanelShell>
    );
  }

  return (
    <PanelShell
      isOpen={isOpen}
      closeMode={closeMode}
      panelWidth={panelWidth}
      onPanelWidthChange={onPanelWidthChange}
    >
      <div className="flex h-11 shrink-0 items-center gap-4 border-b border-border px-4">
        {(["controls", "code"] as const).map((t) => {
          const on = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onTabChange(t)}
              className={cn(
                "relative flex h-11 items-center text-[12px] transition-colors",
                on
                  ? "font-semibold text-foreground"
                  : "font-medium text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "controls" ? "Controls" : "Code"}
              {on && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand" />}
            </button>
          );
        })}
      </div>
      {tab === "code" ? (
        <CodePanel state={state} api={api} id={component.id} story={story} />
      ) : (
        <InspectPanel
          state={state}
          component={component}
          story={story}
          onSetControl={onSetControl}
        />
      )}
    </PanelShell>
  );
}

// Collapsible panel chrome shared by the component and page branches. The shell
// width is animated so the adjacent canvas flex area resizes continuously.
function PanelShell({
  isOpen,
  closeMode,
  panelWidth: controlledPanelWidth,
  onPanelWidthChange,
  children,
}: {
  isOpen: boolean;
  closeMode: PanelCloseMode;
  panelWidth?: number | undefined;
  onPanelWidthChange?: ((width: number) => void) | undefined;
  children: React.ReactNode;
}) {
  const [uncontrolledPanelWidth, setUncontrolledPanelWidth] = useState(readStoredPanelWidth);
  const resizeStart = useRef<{ x: number; width: number } | null>(null);
  const panelWidth = controlledPanelWidth ?? uncontrolledPanelWidth;

  useEffect(() => {
    window.localStorage.setItem(PANEL_WIDTH_STORAGE_KEY, String(panelWidth));
  }, [panelWidth]);

  const shell = panelShellSnapshot({ isOpen, closeMode, panelWidth });

  function setPanelWidth(width: number) {
    if (onPanelWidthChange) onPanelWidthChange(width);
    else setUncontrolledPanelWidth(width);
  }

  function startResize(e: React.PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeStart.current = { x: e.clientX, width: panelWidth };
  }

  function resize(e: React.PointerEvent<HTMLButtonElement>) {
    if (!resizeStart.current) return;
    const delta = resizeStart.current.x - e.clientX;
    setPanelWidth(clampPanelWidth(resizeStart.current.width + delta));
  }

  function stopResize(e: React.PointerEvent<HTMLButtonElement>) {
    if (resizeStart.current && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    resizeStart.current = null;
  }

  return (
    <aside
      aria-hidden={!isOpen}
      className={cn(
        "relative flex h-full shrink-0 overflow-hidden bg-background",
        shell.shouldTransition &&
          "transition-[width] duration-200 ease-in-out motion-reduce:transition-none",
        shell.width === 0 && "p-0",
      )}
      style={{ width: shell.width }}
    >
      <div
        className={cn(
          "flex h-full flex-col",
          shell.shouldTransition &&
            "transition-transform duration-200 ease-in-out motion-reduce:transition-none",
        )}
        style={{
          width: panelWidth,
          minWidth: panelWidth,
          transform: shell.transform,
        }}
      >
        <div className="my-2 mr-2 flex h-[calc(100%-1rem)] flex-col overflow-hidden rounded-xl border border-border bg-sidebar">
          {children}
        </div>
        {isOpen && (
          <button
            type="button"
            aria-label="Resize controls panel"
            onPointerDown={startResize}
            onPointerMove={resize}
            onPointerUp={stopResize}
            onPointerCancel={stopResize}
            className="no-drag absolute top-3 bottom-3 left-0 w-2 cursor-col-resize rounded-full outline-none hover:bg-foreground/[0.08] focus-visible:bg-foreground/[0.12]"
          />
        )}
      </div>
    </aside>
  );
}

function InspectPanel({
  state,
  component,
  story,
  onSetControl,
}: {
  state: AppState;
  component: ManifestComponent;
  story: Story;
  onSetControl: (name: string, value: unknown) => void;
}) {
  return (
    <div className="flex flex-col gap-7 overflow-y-auto px-5 py-5">
      {component.controls.length > 0 && story ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-4">
            {component.controls.map((c) => {
              const value = state.selection.propOverrides[c.name] ?? story.props[c.name];
              const defaultOption = story.props[c.name];
              return (
                <label key={c.name} className="flex flex-col gap-1.5 text-[11px]">
                  <span className="font-medium text-muted-foreground">{c.name}</span>
                  {c.kind === "select" || c.kind === "radio" ? (
                    <select
                      value={typeof value === "string" ? value : ""}
                      onChange={(e) => onSetControl(c.name, e.target.value)}
                      className="h-8 rounded-lg border border-border bg-card px-2.5 text-[12px] text-foreground transition-colors focus-visible:border-brand/60 focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
                    >
                      {(c.options ?? []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt === defaultOption ? `${opt} (Default)` : opt}
                        </option>
                      ))}
                    </select>
                  ) : c.kind === "boolean" ? (
                    <Switch
                      checked={Boolean(value)}
                      onCheckedChange={(checked) => onSetControl(c.name, checked)}
                      className="self-start"
                    />
                  ) : c.kind === "number" ? (
                    <input
                      type="number"
                      value={typeof value === "number" ? value : ""}
                      onChange={(e) => {
                        const n = e.target.valueAsNumber;
                        if (!Number.isNaN(n)) onSetControl(c.name, n);
                      }}
                      className="h-8 rounded-lg border border-border bg-card px-2.5 text-[12px] text-foreground transition-colors focus-visible:border-brand/60 focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
                    />
                  ) : (
                    <input
                      type="text"
                      value={typeof value === "string" ? value : ""}
                      onChange={(e) => onSetControl(c.name, e.target.value)}
                      className="h-8 rounded-lg border border-border bg-card px-2.5 text-[12px] text-foreground transition-colors focus-visible:border-brand/60 focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
                    />
                  )}
                </label>
              );
            })}
          </div>
        </section>
      ) : (
        <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
          No editable controls for this story.
        </p>
      )}
    </div>
  );
}

// ── Code: real component source (IPC), snippet fallback ──────────────────────

function CodePanel({
  state,
  api,
  id,
  story,
}: {
  state: AppState;
  api: Api;
  /** Source ID passed directly to `preview:getSource`. For components this is
   *  `component.id`; for feature-doc pages it is `pageId`. */
  id: string;
  story?: Story;
}) {
  const [source, setSource] = useState<PreviewSource | null | "loading">("loading");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setSource("loading");
    api
      ?.invoke("preview:getSource", id)
      .then((r) => alive && setSource(r))
      .catch(() => alive && setSource(null));
    return () => {
      alive = false;
    };
  }, [api, id]);

  // Snippet from the live props (preset + overrides) — used when there is no
  // resolvable source file, and shown while the read is in flight.
  const fallback = useMemo(() => {
    const props = { ...story?.props, ...state.selection.propOverrides };
    return snippet(id, props);
  }, [id, story?.props, state.selection.propOverrides]);

  const hasSource = source !== "loading" && source !== null;
  const code = hasSource ? source.code : fallback;
  const label = hasSource
    ? relativeName(source.path)
    : source === "loading"
      ? "Loading…"
      : "Generated snippet";

  function copy() {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="truncate font-mono text-[11px] text-muted-foreground">{label}</span>
        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={copy}>
          <HugeiconsIcon icon={Copy01Icon} className="size-3" />
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="flex-1 overflow-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap text-foreground">
        {code}
      </pre>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function relativeName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts.slice(-2).join("/");
}

function pascalCase(id: string): string {
  return id
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

// Generated `<Component prop={value} />` usage from the current props.
function snippet(id: string, props: Record<string, unknown>): string {
  const name = pascalCase(id) || "Component";
  const entries = Object.entries(props);
  if (entries.length === 0) return `<${name} />`;
  const lines = entries.map(([k, v]) => {
    if (typeof v === "string") return `  ${k}="${v}"`;
    if (v === true) return `  ${k}`;
    return `  ${k}={${formatValue(v)}}`;
  });
  return `<${name}\n${lines.join("\n")}\n/>`;
}

function formatValue(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}
