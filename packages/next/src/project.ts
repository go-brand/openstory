import { readFile, realpath, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, parse } from "node:path";

export type ResolvedPackage = {
  path: string;
  version: string;
};

export type PackageResolver = (
  packageName: "next" | "@gobrand/openstory-next",
  projectRoot: string,
) => Promise<ResolvedPackage | null>;

export type NextProjectInspection = {
  projectRoot: string;
  appDir: string;
  nextVersion: string;
  nextPackageJson: string;
  adapterPackageJson: string;
};

export type NextProjectErrorCode =
  | "MISSING_NEXT"
  | "UNSUPPORTED_NEXT_VERSION"
  | "MISSING_APP_ROUTER"
  | "MISSING_ADAPTER";

export class NextProjectError extends Error {
  constructor(
    public readonly code: NextProjectErrorCode,
    message: string,
    public readonly remediation: string,
  ) {
    super(message);
    this.name = "NextProjectError";
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function findPackageJson(entryPath: string, packageName: string): Promise<string | null> {
  let directory = dirname(entryPath);
  const filesystemRoot = parse(directory).root;
  while (directory !== filesystemRoot) {
    const candidate = join(directory, "package.json");
    try {
      const manifest = JSON.parse(await readFile(candidate, "utf8")) as { name?: unknown };
      if (manifest.name === packageName) return candidate;
    } catch {
      // Keep walking toward the filesystem root.
    }
    directory = dirname(directory);
  }
  return null;
}

const defaultPackageResolver: PackageResolver = async (packageName, projectRoot) => {
  const require = createRequire(join(projectRoot, "package.json"));
  let packageJsonPath: string | null = null;
  try {
    packageJsonPath = require.resolve(`${packageName}/package.json`);
  } catch {
    try {
      packageJsonPath = await findPackageJson(require.resolve(packageName), packageName);
    } catch {
      return null;
    }
  }
  if (!packageJsonPath) return null;

  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as { version?: unknown };
  return typeof packageJson.version === "string"
    ? { path: packageJsonPath, version: packageJson.version }
    : null;
};

export async function inspectNextProject(
  root: string,
  options: { resolvePackage?: PackageResolver } = {},
): Promise<NextProjectInspection> {
  const projectRoot = await realpath(root);
  const resolvePackage = options.resolvePackage ?? defaultPackageResolver;
  const nextPackage = await resolvePackage("next", projectRoot);
  if (!nextPackage) {
    throw new NextProjectError(
      "MISSING_NEXT",
      "[openstory] This project does not have Next.js installed.",
      "Install Next.js 16 in the selected project.",
    );
  }

  const major = Number.parseInt(nextPackage.version.split(".")[0] ?? "", 10);
  if (major !== 16) {
    throw new NextProjectError(
      "UNSUPPORTED_NEXT_VERSION",
      `[openstory] Next.js ${nextPackage.version} is unsupported; this adapter requires Next.js >=16 <17.`,
      "Upgrade the project to Next.js 16, or use the Vite adapter for a Vite project.",
    );
  }

  const appCandidates = [join(projectRoot, "app"), join(projectRoot, "src", "app")];
  const appDir = (
    await Promise.all(appCandidates.map(async (path) => ((await isDirectory(path)) ? path : null)))
  ).find((path): path is string => path !== null);
  if (!appDir) {
    throw new NextProjectError(
      "MISSING_APP_ROUTER",
      "[openstory] No app/ or src/app/ directory was found.",
      "OpenStory's Next adapter currently supports the App Router only.",
    );
  }

  const adapterPackage = await resolvePackage("@gobrand/openstory-next", projectRoot);
  if (!adapterPackage) {
    throw new NextProjectError(
      "MISSING_ADAPTER",
      "[openstory] @gobrand/openstory-next is not installed in this project.",
      "Install it with your package manager, for example: pnpm add -D @gobrand/openstory-next.",
    );
  }

  return {
    projectRoot,
    appDir,
    nextVersion: nextPackage.version,
    nextPackageJson: nextPackage.path,
    adapterPackageJson: adapterPackage.path,
  };
}
