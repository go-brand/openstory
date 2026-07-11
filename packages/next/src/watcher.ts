import { relative, sep } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { globToRegExp } from "@gobrand/openstory-node";

type RelevantEvent = "add" | "change" | "unlink";

function normalize(path: string): string {
  return path.split(sep).join("/").replaceAll("\\", "/");
}

export function isRelevantManifestEvent(options: {
  event: RelevantEvent;
  path: string;
  patterns: string[];
  configPath: string | null;
}): boolean {
  const path = normalize(options.path);
  if (options.configPath && path === normalize(options.configPath)) return true;
  if (!options.patterns.some((pattern) => globToRegExp(pattern).test(path))) return false;
  if (path.endsWith(".md")) return true;
  return options.event === "add" || options.event === "unlink";
}

export type ManifestWatcher = {
  close(): Promise<void>;
};

export function watchManifestMembership(options: {
  projectRoot: string;
  getPatterns: () => string[];
  getConfigPath: () => string | null;
  onRegenerate: () => Promise<void>;
  debounceMs?: number;
}): ManifestWatcher {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> = Promise.resolve();
  let closed = false;
  const watcher: FSWatcher = chokidar.watch(options.projectRoot, {
    ignoreInitial: true,
    ignored: (path, stats) =>
      Boolean(
        stats?.isDirectory() &&
        ["node_modules", ".git", "dist", "build", "out"].includes(path.split(sep).at(-1) ?? ""),
      ),
  });

  const schedule = () => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      running = running.then(options.onRegenerate, options.onRegenerate);
    }, options.debounceMs ?? 40);
  };

  watcher.on("all", (event, path) => {
    if (event !== "add" && event !== "change" && event !== "unlink") return;
    const relativePath = normalize(relative(options.projectRoot, path));
    const configPath = options.getConfigPath();
    if (
      isRelevantManifestEvent({
        event,
        path: relativePath,
        patterns: options.getPatterns(),
        configPath: configPath ? normalize(relative(options.projectRoot, configPath)) : null,
      })
    ) {
      schedule();
    }
  });

  return {
    async close() {
      closed = true;
      if (timer) clearTimeout(timer);
      await watcher.close();
      await running;
    },
  };
}
