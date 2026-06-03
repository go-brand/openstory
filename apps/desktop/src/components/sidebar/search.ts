import { isContainer, type TreeNode } from "./build-tree";

function subsequence(q: string, t: string): boolean {
  let i = 0;
  for (let j = 0; j < t.length && i < q.length; j++) {
    if (t[j] === q[i]) i++;
  }
  return i === q.length;
}

/**
 * Match rank for a label against a query: 0 exact, 1 prefix, 2 substring,
 * 3 subsequence, null no match. Lower is better — exact labels never get buried
 * under fuzzy ones (the Storybook #10757 fix).
 */
export function rank(query: string, label: string): number | null {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = label.toLowerCase();
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  if (t.includes(q)) return 2;
  if (subsequence(q, t)) return 3;
  return null;
}

/**
 * Prune the tree to nodes that match `query` (by label) or have a matching
 * descendant. Ancestors of matches are kept and returned in `expand` so the UI
 * auto-opens the path to every hit. Empty query → original tree, empty set.
 */
export function filterTree(
  nodes: TreeNode[],
  query: string,
): { nodes: TreeNode[]; expand: Set<string> } {
  if (!query) return { nodes, expand: new Set() };
  const expand = new Set<string>();

  function visit(node: TreeNode): TreeNode | null {
    const selfMatch = rank(query, node.label) !== null;
    if (!isContainer(node)) return selfMatch ? node : null;
    const kept = node.children.map(visit).filter((c): c is TreeNode => c !== null);
    if (kept.length > 0) {
      expand.add(node.id);
      return { ...node, children: kept } as TreeNode;
    }
    return selfMatch ? node : null;
  }

  const out = nodes.map(visit).filter((n): n is TreeNode => n !== null);
  return { nodes: out, expand };
}
