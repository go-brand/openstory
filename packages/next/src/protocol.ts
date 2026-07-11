export type NextProtocolEvent =
  | { type: "ready"; adapter: "next"; port: number }
  | { type: "manifest-changed"; adapter: "next" }
  | { type: "error"; adapter: "next"; message: string };

export type ProtocolReporter = {
  ready(port: number): void;
  manifestChanged(): void;
  error(error: unknown): void;
};

export function createProtocolReporter(writeLine: (line: string) => void): ProtocolReporter {
  let didReportReady = false;
  const report = (event: NextProtocolEvent) => writeLine(JSON.stringify(event));
  return {
    ready(port) {
      if (didReportReady) return;
      didReportReady = true;
      report({ type: "ready", adapter: "next", port });
    },
    manifestChanged() {
      report({ type: "manifest-changed", adapter: "next" });
    },
    error(error) {
      report({
        type: "error",
        adapter: "next",
        message: error instanceof Error ? error.message : String(error),
      });
    },
  };
}
