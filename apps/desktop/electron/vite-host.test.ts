import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "vite";
import { ViteHost } from "./vite-host";

vi.mock("vite", () => ({
  createServer: vi.fn(),
}));

type MockServer = {
  listen: ReturnType<typeof vi.fn<() => Promise<void>>>;
  close: ReturnType<typeof vi.fn<() => Promise<void>>>;
  httpServer: { address: () => { port: number } };
};

function server(port: number): MockServer {
  return {
    listen: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    httpServer: { address: () => ({ port }) },
  };
}

const cwd = process.cwd();
const tempRoots: string[] = [];

afterEach(() => {
  process.chdir(cwd);
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("ViteHost", () => {
  it("does not publish a stale ready status from an older overlapping start", async () => {
    const rootA = mkdtempSync(join(tmpdir(), "openstory-a-"));
    const rootB = mkdtempSync(join(tmpdir(), "openstory-b-"));
    tempRoots.push(rootA, rootB);

    const serverA = server(1111);
    const serverB = server(2222);
    let releaseA!: () => void;
    let rootARequested!: () => void;
    const waitForRootARequest = new Promise<void>((resolve) => {
      rootARequested = resolve;
    });

    vi.mocked(createServer).mockImplementation((config) => {
      const root = (config as { root?: string } | undefined)?.root;
      if (root === rootA) {
        return new Promise((resolve) => {
          rootARequested();
          releaseA = () => resolve(serverA as never);
        });
      }
      return Promise.resolve(serverB as never);
    });

    const host = new ViteHost();
    const statuses: Array<ReturnType<ViteHost["status"]>> = [];
    host.subscribe((status) => statuses.push(status));

    const startA = host.start(rootA);
    await waitForRootARequest;
    const startB = host.start(rootB);

    await startB;
    expect(host.status()).toEqual({ status: "ready", port: 2222, error: null });

    releaseA();
    await startA;

    expect(serverA.close).toHaveBeenCalledTimes(1);
    expect(host.status()).toEqual({ status: "ready", port: 2222, error: null });
    expect(statuses.filter((status) => status.status === "ready")).toEqual([
      { status: "ready", port: 2222, error: null },
    ]);
  });
});
