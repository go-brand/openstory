type PerformanceTarget = {
  mark: (name: string) => void;
  measure: (name: string, startMark: string, endMark: string) => void;
};

export type WorkspaceDataSource = "cache" | "live";
export type PreviewRequestKind = "story" | "docs" | "page";

function getPerformance(perf?: Partial<PerformanceTarget> | null): Partial<PerformanceTarget> | null {
  return perf ?? (typeof performance === "undefined" ? null : performance);
}

function safeMark(name: string, perf?: Partial<PerformanceTarget> | null) {
  try {
    getPerformance(perf)?.mark?.(name);
  } catch {
    // User timing is diagnostic-only; never let it affect app behavior.
  }
}

function safeMeasure(
  name: string,
  startMark: string,
  endMark: string,
  perf?: Partial<PerformanceTarget> | null,
) {
  try {
    getPerformance(perf)?.measure?.(name, startMark, endMark);
  } catch {
    // Missing marks and older performance implementations should be harmless.
  }
}

export function markWorkspaceLoadStart(
  projectId: string,
  perf?: Partial<PerformanceTarget> | null,
) {
  safeMark(`openstory:workspace:${projectId}:start`, perf);
}

export function markAppLoadStart(perf?: Partial<PerformanceTarget> | null) {
  safeMark("openstory:app:start", perf);
}

export function measureAppWorkspaceDataVisible(
  source: WorkspaceDataSource,
  perf?: Partial<PerformanceTarget> | null,
) {
  const end = "openstory:app:workspace-data-visible";
  safeMark(end, perf);
  safeMeasure(`openstory:app-workspace-data-visible:${source}`, "openstory:app:start", end, perf);
}

export function measureWorkspaceDataVisible(
  projectId: string,
  source: WorkspaceDataSource,
  perf?: Partial<PerformanceTarget> | null,
) {
  const start = `openstory:workspace:${projectId}:start`;
  const end = `openstory:workspace:${projectId}:data-visible`;
  safeMark(end, perf);
  safeMeasure(`openstory:workspace-data-visible:${source}`, start, end, perf);
}

export function markPreviewRequest(
  kind: PreviewRequestKind,
  perf?: Partial<PerformanceTarget> | null,
) {
  safeMark(`openstory:preview:${kind}:request`, perf);
}

export function measurePreviewVisible(
  kind: PreviewRequestKind,
  perf?: Partial<PerformanceTarget> | null,
) {
  const start = `openstory:preview:${kind}:request`;
  const end = `openstory:preview:${kind}:visible`;
  safeMark(end, perf);
  safeMeasure(`openstory:preview-visible:${kind}`, start, end, perf);
}
