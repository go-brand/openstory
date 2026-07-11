import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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

function storyImports(storyPaths: string[]): string {
  return storyPaths
    .map(
      (path, index) => `import * as story${index} from ${JSON.stringify(toModuleSpecifier(path))};`,
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

function buildClientRegistry(configPath: string | null, storyPaths: string[]): string {
  const configImport = configPath
    ? `import userConfigValue from ${JSON.stringify(toModuleSpecifier(configPath))};\nconst userConfig: OpenStoryConfig = userConfigValue;`
    : "const userConfig: OpenStoryConfig = {};";
  return `"use client";

import { isRegisteredComponent, mergeComponents } from "@gobrand/openstory-config";
import type { OpenStoryConfig } from "@gobrand/openstory-config";
import { OpenStoryPreview } from "@gobrand/openstory-runtime";
${configImport}
${storyImports(storyPaths)}

const discovered = ${discoveredExpression(storyPaths)};
const config = {
  ...userConfig,
  components: mergeComponents(discovered, userConfig.components ?? []),
};

export default function OpenStoryHarness() {
  return <OpenStoryPreview config={config} />;
}
`;
}

function buildServerRegistry(configPath: string | null, storyPaths: string[]): string {
  const configImport = configPath
    ? `import userConfigValue from ${JSON.stringify(toModuleSpecifier(configPath))};\nconst userConfig: OpenStoryConfig = userConfigValue;`
    : "const userConfig: OpenStoryConfig = {};";
  return `import { isRegisteredComponent } from "@gobrand/openstory-config";
import type { OpenStoryConfig } from "@gobrand/openstory-config";
${configImport}
${storyImports(storyPaths)}

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
  const clientPath = join(options.cacheRoot, "generated", "registry.client.tsx");
  const serverPath = join(options.cacheRoot, "generated", "registry.server.ts");
  const [clientChanged, serverChanged] = await Promise.all([
    writeFileIfChanged(clientPath, buildClientRegistry(configPath, storyPaths)),
    writeFileIfChanged(serverPath, buildServerRegistry(configPath, storyPaths)),
  ]);

  return { clientPath, serverPath, changed: clientChanged || serverChanged };
}
