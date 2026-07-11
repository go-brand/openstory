import { readFileSync, realpathSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isAbsolute, relative } from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  createMcpServer,
  gitChangedFiles,
  gitDiffFile,
  mergeBase,
  type Manifest,
} from "@gobrand/openstory-node";

function guardedReadFile(projectRoot: string, path: string): string {
  const canonicalRoot = realpathSync(projectRoot);
  const canonicalPath = realpathSync(path);
  const pathFromRoot = relative(canonicalRoot, canonicalPath);
  if (pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
    throw new Error(`[openstory] Refusing to read a source file outside ${canonicalRoot}.`);
  }
  return readFileSync(canonicalPath, "utf8");
}

export function createNextMcpHandler(options: {
  projectRoot: string;
  baseUrl: () => string;
}): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    const baseUrl = options.baseUrl();
    const mcp = createMcpServer({
      projectRoot: options.projectRoot,
      baseUrl,
      async getManifest() {
        const manifestResponse = await fetch(`${baseUrl}/__pl__/manifest.json`);
        if (!manifestResponse.ok) {
          throw new Error(
            `[openstory] Next manifest route failed with HTTP ${manifestResponse.status}.`,
          );
        }
        return (await manifestResponse.json()) as Manifest;
      },
      gitChangedFiles,
      gitDiffFile,
      mergeBase,
      readFile: (path) => guardedReadFile(options.projectRoot, path),
    });
    const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
    const close = () => {
      void transport.close();
      void mcp.close();
    };
    response.once("close", close);
    try {
      await mcp.connect(transport as Parameters<typeof mcp.connect>[0]);
      await transport.handleRequest(request, response);
    } catch (error) {
      if (!response.headersSent) {
        response.statusCode = 500;
        response.setHeader("content-type", "application/json");
      }
      if (!response.writableEnded) response.end(JSON.stringify({ error: String(error) }));
    }
  };
}
