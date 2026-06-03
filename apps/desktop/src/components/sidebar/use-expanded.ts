import { useCallback, useEffect, useState } from "react";

// Collapse state is a pure UI concern — persisted in localStorage per repo so it
// survives reloads without IPC chatter. Default: everything expanded (a fresh
// tree reads as open, matching Storybook).
function storageKey(projectId: string | null): string {
  return `openstory:sidebar:collapsed:${projectId ?? "none"}`;
}

export function useExpanded(projectId: string | null) {
  // We store the COLLAPSED set (so unknown/new nodes default to expanded).
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(projectId));
      setCollapsed(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setCollapsed(new Set());
    }
  }, [projectId]);

  const persist = useCallback(
    (next: Set<string>) => {
      setCollapsed(next);
      try {
        localStorage.setItem(storageKey(projectId), JSON.stringify([...next]));
      } catch {
        // Non-fatal: collapse state just won't persist this session.
      }
    },
    [projectId],
  );

  const isExpanded = useCallback((id: string) => !collapsed.has(id), [collapsed]);

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(collapsed);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist(next);
    },
    [collapsed, persist],
  );

  const setExpanded = useCallback(
    (id: string, expanded: boolean) => {
      const next = new Set(collapsed);
      if (expanded) next.delete(id);
      else next.add(id);
      persist(next);
    },
    [collapsed, persist],
  );

  return { isExpanded, toggle, setExpanded };
}
