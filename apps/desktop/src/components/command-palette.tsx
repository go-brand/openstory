import { useEffect, useMemo, useRef, useState } from "react";
import type { AppState } from "../../electron/types";
import type { Api } from "../lib/api";
import { cn } from "../lib/utils";
import { HugeiconsIcon, Search01Icon, PackageIcon, Folder01Icon } from "../lib/icons";

type Item =
  | { kind: "preview"; id: string; label: string; meta: string }
  | { kind: "repo"; id: string; label: string };

// Subsequence match: every char of `query` appears in `text` in order. Cheap,
// dependency-free, and good enough for a component list.
function fuzzy(query: string, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let i = 0;
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] === q[i]) i++;
  }
  return i === q.length;
}

export function CommandPalette({
  open,
  onClose,
  state,
  api,
}: {
  open: boolean;
  onClose: () => void;
  state: AppState;
  api: Api;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo<Item[]>(() => {
    const previews: Item[] = state.manifest
      .filter((p) => fuzzy(query, `${p.id} ${p.group}`))
      .map((p) => ({
        kind: "preview",
        id: p.id,
        label: p.id,
        meta: p.group || "—",
      }));
    // Other repos surface as switch actions — only the active repo's components
    // are loaded (single Vite host), so jumping repos goes through project:select.
    const repos: Item[] = state.projects
      .filter((p) => p.id !== state.selection.projectId && fuzzy(query, p.name))
      .map((p) => ({ kind: "repo", id: p.id, label: p.name }));
    return [...previews, ...repos];
  }, [query, state.manifest, state.projects, state.selection.projectId]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      inputRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  function choose(item: Item) {
    if (item.kind === "preview") {
      const preview = state.manifest.find((p) => p.id === item.id);
      api?.invoke("preview:set", {
        previewId: item.id,
        variantId: preview?.variants[0]?.id ?? "",
        viewport: state.selection.viewport,
      });
    } else {
      api?.invoke("project:select", item.id);
    }
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const it = items[active];
      if (it) choose(it);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]"
      onMouseDown={onClose}
    >
      <div
        className="w-[560px] overflow-hidden rounded-xl border border-line-strong bg-elevated shadow-2xl shadow-black/60"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-3.5">
          <HugeiconsIcon icon={Search01Icon} className="size-4 text-neutral-500" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search components…"
            className="h-11 flex-1 bg-transparent text-[13px] text-neutral-100 placeholder:text-neutral-600 focus:outline-none"
          />
          <kbd className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
            esc
          </kbd>
        </div>

        <div className="max-h-[320px] overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center text-[12px] text-neutral-600">No matches</div>
          ) : (
            items.map((it, i) => (
              <button
                key={`${it.kind}:${it.id}`}
                type="button"
                onMouseMove={() => setActive(i)}
                onClick={() => choose(it)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] transition-colors",
                  i === active ? "bg-accent-soft text-blue-200" : "text-neutral-300",
                )}
              >
                <HugeiconsIcon
                  icon={it.kind === "preview" ? PackageIcon : Folder01Icon}
                  className="size-4 shrink-0 text-neutral-500"
                />
                <span className="truncate">{it.label}</span>
                <span className="ml-auto shrink-0 text-[10px] tracking-wide text-neutral-600 uppercase">
                  {it.kind === "preview" ? it.meta : "Switch repo"}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
