import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { createNextMcpHandler } from "./mcp.js";

export type NextServerLike = {
  prepare(): Promise<void>;
  close(): Promise<void>;
  getRequestHandler(): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
  getUpgradeHandler(): (request: IncomingMessage, socket: Duplex, head: Buffer) => Promise<void>;
};

export type NextFactory = (options: {
  dev: true;
  dir: string;
  turbopack: true;
  hostname: "127.0.0.1";
  port: number;
}) => NextServerLike | Promise<NextServerLike>;

export type NextPreviewServer = {
  port: number;
  close(): Promise<void>;
};

export type McpRequestHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => Promise<void>;

async function defaultNextFactory(options: Parameters<NextFactory>[0]): Promise<NextServerLike> {
  const { default: next } = await import("next");
  return next(options);
}

async function closeHttpServer(server: ReturnType<typeof createServer>): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

export async function startNextPreview(options: {
  projectRoot: string;
  cacheRoot: string;
  nextFactory?: NextFactory;
  mcpHandler?: McpRequestHandler;
}): Promise<NextPreviewServer> {
  const nextFactory = options.nextFactory ?? defaultNextFactory;
  let mcpHandler = options.mcpHandler;
  let nextHandler: ReturnType<NextServerLike["getRequestHandler"]> | null = null;
  let upgradeHandler: ReturnType<NextServerLike["getUpgradeHandler"]> | null = null;
  const httpServer = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (pathname === "/__pl__/mcp" && mcpHandler) {
        await mcpHandler(request, response);
        return;
      }
      if (!nextHandler) {
        response.statusCode = 503;
        response.end("OpenStory Next server is starting");
        return;
      }
      await nextHandler(request, response);
    } catch (error) {
      if (!response.headersSent) response.statusCode = 500;
      if (!response.writableEnded) response.end(String(error));
    }
  });
  httpServer.on("upgrade", (request, socket, head) => {
    if (upgradeHandler) void upgradeHandler(request, socket, head);
    else socket.destroy();
  });

  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(0, "127.0.0.1", () => {
        httpServer.off("error", reject);
        resolve();
      });
    });
  } catch (error) {
    await closeHttpServer(httpServer);
    throw error;
  }

  const address = httpServer.address();
  if (!address || typeof address === "string") {
    await closeHttpServer(httpServer);
    throw new Error("[openstory] Next preview server did not bind a TCP port.");
  }
  mcpHandler ??= createNextMcpHandler({
    projectRoot: options.projectRoot,
    baseUrl: () => `http://127.0.0.1:${address.port}`,
  });

  let nextServer: NextServerLike | null = null;
  try {
    nextServer = await nextFactory({
      dev: true,
      dir: options.cacheRoot,
      turbopack: true,
      hostname: "127.0.0.1",
      port: address.port,
    });
    await nextServer.prepare();
    nextHandler = nextServer.getRequestHandler();
    upgradeHandler = nextServer.getUpgradeHandler();
  } catch (error) {
    await closeHttpServer(httpServer);
    if (nextServer) await nextServer.close();
    throw error;
  }
  const preparedNextServer = nextServer;

  let closePromise: Promise<void> | null = null;
  return {
    port: address.port,
    close() {
      closePromise ??= Promise.allSettled([
        closeHttpServer(httpServer),
        preparedNextServer.close(),
      ]).then((results) => {
        const rejected = results.find(
          (result): result is PromiseRejectedResult => result.status === "rejected",
        );
        if (rejected) throw rejected.reason;
      });
      return closePromise;
    },
  };
}
