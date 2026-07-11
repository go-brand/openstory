#!/usr/bin/env node

import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";
import type { OpenStoryConfig } from "@gobrand/openstory-config";
import { matchFiles, partitionByExtension, resolvePatterns } from "@gobrand/openstory-node";
import { resolveNextCacheRoot } from "./cache.js";
import { inspectNextProject } from "./project.js";
import { createProtocolReporter, type ProtocolReporter } from "./protocol.js";
import { generateShadowApp } from "./shadow-app.js";
import { startNextPreview, type NextPreviewServer } from "./server.js";
import { watchManifestMembership, type ManifestWatcher } from "./watcher.js";

const CONFIG_CANDIDATES = [
  "openstory.config.ts",
  "openstory.config.mts",
  "openstory.config.mjs",
  "openstory.config.js",
];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function findConfig(projectRoot: string): Promise<string | null> {
  for (const candidate of CONFIG_CANDIDATES) {
    const path = join(projectRoot, candidate);
    if (await exists(path)) return path;
  }
  return null;
}

async function hasWorkspaces(packageJsonPath: string): Promise<boolean> {
  try {
    const manifest = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      workspaces?: unknown;
    };
    return Array.isArray(manifest.workspaces) || typeof manifest.workspaces === "object";
  } catch {
    return false;
  }
}

export async function findWorkspaceRoot(projectRoot: string): Promise<string> {
  let directory = projectRoot;
  const filesystemRoot = parse(directory).root;
  while (true) {
    if (
      (await exists(join(directory, "pnpm-workspace.yaml"))) ||
      (await hasWorkspaces(join(directory, "package.json")))
    ) {
      return directory;
    }
    if (directory === filesystemRoot) return projectRoot;
    directory = dirname(directory);
  }
}

async function loadConfig(configPath: string | null): Promise<OpenStoryConfig | null> {
  if (!configPath) return null;
  const jiti = createJiti(import.meta.url, { fsCache: false, moduleCache: false });
  return jiti.import<OpenStoryConfig>(configPath, { default: true });
}

function resolveStylePaths(
  projectRoot: string,
  config: OpenStoryConfig | null,
): string[] | undefined {
  if (!config?.styles?.length) return undefined;
  return config.styles.map((path) => {
    if (isAbsolute(path)) return path;
    if (path.startsWith(".")) return resolve(projectRoot, path);
    return path;
  });
}

export type RunningNextCli = {
  port: number;
  close(): Promise<void>;
};

export async function runNextCli(
  options: {
    projectRoot?: string;
    reporter?: ProtocolReporter;
    startServer?: typeof startNextPreview;
  } = {},
): Promise<RunningNextCli> {
  const selectedRoot = resolve(options.projectRoot ?? process.cwd());
  const inspection = await inspectNextProject(selectedRoot);
  const projectRoot = inspection.projectRoot;
  const workspaceRoot = await findWorkspaceRoot(projectRoot);
  const cacheRoot = await resolveNextCacheRoot(projectRoot);
  const reporter =
    options.reporter ?? createProtocolReporter((line) => process.stdout.write(`${line}\n`));
  let configPath = await findConfig(projectRoot);
  let config = await loadConfig(configPath);
  let patterns = resolvePatterns(config);

  const regenerate = async () => {
    configPath = await findConfig(projectRoot);
    config = await loadConfig(configPath);
    patterns = resolvePatterns(config);
    const { storyFiles } = partitionByExtension(matchFiles(projectRoot, patterns));
    const stylePaths = resolveStylePaths(projectRoot, config);
    await generateShadowApp({
      projectRoot,
      workspaceRoot,
      cacheRoot,
      configPath,
      storyFiles,
      ...(stylePaths ? { stylePaths } : {}),
      workspaceRoots: workspaceRoot === projectRoot ? [] : [workspaceRoot],
    });
  };

  await regenerate();
  let previewServer: NextPreviewServer | null = null;
  let watcher: ManifestWatcher | null = null;
  try {
    previewServer = await (options.startServer ?? startNextPreview)({ projectRoot, cacheRoot });
    watcher = watchManifestMembership({
      projectRoot,
      getPatterns: () => patterns,
      getConfigPath: () => configPath,
      async onRegenerate() {
        try {
          await regenerate();
          reporter.manifestChanged();
        } catch (error) {
          reporter.error(error);
          process.stderr.write(
            `[openstory] Failed to refresh the Next registry: ${String(error)}\n`,
          );
        }
      },
    });
    reporter.ready(previewServer.port);
  } catch (error) {
    await Promise.allSettled([watcher?.close(), previewServer?.close()]);
    throw error;
  }

  let closePromise: Promise<void> | null = null;
  const runningWatcher = watcher;
  const runningServer = previewServer;
  return {
    port: runningServer.port,
    close() {
      closePromise ??= Promise.allSettled([runningWatcher.close(), runningServer.close()]).then(
        (results) => {
          const failure = results.find(
            (result): result is PromiseRejectedResult => result.status === "rejected",
          );
          if (failure) throw failure.reason;
        },
      );
      return closePromise;
    },
  };
}

async function main(): Promise<void> {
  const reporter = createProtocolReporter((line) => process.stdout.write(`${line}\n`));
  let running: RunningNextCli | null = null;
  try {
    running = await runNextCli({ reporter });
  } catch (error) {
    reporter.error(error);
    process.stderr.write(`[openstory] Failed to start the Next adapter: ${String(error)}\n`);
    process.exitCode = 1;
    return;
  }

  await new Promise<void>((resolveShutdown) => {
    let shuttingDown = false;
    const shutdown = () => {
      if (shuttingDown) return;
      shuttingDown = true;
      void running?.close().finally(resolveShutdown);
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    process.once("disconnect", shutdown);
  });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) void main();
