import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer, type ViteDevServer } from "vite";
import { openStory } from "./plugin";

// Boots a real Vite dev server with the openStory plugin and exercises the
// mounted /__pl__/mcp endpoint over HTTP. We send a self-contained `initialize`
// request — valid on its own in the SDK's stateless mode (a fresh server per
// request) — which proves the route is mounted, the transport responds, and the
// server identifies as "openstory". Tool behavior is covered exhaustively by the
// in-memory round-trip in mcp-server.test.ts.
const starterRoot = resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
  "examples/starter",
);

let server: ViteDevServer;
let baseUrl: string;

beforeAll(async () => {
  server = await createServer({
    root: starterRoot,
    configFile: false,
    logLevel: "silent",
    plugins: [openStory()],
    server: { port: 0 },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("no server address");
  baseUrl = `http://localhost:${address.port}`;
}, 30000);

afterAll(async () => {
  await server?.close();
});

async function rpc(method: string, params: unknown) {
  const res = await fetch(`${baseUrl}/__pl__/mcp`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  return res;
}

describe("/__pl__/mcp", () => {
  it("responds to initialize and identifies as openstory", async () => {
    const res = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("openstory");
  });
});
