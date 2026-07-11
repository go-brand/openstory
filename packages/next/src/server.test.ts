import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { startNextPreview, type NextServerLike } from "./server.js";

function fakeNext(): NextServerLike & {
  prepare: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
} {
  return {
    prepare: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    getRequestHandler: () => async (_req: IncomingMessage, res: ServerResponse) => {
      res.end("next");
    },
    getUpgradeHandler: () => vi.fn(),
  };
}

describe("startNextPreview", () => {
  it("binds an ephemeral loopback port and delegates Next and MCP requests", async () => {
    const next = fakeNext();
    const nextFactory = vi.fn(() => next);
    const mcpHandler = vi.fn(async (_req: IncomingMessage, res: ServerResponse) => {
      res.end("mcp");
    });
    const server = await startNextPreview({
      projectRoot: "/repo",
      cacheRoot: "/cache",
      nextFactory,
      mcpHandler,
    });

    expect(server.port).toBeGreaterThan(0);
    expect(nextFactory).toHaveBeenCalledWith(
      expect.objectContaining({ hostname: "127.0.0.1", port: server.port, turbopack: true }),
    );
    await expect(fetch(`http://127.0.0.1:${server.port}/__pl__/`)).resolves.toMatchObject({
      status: 200,
    });
    expect(await (await fetch(`http://127.0.0.1:${server.port}/__pl__/mcp`)).text()).toBe("mcp");
    expect(mcpHandler).toHaveBeenCalledOnce();

    await server.close();
    await server.close();
    expect(next.close).toHaveBeenCalledOnce();
  });

  it("closes partially-created resources when Next preparation fails", async () => {
    const next = fakeNext();
    next.prepare.mockRejectedValueOnce(new Error("prepare failed"));

    await expect(
      startNextPreview({
        projectRoot: "/repo",
        cacheRoot: "/cache",
        nextFactory: () => next,
      }),
    ).rejects.toThrow("prepare failed");
    expect(next.close).toHaveBeenCalledOnce();
  });
});
