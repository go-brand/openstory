import { useEffect, useMemo, useState } from "react";
import type { AppState, ManifestComponent, PreviewSource } from "../../electron/types";
import type { Api } from "../lib/api";
import { Button } from "./ui/button";
import { HugeiconsIcon, SlidersHorizontalIcon, Copy01Icon } from "../lib/icons";
import type { PanelMode } from "./toolbar";

type Story = ManifestComponent["stories"][number] | undefined;

export function RightPanel({
  mode,
  state,
  api,
  component,
  story,
  onSetControl,
}: {
  mode: Exclude<PanelMode, null>;
  state: AppState;
  api: Api;
  component: ManifestComponent;
  story: Story;
  onSetControl: (name: string, value: unknown) => void;
}) {
  return (
    <aside className="flex w-[320px] flex-col overflow-hidden border-l border-border bg-sidebar">
      {mode === "code" ? (
        <CodePanel state={state} api={api} component={component} story={story} />
      ) : (
        <InspectPanel
          state={state}
          component={component}
          story={story}
          onSetControl={onSetControl}
        />
      )}
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
          <SectionHeader
            icon={<HugeiconsIcon icon={SlidersHorizontalIcon} className="size-3" />}
            title="Controls"
            subtitle="Tweak props live"
          />
          <div className="flex flex-col gap-4">
            {component.controls.map((c) => {
              const value = state.selection.propOverrides[c.name] ?? story.props[c.name];
              return (
                <label key={c.name} className="flex flex-col gap-1.5 text-[11px]">
                  <span className="font-medium text-muted-foreground">{c.name}</span>
                  {c.kind === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(e) => onSetControl(c.name, e.target.checked)}
                      className="size-4 accent-[var(--color-brand)]"
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
  component,
  story,
}: {
  state: AppState;
  api: Api;
  component: ManifestComponent;
  story: Story;
}) {
  const [source, setSource] = useState<PreviewSource | null | "loading">("loading");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setSource("loading");
    api
      ?.invoke("preview:getSource", component.id)
      .then((r) => alive && setSource(r))
      .catch(() => alive && setSource(null));
    return () => {
      alive = false;
    };
  }, [api, component.id]);

  // Snippet from the live props (preset + overrides) — used when there is no
  // resolvable source file, and shown while the read is in flight.
  const fallback = useMemo(() => {
    const props = { ...(story?.props ?? {}), ...state.selection.propOverrides };
    return snippet(component.id, props);
  }, [component.id, story?.props, state.selection.propOverrides]);

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

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </div>
      <span className="text-[11px] text-muted-foreground">{subtitle}</span>
    </div>
  );
}

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
