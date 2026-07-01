import type { Manifest } from "./assemble-manifest.js";

export type AffectedReason =
  | { kind: "embed-component-changed"; componentId: string; storyId: string }
  | {
      kind: "link-target-changed";
      targetKind: "docs" | "story";
      componentId: string;
      storyId?: string;
    }
  | { kind: "doc-file-changed" }
  | { kind: "broken-embed"; embedId: string; suggestion: string | null };

export type AffectedDoc = {
  docId: string;
  sourcePath: string;
  reasons: AffectedReason[];
};

type Component = Manifest["components"][number];

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[m];
}

// Closest existing story key for a component, by edit distance — only when within
// 3 edits (else a nonsense suggestion erodes trust). null when the component is
// unknown or has no stories.
function closestStoryKey(component: Component | undefined, storyId: string): string | null {
  if (!component || component.stories.length === 0) return null;
  let best: string | null = null;
  let bestDist = Infinity;
  for (const s of component.stories) {
    const d = levenshtein(storyId, s.id);
    if (d < bestDist) {
      bestDist = d;
      best = s.id;
    }
  }
  return best !== null && bestDist <= 3 ? `${component.id}--${best}` : null;
}

// Internal component/story links the inter-doc-nav resolver wrote into doc.html.
// Page links (openstory:page/...) are not component references and are ignored.
// Each id segment is encodeURIComponent'd, so it has no raw / " ' whitespace <.
const LINK_RE = /openstory:(docs|story)\/([^/"'\s<]+)(?:\/([^/"'\s<]+))?/g;

export function detectAffectedDocs(manifest: Manifest, changedFiles: string[]): AffectedDoc[] {
  const changed = new Set(changedFiles);
  const byId = new Map<string, Component>(manifest.components.map((c) => [c.id, c]));
  const storyKeys = new Set(
    manifest.components.flatMap((c) => c.stories.map((s) => `${c.id}--${s.id}`)),
  );

  const out: AffectedDoc[] = [];
  for (const doc of manifest.docs) {
    const reasons: AffectedReason[] = [];

    if (changed.has(doc.sourcePath)) reasons.push({ kind: "doc-file-changed" });

    for (const embedId of doc.embeds) {
      const sep = embedId.indexOf("--");
      const componentId = sep === -1 ? embedId : embedId.slice(0, sep);
      const storyId = sep === -1 ? "" : embedId.slice(sep + 2);
      if (storyKeys.has(embedId)) {
        const comp = byId.get(componentId);
        if (comp?.sourcePath && changed.has(comp.sourcePath)) {
          reasons.push({ kind: "embed-component-changed", componentId, storyId });
        }
      } else {
        reasons.push({
          kind: "broken-embed",
          embedId,
          suggestion: closestStoryKey(byId.get(componentId), storyId),
        });
      }
    }

    for (const m of doc.html.matchAll(LINK_RE)) {
      const targetKind = m[1] as "docs" | "story";
      const componentId = decodeURIComponent(m[2]!);
      const comp = byId.get(componentId);
      if (!comp?.sourcePath || !changed.has(comp.sourcePath)) continue;
      if (targetKind === "story") {
        reasons.push({
          kind: "link-target-changed",
          targetKind,
          componentId,
          storyId: decodeURIComponent(m[3]!),
        });
      } else {
        reasons.push({ kind: "link-target-changed", targetKind, componentId });
      }
    }

    // Dedupe structurally-identical reasons (e.g. the same component linked twice).
    const seen = new Set<string>();
    const deduped = reasons.filter((r) => {
      const key = JSON.stringify(r);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (deduped.length > 0)
      out.push({ docId: doc.id, sourcePath: doc.sourcePath, reasons: deduped });
  }
  return out;
}

export type ChangedComponentContext = {
  componentId: string;
  gitDiff: string;
  manifestEntry: Manifest["components"][number];
};

export type DocSyncContext = {
  docId: string;
  sourcePath: string;
  docSource: string;
  reasons: AffectedReason[];
  changedComponents: ChangedComponentContext[];
};

// Assemble everything the agent needs to reconcile ONE affected doc in one shot:
// its current source, and per distinct changed component (from embed/link reasons
// only — a broken-embed's fix is the deterministic suggestion, not a diff) that
// component's git diff + current manifest entry (the new prop/story API).
export function buildDocSyncContext(
  manifest: Manifest,
  affected: AffectedDoc,
  deps: { readFile: (abs: string) => string; gitDiffFile: (abs: string, base?: string) => string },
  base?: string,
): DocSyncContext {
  let docSource = "";
  try {
    docSource = deps.readFile(affected.sourcePath);
  } catch {
    docSource = "";
  }

  const componentIds: string[] = [];
  for (const r of affected.reasons) {
    if (r.kind === "embed-component-changed" || r.kind === "link-target-changed") {
      if (!componentIds.includes(r.componentId)) componentIds.push(r.componentId);
    }
  }

  const byId = new Map(manifest.components.map((c) => [c.id, c]));
  const changedComponents: ChangedComponentContext[] = [];
  for (const id of componentIds) {
    const comp = byId.get(id);
    if (!comp || !comp.sourcePath) continue;
    changedComponents.push({
      componentId: id,
      gitDiff: deps.gitDiffFile(comp.sourcePath, base),
      manifestEntry: comp,
    });
  }

  return {
    docId: affected.docId,
    sourcePath: affected.sourcePath,
    docSource,
    reasons: affected.reasons,
    changedComponents,
  };
}
