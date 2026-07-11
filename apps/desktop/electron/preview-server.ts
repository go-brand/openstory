import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Readable } from "node:stream";
import { createServer, type InlineConfig, type ViteDevServer } from "vite";
import {
  detectPreviewAdapter,
  type PreviewAdapter,
  type PreviewAdapterDetection,
} from "./preview-adapter.js";

export type PreviewServerStatus =
  | { status: "idle"; adapter: null; port: null; error: null }
  | { status: "starting"; adapter: PreviewAdapter; port: null; error: null }
  | { status: "ready"; adapter: PreviewAdapter; port: number; error: null }
  | { status: "error"; adapter: PreviewAdapter | null; port: null; error: string };

export type PreviewChild = {
  stdout: Readable;
  stderr: Readable;
  kill(signal?: NodeJS.Signals): boolean;
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): PreviewChild;
};

type PreviewServerDependencies = {
  detectAdapter?: (root: string) => Promise<PreviewAdapterDetection>;
  createViteServer?: (config: InlineConfig) => Promise<ViteDevServer>;
  spawnNext?: (executable: string, root: string) => PreviewChild;
};

function defaultSpawnNext(executable: string, root: string): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, [executable], {
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export class PreviewServer {
  private viteServer: ViteDevServer | null = null;
  private child: PreviewChild | null = null;
  private currentRoot: string | null = null;
  private startToken = 0;
  private pendingStartResolve: (() => void) | null = null;
  private statusValue: PreviewServerStatus = {
    status: "idle",
    adapter: null,
    port: null,
    error: null,
  };
  private listeners = new Set<(status: PreviewServerStatus) => void>();

  constructor(private readonly dependencies: PreviewServerDependencies = {}) {}

  status(): PreviewServerStatus {
    return this.statusValue;
  }

  generation(): number {
    return this.startToken;
  }

  subscribe(listener: (status: PreviewServerStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(status: PreviewServerStatus) {
    this.statusValue = status;
    for (const listener of this.listeners) listener(status);
  }

  private resolvePendingStart() {
    this.pendingStartResolve?.();
    this.pendingStartResolve = null;
  }

  async start(root: string): Promise<void> {
    if (this.currentRoot === root && this.statusValue.status === "ready") return;
    const token = ++this.startToken;
    await this.stop(false);
    if (token !== this.startToken) return;
    this.currentRoot = root;

    const detection = await (this.dependencies.detectAdapter ?? detectPreviewAdapter)(root);
    if (token !== this.startToken) return;
    if (!detection.ok) {
      this.currentRoot = null;
      this.emit({ status: "error", adapter: null, port: null, error: detection.error });
      return;
    }
    this.emit({ status: "starting", adapter: detection.adapter, port: null, error: null });
    if (detection.adapter === "vite") {
      await this.startVite(root, token);
      return;
    }
    await this.startNext(root, detection.executable, token);
  }

  private async startVite(root: string, token: number): Promise<void> {
    let server: ViteDevServer | null = null;
    try {
      process.chdir(root);
      server = await (this.dependencies.createViteServer ?? createServer)({
        root,
        mode: "openstory",
        server: { port: 0, host: "127.0.0.1", strictPort: false },
        appType: "spa",
      });
      await server.listen();
      const address = server.httpServer?.address();
      if (typeof address !== "object" || address === null) {
        throw new Error("Vite server did not return an address");
      }
      if (token !== this.startToken || this.currentRoot !== root) {
        await server.close().catch(() => {});
        return;
      }
      this.viteServer = server;
      this.emit({ status: "ready", adapter: "vite", port: address.port, error: null });
    } catch (error) {
      await server?.close().catch(() => {});
      if (token !== this.startToken) return;
      this.currentRoot = null;
      this.emit({
        status: "error",
        adapter: "vite",
        port: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async startNext(root: string, executable: string, token: number): Promise<void> {
    const child = (this.dependencies.spawnNext ?? defaultSpawnNext)(executable, root);
    this.child = child;
    let stdoutBuffer = "";
    let stderr = "";

    return new Promise<void>((resolveStart) => {
      this.pendingStartResolve = resolveStart;
      const finish = () => {
        if (this.pendingStartResolve === resolveStart) this.resolvePendingStart();
        else resolveStart();
      };
      const fail = (message: string) => {
        if (token !== this.startToken || this.child !== child) {
          finish();
          return;
        }
        child.kill("SIGTERM");
        this.child = null;
        this.currentRoot = null;
        this.emit({ status: "error", adapter: "next", port: null, error: message });
        finish();
      };
      const handleLine = (line: string) => {
        if (!line.trim()) return;
        let event: unknown;
        try {
          event = JSON.parse(line);
        } catch {
          return;
        }
        if (typeof event !== "object" || event === null) return;
        const protocol = event as {
          type?: unknown;
          adapter?: unknown;
          port?: unknown;
          message?: unknown;
        };
        if (protocol.adapter !== "next") return;
        if (protocol.type === "ready" && typeof protocol.port === "number") {
          if (token !== this.startToken || this.child !== child) return;
          this.emit({ status: "ready", adapter: "next", port: protocol.port, error: null });
          finish();
        } else if (protocol.type === "manifest-changed") {
          if (
            token === this.startToken &&
            this.child === child &&
            this.statusValue.status === "ready"
          ) {
            this.emit({ ...this.statusValue });
          }
        } else if (protocol.type === "error" && typeof protocol.message === "string") {
          fail(protocol.message);
        }
      };

      child.stdout.on("data", (chunk) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) handleLine(line);
      });
      child.stderr.on("data", (chunk) => {
        stderr = `${stderr}${chunk.toString()}`.slice(-16_384);
      });
      child.once("exit", (code, signal) => {
        if (token !== this.startToken || this.child !== child) {
          finish();
          return;
        }
        this.child = null;
        const detail =
          stderr.trim() || `process exited with ${signal ?? `code ${code ?? "unknown"}`}`;
        if (this.statusValue.status !== "error") {
          this.currentRoot = null;
          this.emit({ status: "error", adapter: "next", port: null, error: detail });
        }
        finish();
      });
    });
  }

  async stop(invalidatePendingStart = true): Promise<void> {
    if (invalidatePendingStart) this.startToken++;
    const viteServer = this.viteServer;
    const child = this.child;
    this.viteServer = null;
    this.child = null;
    this.currentRoot = null;
    if (child) child.kill("SIGTERM");
    this.resolvePendingStart();
    await viteServer?.close().catch(() => {});
    this.emit({ status: "idle", adapter: null, port: null, error: null });
  }
}
