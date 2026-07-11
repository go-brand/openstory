import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { buildNextConfigSource } from "./next-config.js";
import { generateRegistries, type GeneratedRegistries } from "./registry.js";

const STYLE_CANDIDATES = [
  "src/styles.css",
  "src/index.css",
  "src/app.css",
  "src/main.css",
  "src/global.css",
  "src/globals.css",
  "src/styles/globals.css",
  "src/styles/index.css",
  "src/styles/app.css",
  "src/styles/main.css",
  "app/globals.css",
  "app/styles.css",
  "styles/globals.css",
  "styles.css",
  "index.css",
  "app.css",
  "global.css",
  "globals.css",
];

const NEXT_CONFIG_CANDIDATES = [
  "next.config.ts",
  "next.config.mts",
  "next.config.mjs",
  "next.config.js",
  "next.config.cjs",
];
const POSTCSS_CONFIG_CANDIDATES = ["postcss.config.mjs", "postcss.config.js", "postcss.config.cjs"];
const TSCONFIG_CANDIDATES = ["tsconfig.json", "jsconfig.json"];

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function findFirst(root: string, candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    const path = join(root, candidate);
    if (await exists(path)) return path;
  }
  return null;
}

function hasTailwind(source: string): boolean {
  return (
    /@import\s+['"][^'"]*tailwind[^'"]*['"]/.test(source) ||
    /@tailwind\b/.test(source) ||
    /@(?:theme|source|plugin)\b/.test(source)
  );
}

export async function detectStylePaths(projectRoot: string): Promise<string[]> {
  for (const candidate of STYLE_CANDIDATES) {
    const path = join(projectRoot, candidate);
    try {
      if (hasTailwind(await readFile(path, "utf8"))) return [path];
    } catch {
      // Continue through conventional candidates.
    }
  }
  return [];
}

async function writeGenerated(path: string, content: string): Promise<boolean> {
  try {
    if ((await readFile(path, "utf8")) === content) return false;
  } catch {
    // Create or replace below.
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

export type GenerateShadowAppOptions = {
  projectRoot: string;
  cacheRoot: string;
  workspaceRoot?: string;
  configPath?: string | null;
  storyFiles: string[];
  stylePaths?: string[];
  consumerNextConfigPath?: string | null;
  consumerPostcssConfigPath?: string | null;
  consumerTsconfigPath?: string | null;
  workspaceRoots?: string[];
};

export type GeneratedNextApp = {
  appDir: string;
  cacheRoot: string;
  registries: GeneratedRegistries;
  changed: boolean;
};

export async function generateShadowApp(
  options: GenerateShadowAppOptions,
): Promise<GeneratedNextApp> {
  const workspaceRoot = options.workspaceRoot ?? options.projectRoot;
  const stylePaths = options.stylePaths ?? (await detectStylePaths(options.projectRoot));
  const consumerNextConfigPath =
    options.consumerNextConfigPath === undefined
      ? await findFirst(options.projectRoot, NEXT_CONFIG_CANDIDATES)
      : options.consumerNextConfigPath;
  const consumerPostcssConfigPath =
    options.consumerPostcssConfigPath === undefined
      ? await findFirst(options.projectRoot, POSTCSS_CONFIG_CANDIDATES)
      : options.consumerPostcssConfigPath;
  const consumerTsconfigPath =
    options.consumerTsconfigPath === undefined
      ? await findFirst(options.projectRoot, TSCONFIG_CANDIDATES)
      : options.consumerTsconfigPath;
  const registries = await generateRegistries(options);

  const layoutImports = [
    ...stylePaths.map((path) => `import ${JSON.stringify(path.replaceAll("\\", "/"))};`),
    'import "./openstory.css";',
  ].join("\n");
  const files = new Map<string, string>([
    [
      join(options.cacheRoot, "app", "layout.tsx"),
      `${layoutImports}
import type { ReactNode } from "react";

export const metadata = { title: "OpenStory" };

export default function OpenStoryLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
`,
    ],
    [
      join(options.cacheRoot, "app", "openstory.css"),
      `:root { --os-canvas: #ffffff; }
.dark { --os-canvas: #1b1c1d; }
html, body { margin: 0; padding: 0; background: var(--os-canvas) !important; }
body { font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; }
`,
    ],
    [
      join(options.cacheRoot, "app", "__pl__", "page.tsx"),
      `import OpenStoryHarness from "../../generated/registry.client";

export default function OpenStoryPage() {
  return <OpenStoryHarness />;
}
`,
    ],
    [
      join(options.cacheRoot, "app", "__pl__", "manifest.json", "route.ts"),
      `import { readFileSync } from "node:fs";
import { assembleLoadedManifest } from "@gobrand/openstory-node";
import { loadedProject } from "../../../generated/registry.server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const manifest = assembleLoadedManifest({
      projectRoot: ${JSON.stringify(options.projectRoot)},
      loaded: loadedProject,
      readFile: (path: string) => readFileSync(path, "utf8"),
    });
    return Response.json(manifest);
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
`,
    ],
    [
      join(options.cacheRoot, "next.config.mjs"),
      buildNextConfigSource({
        consumerConfigPath: consumerNextConfigPath,
        workspaceRoot,
        distDir: ".next-openstory",
      }),
    ],
    [
      join(options.cacheRoot, "postcss.config.mjs"),
      consumerPostcssConfigPath
        ? `export { default } from ${JSON.stringify(consumerPostcssConfigPath.replaceAll("\\", "/"))};\n`
        : "export default { plugins: {} };\n",
    ],
    [
      join(options.cacheRoot, "tsconfig.json"),
      `${JSON.stringify(
        {
          ...(consumerTsconfigPath ? { extends: consumerTsconfigPath } : {}),
          compilerOptions: {
            jsx: "preserve",
            noEmit: true,
            allowJs: true,
            skipLibCheck: true,
            plugins: [{ name: "next" }],
          },
          include: ["app/**/*.ts", "app/**/*.tsx", "generated/**/*.ts", "generated/**/*.tsx"],
        },
        null,
        2,
      )}\n`,
    ],
  ]);

  const changes = await Promise.all(
    [...files].map(([path, content]) => writeGenerated(path, content)),
  );
  return {
    appDir: join(options.cacheRoot, "app"),
    cacheRoot: options.cacheRoot,
    registries,
    changed: registries.changed || changes.some(Boolean),
  };
}
