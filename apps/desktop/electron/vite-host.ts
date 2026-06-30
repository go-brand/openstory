import { createServer, type ViteDevServer } from "vite";

export type ViteHostStatus =
  | { status: "idle"; port: null; error: null }
  | { status: "starting"; port: null; error: null }
  | { status: "ready"; port: number; error: null }
  | { status: "error"; port: null; error: string };

export class ViteHost {
  private server: ViteDevServer | null = null;
  private currentRoot: string | null = null;
  private statusValue: ViteHostStatus = {
    status: "idle",
    port: null,
    error: null,
  };
  private listeners = new Set<(s: ViteHostStatus) => void>();

  status(): ViteHostStatus {
    return this.statusValue;
  }

  subscribe(listener: (s: ViteHostStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(next: ViteHostStatus) {
    this.statusValue = next;
    for (const l of this.listeners) l(next);
  }

  async start(root: string): Promise<void> {
    if (this.currentRoot === root && this.statusValue.status === "ready") return;
    await this.stop();
    this.currentRoot = root;
    this.emit({ status: "starting", port: null, error: null });
    let server: ViteDevServer | null = null;
    try {
      // Run the embedded Vite with the project as the working directory, exactly
      // like the `vite` CLI does. Vite and some framework plugins read
      // cwd-relative paths (e.g. `./package.json`); when the app is launched from
      // Finder/Dock the process cwd is `/`, so without this they fail with
      // "ENOENT: open './package.json'". `root` alone isn't enough — cwd must
      // match too.
      process.chdir(root);
      server = await createServer({
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
      this.server = server;
      this.emit({ status: "ready", port: address.port, error: null });
    } catch (err) {
      // listen() can throw after createServer() succeeds; close the orphan so
      // we never leak a server/port that stop() can no longer reach.
      await server?.close().catch(() => {});
      const message = err instanceof Error ? err.message : String(err);
      this.emit({ status: "error", port: null, error: message });
      this.currentRoot = null;
    }
  }

  async stop(): Promise<void> {
    if (!this.server) {
      this.emit({ status: "idle", port: null, error: null });
      return;
    }
    try {
      await this.server.close();
    } finally {
      this.server = null;
      this.currentRoot = null;
      this.emit({ status: "idle", port: null, error: null });
    }
  }
}
