import { Dialog } from "@base-ui/react/dialog";
import { useState } from "react";
import type { WorkspaceInspection } from "../../electron/workspace-discovery";
import { HugeiconsIcon, Folder01Icon } from "../lib/icons";

export function workspaceDiscoverySnapshot(
  inspection: WorkspaceInspection,
  selectedPaths: ReadonlySet<string>,
) {
  const count = selectedPaths.size;
  return {
    repositoryLabel: inspection.repository.label,
    repositorySlug: inspection.repository.slug,
    confirmLabel:
      count === 0 ? "Add workspaces" : `Add ${count} workspace${count === 1 ? "" : "s"}`,
    rows: inspection.candidates.map((candidate) => ({
      label: candidate.identity.workspace.label,
      relativePath: candidate.identity.workspace.relativePath,
      selected: selectedPaths.has(candidate.path),
    })),
  };
}

export function initialWorkspaceSelection(inspection: WorkspaceInspection) {
  return new Set(inspection.candidates.map((candidate) => candidate.path));
}

export function WorkspaceDiscoveryList({
  inspection,
  selectedPaths,
  onToggle,
}: {
  inspection: WorkspaceInspection;
  selectedPaths: ReadonlySet<string>;
  onToggle: (path: string) => void;
}) {
  const snapshot = workspaceDiscoverySnapshot(inspection, selectedPaths);
  return (
    <div className="max-h-[320px] space-y-1 overflow-y-auto p-2">
      {inspection.candidates.map((candidate, index) => {
        const row = snapshot.rows[index]!;
        return (
          <label
            key={candidate.path}
            className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-accent"
          >
            <input
              type="checkbox"
              checked={row.selected}
              onChange={() => onToggle(candidate.path)}
              className="size-3.5 accent-[var(--brand)]"
            />
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-foreground/[0.05] text-muted-foreground">
              <HugeiconsIcon icon={Folder01Icon} className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-foreground">
                {row.label}
              </span>
              <span className="mt-0.5 block truncate font-mono text-[10px] text-muted-foreground">
                {row.relativePath}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export function WorkspaceDiscoveryDialog({
  inspection,
  onCancel,
  onConfirm,
}: {
  inspection: WorkspaceInspection | null;
  onCancel: () => void;
  onConfirm: (paths: string[]) => void;
}) {
  if (!inspection) return null;
  return (
    <WorkspaceDiscoveryDialogContent
      key={inspection.candidates.map((candidate) => candidate.path).join("\0")}
      inspection={inspection}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

function WorkspaceDiscoveryDialogContent({
  inspection,
  onCancel,
  onConfirm,
}: {
  inspection: WorkspaceInspection;
  onCancel: () => void;
  onConfirm: (paths: string[]) => void;
}) {
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(() =>
    initialWorkspaceSelection(inspection),
  );
  const snapshot = workspaceDiscoverySnapshot(inspection, selectedPaths);

  function toggle(path: string) {
    setSelectedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onCancel()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-[1px] transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Viewport className="fixed inset-0 z-[70] flex items-center justify-center p-6">
          <Dialog.Popup className="w-full max-w-[440px] rounded-xl border border-input bg-popover text-popover-foreground shadow-2xl shadow-black/40 outline-none transition-[transform,scale,opacity] data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <div className="border-b border-border px-5 py-4">
              <Dialog.Title className="text-[14px] font-semibold text-foreground">
                Choose OpenStory workspaces
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[12px] leading-5 text-muted-foreground">
                Found in {snapshot.repositoryLabel}
                {snapshot.repositorySlug ? ` · ${snapshot.repositorySlug}` : ""}
              </Dialog.Description>
            </div>

            <WorkspaceDiscoveryList
              inspection={inspection}
              selectedPaths={selectedPaths}
              onToggle={toggle}
            />

            <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
              <Dialog.Close className="h-7 rounded-md px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                Cancel
              </Dialog.Close>
              <button
                type="button"
                disabled={selectedPaths.size === 0}
                onClick={() => onConfirm([...selectedPaths])}
                className="h-7 rounded-md bg-brand px-3 text-[12px] font-medium text-white transition-colors hover:bg-brand/90 disabled:pointer-events-none disabled:opacity-45"
              >
                {snapshot.confirmLabel}
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
