import type { AppState } from "../../electron/types";
import type { Api } from "../lib/api";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import {
  HugeiconsIcon,
  FolderAddIcon,
  Folder01Icon,
  ArrowRight01Icon,
  ArrowDown01Icon,
  Cancel01Icon,
} from "../lib/icons";

// Repositories as an accordion: exactly one repo is expanded — the active
// project — and its grouped previews render beneath it (ungrouped first, then
// the group tree). Expanding a
// collapsed repo selects it (boots its Vite host, loads its manifest). Other
// repos stay collapsed and unloaded by design of the single Vite host.
function GroupTree({
  nodes,
  depth,
  activePreviewId,
  onSelectPreview,
}: {
  nodes: GroupNode[];
  depth: number;
  activePreviewId: string | undefined;
  onSelectPreview: (previewId: string, variantId: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.path} className="flex flex-col gap-1">
          <div
            className="flex items-center justify-between px-1"
            style={{ paddingLeft: depth * 8 }}
          >
            <span className="text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
              {node.name}
            </span>
            {node.previews.length > 0 && (
              <span className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground tabular-nums">
                {node.previews.length}
              </span>
            )}
          </div>
          {node.previews.map((p) => (
            <PreviewButton
              key={p.id}
              preview={p}
              selected={p.id === activePreviewId}
              onSelectPreview={onSelectPreview}
            />
          ))}
          {node.children.length > 0 && (
            <GroupTree
              nodes={node.children}
              depth={depth + 1}
              activePreviewId={activePreviewId}
              onSelectPreview={onSelectPreview}
            />
          )}
        </div>
      ))}
    </>
  );
}

function PreviewButton({
  preview,
  selected,
  onSelectPreview,
}: {
  preview: AppState["manifest"][number];
  selected: boolean;
  onSelectPreview: (previewId: string, variantId: string) => void;
}) {
  return (
    <Button
      variant={selected ? "active" : "ghost"}
      size="sm"
      className="relative h-8 w-full justify-start pl-3"
      onClick={() => onSelectPreview(preview.id, preview.variants[0]?.id ?? "")}
    >
      {selected && (
        <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-brand" />
      )}
      {preview.id}
    </Button>
  );
}

export function Sidebar({
  state,
  api,
  activePreviewId,
  onSelectPreview,
}: {
  state: AppState;
  api: Api;
  activePreviewId: string | undefined;
  onSelectPreview: (previewId: string, variantId: string) => void;
}) {
  async function onPickFolder() {
    if (!api) return;
    const path = await api.invoke("project:pickFolder");
    if (path) {
      const record = await api.invoke("project:add", path);
      await api.invoke("project:select", record.id);
    }
  }

  const tree = buildGroupTree(state.manifest);

  return (
    <aside className="flex w-[260px] flex-col border-r border-border bg-sidebar">
      <div className="no-drag flex flex-1 flex-col overflow-y-auto px-3 py-3">
        <div className="mb-1.5 px-1 text-[10px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          Repositories
        </div>

        <div className="flex flex-col gap-0.5">
          {state.projects.map((proj) => {
            const isActive = proj.id === state.selection.projectId;
            return (
              <div key={proj.id}>
                <div className="group relative flex items-center">
                  <button
                    type="button"
                    onClick={() => (isActive ? undefined : api?.invoke("project:select", proj.id))}
                    className={cn(
                      "flex h-8 flex-1 items-center gap-1.5 rounded-lg px-2 text-[12px] transition-colors",
                      isActive
                        ? "text-foreground"
                        : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                    )}
                  >
                    <HugeiconsIcon
                      icon={isActive ? ArrowDown01Icon : ArrowRight01Icon}
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    <HugeiconsIcon
                      icon={Folder01Icon}
                      className={cn(
                        "size-3.5 shrink-0",
                        isActive ? "text-brand" : "text-muted-foreground",
                      )}
                    />
                    <span className="truncate font-medium">{proj.name}</span>
                  </button>
                  <button
                    type="button"
                    title="Remove repository"
                    onClick={() => api?.invoke("project:remove", proj.id)}
                    className="absolute right-1 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/[0.06] hover:text-foreground group-hover:opacity-100"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                  </button>
                </div>

                {isActive && (
                  <div className="mt-0.5 mb-1.5 flex flex-col gap-3 pl-3.5">
                    {state.manifest.length === 0 ? (
                      <p className="rounded-lg border border-border bg-card/60 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                        No previews found in{" "}
                        <code className="rounded bg-foreground/[0.06] px-1 py-0.5 text-muted-foreground">
                          openstory.config.ts
                        </code>
                        .
                      </p>
                    ) : (
                      <>
                        {tree.ungrouped.map((p) => (
                          <PreviewButton
                            key={p.id}
                            preview={p}
                            selected={p.id === activePreviewId}
                            onSelectPreview={onSelectPreview}
                          />
                        ))}
                        <GroupTree
                          nodes={tree.roots}
                          depth={0}
                          activePreviewId={activePreviewId}
                          onSelectPreview={onSelectPreview}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Button
          variant="secondary"
          size="sm"
          className="mt-2 justify-start"
          onClick={onPickFolder}
          disabled={!api}
        >
          <HugeiconsIcon icon={FolderAddIcon} />
          Add repository…
        </Button>

        {state.projects.length === 0 && (
          <p className="mt-3 px-1 text-[11px] leading-relaxed text-muted-foreground">
            Add a repository to load its OpenStory previews.
          </p>
        )}
      </div>
    </aside>
  );
}

type GroupNode = {
  name: string;
  path: string;
  children: GroupNode[];
  previews: AppState["manifest"];
};

// Build a nested tree from slash-delimited `group` paths. Previews with an
// empty group are returned separately as root-level leaves (rendered first).
function buildGroupTree(manifest: AppState["manifest"]): {
  ungrouped: AppState["manifest"];
  roots: GroupNode[];
} {
  const ungrouped: AppState["manifest"] = [];
  const roots: GroupNode[] = [];

  function childByName(list: GroupNode[], name: string, path: string): GroupNode {
    let node = list.find((n) => n.name === name);
    if (!node) {
      node = { name, path, children: [], previews: [] };
      list.push(node);
    }
    return node;
  }

  for (const p of manifest) {
    const segments = (p.group ?? "")
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean);
    if (segments.length === 0) {
      ungrouped.push(p);
      continue;
    }
    let level = roots;
    let acc = "";
    let node: GroupNode | null = null;
    for (const seg of segments) {
      acc = acc ? `${acc}/${seg}` : seg;
      node = childByName(level, seg, acc);
      level = node.children;
    }
    node!.previews.push(p);
  }

  return { ungrouped, roots };
}
