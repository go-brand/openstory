import { useCallback, useEffect, useRef, useState } from "react";

// Collapse state is a pure UI concern — persisted in localStorage per repo so it
// survives reloads without IPC chatter. We store the EXPANDED set, so unknown/new
// nodes default to collapsed. Default-on-first-run: only the first-level
// containers are expanded (passed in as `defaultExpanded`); everything deeper
// reads as closed and the user drills in.
function storageKey(projectId: string | null): string {
  return `openstory:sidebar:expanded:${projectId ?? "none"}`;
}

export function useExpanded(projectId: string | null, defaultExpanded: string[]) {
  // We store the EXPANDED set (so unknown/new nodes default to collapsed).
  const [expandedSet, setExpandedSet] = useState<Set<string>>(new Set());
  // Per-project guard: once we have authoritative state (persisted or seeded),
  // stop seeding so a user's collapse of a first-level node isn't undone.
  const initializedProject = useRef<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(projectId));
      if (raw !== null) {
        // Persisted state wins; never seed over it.
        setExpandedSet(new Set(JSON.parse(raw) as string[]));
        initializedProject.current = projectId;
      } else {
        // No persisted state yet — wait for the tree, then seed first-level.
        setExpandedSet(new Set());
        initializedProject.current = null;
      }
    } catch {
      setExpandedSet(new Set());
      initializedProject.current = null;
    }
  }, [projectId]);

  // Seed the first-level containers once the tree is known, if nothing persisted.
  useEffect(() => {
    if (initializedProject.current === projectId) return; // already authoritative
    if (defaultExpanded.length === 0) return; // tree not ready yet
    setExpandedSet(new Set(defaultExpanded));
    initializedProject.current = projectId;
  }, [projectId, defaultExpanded]);

  const persist = useCallback(
    (next: Set<string>) => {
      setExpandedSet(next);
      initializedProject.current = projectId; // a user action is authoritative
      try {
        localStorage.setItem(storageKey(projectId), JSON.stringify([...next]));
      } catch {
        // Non-fatal: expand state just won't persist this session.
      }
    },
    [projectId],
  );

  const isExpanded = useCallback((id: string) => expandedSet.has(id), [expandedSet]);

  const toggle = useCallback(
    (id: string) => {
      const next = new Set(expandedSet);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persist(next);
    },
    [expandedSet, persist],
  );

  const setExpanded = useCallback(
    (id: string, expanded: boolean) => {
      const next = new Set(expandedSet);
      if (expanded) next.add(id);
      else next.delete(id);
      persist(next);
    },
    [expandedSet, persist],
  );

  return { isExpanded, toggle, setExpanded };
}
