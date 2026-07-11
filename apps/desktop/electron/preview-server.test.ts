import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { PreviewServer, type PreviewChild } from "./preview-server.js";

type FakePreviewChild = PreviewChild & {
  stdout: PassThrough;
  stderr: PassThrough;
  kill: ReturnType<typeof vi.fn>;
  emit(event: "exit", code: number | null, signal: NodeJS.Signals | null): boolean;
};

function child(): FakePreviewChild {
  const process = new EventEmitter() as unknown as FakePreviewChild;
  process.stdout = new PassThrough();
  process.stderr = new PassThrough();
  process.kill = vi.fn(() => true);
  return process;
}

describe("PreviewServer", () => {
  it("keeps embedded Vite startup behind the generic adapter status", async () => {
    const close = vi.fn(async () => {});
    const createViteServer = vi.fn(async () => ({
      listen: vi.fn(async () => {}),
      close,
      httpServer: { address: () => ({ port: 5178 }) },
    }));
    const host = new PreviewServer({
      detectAdapter: async () => ({ ok: true, adapter: "vite" }),
      createViteServer: createViteServer as never,
    });

    await host.start(process.cwd());

    expect(host.status()).toEqual({
      status: "ready",
      adapter: "vite",
      port: 5178,
      error: null,
    });
    expect(createViteServer).toHaveBeenCalledWith(
      expect.objectContaining({ root: process.cwd(), mode: "openstory" }),
    );
    await host.stop();
    expect(close).toHaveBeenCalledOnce();
  });

  it("parses fragmented Next protocol lines and republishes manifest changes", async () => {
    const nextChild = child();
    const host = new PreviewServer({
      detectAdapter: async () => ({ ok: true, adapter: "next", executable: "/adapter/cli.js" }),
      spawnNext: () => nextChild,
    });
    const statuses: Array<ReturnType<typeof host.status>> = [];
    host.subscribe((status) => statuses.push(status));

    const starting = host.start("/repo");
    nextChild.stdout.write('{"type":"rea');
    nextChild.stdout.write('dy","adapter":"next","port":4123}\n');
    await starting;
    expect(host.status()).toEqual({
      status: "ready",
      adapter: "next",
      port: 4123,
      error: null,
    });

    nextChild.stdout.write('{"type":"manifest-changed","adapter":"next"}\n');
    expect(statuses.filter((status) => status.status === "ready")).toHaveLength(2);
    await host.stop();
    expect(nextChild.kill).toHaveBeenCalledOnce();
  });

  it("surfaces stderr when a Next child exits before ready", async () => {
    const nextChild = child();
    const host = new PreviewServer({
      detectAdapter: async () => ({ ok: true, adapter: "next", executable: "/adapter/cli.js" }),
      spawnNext: () => nextChild,
    });

    const starting = host.start("/repo");
    await vi.waitFor(() => expect(host.status().status).toBe("starting"));
    nextChild.stderr.write("Turbopack compile failed\n");
    nextChild.emit("exit", 1, null);
    await starting;

    expect(host.status()).toMatchObject({
      status: "error",
      adapter: "next",
      error: expect.stringContaining("Turbopack compile failed"),
    });
  });

  it("kills a superseded child and ignores its stale ready event", async () => {
    const childA = child();
    const childB = child();
    const children = [childA, childB];
    const host = new PreviewServer({
      detectAdapter: async (root) => ({
        ok: true,
        adapter: "next",
        executable: `${root}/cli.js`,
      }),
      spawnNext: () => children.shift()!,
    });

    const startA = host.start("/repo-a");
    await vi.waitFor(() => expect(host.status().status).toBe("starting"));
    const startB = host.start("/repo-b");
    await vi.waitFor(() => expect(childA.kill).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(host.status().status).toBe("starting"));
    childA.stdout.write('{"type":"ready","adapter":"next","port":1111}\n');
    childB.stdout.write('{"type":"ready","adapter":"next","port":2222}\n');
    await Promise.all([startA, startB]);

    expect(childA.kill).toHaveBeenCalledOnce();
    expect(host.status()).toMatchObject({ status: "ready", adapter: "next", port: 2222 });
    await host.stop();
  });
});
