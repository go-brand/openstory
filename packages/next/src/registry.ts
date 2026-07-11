import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { assertRealPathWithin } from "./cache.js";

export type GenerateRegistriesOptions = {
  projectRoot: string;
  cacheRoot: string;
  configPath?: string | null;
  storyFiles: string[];
  workspaceRoots?: string[];
};

export type GeneratedRegistries = {
  clientPath: string;
  serverPath: string;
  changed: boolean;
};

export function toModuleSpecifier(path: string): string {
  return path.replaceAll("\\", "/");
}

async function writeFileIfChanged(path: string, content: string): Promise<boolean> {
  try {
    if ((await readFile(path, "utf8")) === content) return false;
  } catch {
    // Missing or unreadable output is replaced atomically below.
  }

  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
  return true;
}

function importSpecifier(importingDirectory: string, targetPath: string): string {
  const path = toModuleSpecifier(relative(importingDirectory, targetPath));
  return path.startsWith(".") ? path : `./${path}`;
}

function storyImports(storyPaths: string[], importingDirectory: string): string {
  return storyPaths
    .map(
      (path, index) =>
        `import * as story${index} from ${JSON.stringify(importSpecifier(importingDirectory, path))};`,
    )
    .join("\n");
}

function discoveredExpression(storyPaths: string[]): string {
  if (storyPaths.length === 0) return "[]";
  const entries = storyPaths.map((path, index) => {
    const module = `story${index}.default`;
    return `...(isRegisteredComponent(${module}) ? [{ ...${module}, sourcePath: ${module}.sourcePath ?? ${JSON.stringify(toModuleSpecifier(path))} }] : [])`;
  });
  return `[\n  ${entries.join(",\n  ")},\n]`;
}

async function assertClientCompatibleStory(path: string): Promise<void> {
  const source = await readFile(path, "utf8");
  const boundary = /^\s*["']use server["']\s*;?/m.test(source)
    ? 'a "use server" directive'
    : /(?:import\s+(?:[^"']+\s+from\s+)?|require\()\s*["']server-only["']/.test(source)
      ? "the server-only marker"
      : /(?:import\s+(?:[^"']+\s+from\s+)?|require\()\s*["']node:/.test(source)
        ? "a Node-only module"
        : null;
  if (boundary) {
    throw new Error(
      `[openstory] ${path} imports ${boundary}. OpenStory's Next v1 adapter supports client-compatible stories only.`,
    );
  }
}

function buildClientRegistry(
  configPath: string | null,
  storyPaths: string[],
  importingDirectory: string,
): string {
  const configImport = configPath
    ? `import userConfigValue from ${JSON.stringify(importSpecifier(importingDirectory, configPath))};\nconst userConfig: OpenStoryConfig = userConfigValue;`
    : "const userConfig: OpenStoryConfig = {};";
  return `"use client";

import { isRegisteredComponent, mergeComponents } from "@gobrand/openstory-config";
import type { OpenStoryConfig } from "@gobrand/openstory-config";
import { OpenStoryPreview } from "@gobrand/openstory-runtime";
import { useEffect, useState } from "react";
${configImport}
${storyImports(storyPaths, importingDirectory)}

const discovered = ${discoveredExpression(storyPaths)};
const config = {
  ...userConfig,
  components: mergeComponents(discovered, userConfig.components ?? []),
};

export default function OpenStoryHarness() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return <OpenStoryPreview config={config} />;
}
`;
}

function buildServerRegistry(
  configPath: string | null,
  storyPaths: string[],
  importingDirectory: string,
): string {
  const configImport = configPath
    ? `import userConfigValue from ${JSON.stringify(importSpecifier(importingDirectory, configPath))};\nconst userConfig: OpenStoryConfig = userConfigValue;`
    : "const userConfig: OpenStoryConfig = {};";
  return `import { isRegisteredComponent } from "@gobrand/openstory-config";
import type { OpenStoryConfig } from "@gobrand/openstory-config";
${configImport}
${storyImports(storyPaths, importingDirectory)}

const components = ${discoveredExpression(storyPaths)};

export const loadedProject = { config: userConfig, components };
`;
}

export async function generateRegistries(
  options: GenerateRegistriesOptions,
): Promise<GeneratedRegistries> {
  const allowedRoots = [options.projectRoot, ...(options.workspaceRoots ?? [])];
  const configPath = options.configPath
    ? await assertRealPathWithin(options.configPath, allowedRoots)
    : null;
  const canonicalStories = await Promise.all(
    options.storyFiles.map((path) => assertRealPathWithin(path, allowedRoots)),
  );
  const storyPaths = [...new Set(canonicalStories)].sort((left, right) => {
    const normalizedLeft = toModuleSpecifier(left);
    const normalizedRight = toModuleSpecifier(right);
    return normalizedLeft < normalizedRight ? -1 : normalizedLeft > normalizedRight ? 1 : 0;
  });
  await Promise.all(storyPaths.map(assertClientCompatibleStory));
  const clientPath = join(options.cacheRoot, "generated", "registry.client.tsx");
  const serverPath = join(options.cacheRoot, "generated", "registry.server.ts");
  const importingDirectory = dirname(clientPath);
  const [clientChanged, serverChanged] = await Promise.all([
    writeFileIfChanged(clientPath, buildClientRegistry(configPath, storyPaths, importingDirectory)),
    writeFileIfChanged(serverPath, buildServerRegistry(configPath, storyPaths, importingDirectory)),
  ]);

  return { clientPath, serverPath, changed: clientChanged || serverChanged };
}
