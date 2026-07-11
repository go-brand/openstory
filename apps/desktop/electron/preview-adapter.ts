import { readFile, realpath, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, parse } from "node:path";

export type PreviewAdapter = "vite" | "next";

export type PreviewAdapterDetection =
  | { ok: true; adapter: "vite" }
  | { ok: true; adapter: "next"; executable: string }
  | { ok: false; error: string };

type PackageManifest = {
  name?: string;
  version?: string;
  bin?: string | Record<string, string>;
};

type InstalledPackage = {
  root: string;
  manifest: PackageManifest;
};

async function readManifest(path: string): Promise<PackageManifest | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as PackageManifest;
  } catch {
    return null;
  }
}

async function findPackageRoot(entryPath: string, packageName: string): Promise<string | null> {
  let directory = dirname(entryPath);
  const filesystemRoot = parse(directory).root;
  while (directory !== filesystemRoot) {
    const manifest = await readManifest(join(directory, "package.json"));
    if (manifest?.name === packageName) return directory;
    directory = dirname(directory);
  }
  return null;
}

async function resolvePackage(
  projectRoot: string,
  packageName: string,
): Promise<InstalledPackage | null> {
  const require = createRequire(join(projectRoot, "package.json"));
  let packageRoot: string | null = null;
  try {
    packageRoot = dirname(require.resolve(`${packageName}/package.json`));
  } catch {
    try {
      packageRoot = await findPackageRoot(require.resolve(packageName), packageName);
    } catch {
      return null;
    }
  }
  if (!packageRoot) return null;
  const manifest = await readManifest(join(packageRoot, "package.json"));
  return manifest ? { root: packageRoot, manifest } : null;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

function adapterExecutable(adapterPackage: InstalledPackage): string | null {
  const bin = adapterPackage.manifest.bin;
  const relativePath = typeof bin === "string" ? bin : bin?.["openstory-next"];
  return relativePath ? join(adapterPackage.root, relativePath) : null;
}

export async function detectPreviewAdapter(root: string): Promise<PreviewAdapterDetection> {
  const projectRoot = await realpath(root);
  const [nextPackage, nextAdapter, vitePackage, viteAdapter] = await Promise.all([
    resolvePackage(projectRoot, "next"),
    resolvePackage(projectRoot, "@gobrand/openstory-next"),
    resolvePackage(projectRoot, "vite"),
    resolvePackage(projectRoot, "@gobrand/openstory-vite"),
  ]);
  const hasAppRouter =
    (await isDirectory(join(projectRoot, "app"))) ||
    (await isDirectory(join(projectRoot, "src", "app")));
  const viteConfig = (
    await Promise.all(
      ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"].map(async (name) =>
        (await isFile(join(projectRoot, name))) ? name : null,
      ),
    )
  ).find((name): name is string => name !== null);

  let nextError: string | null = null;
  let nextExecutable: string | null = null;
  if (hasAppRouter && nextPackage) {
    const version = nextPackage.manifest.version ?? "unknown";
    if (Number.parseInt(version.split(".")[0] ?? "", 10) !== 16) {
      nextError = `Next.js ${version} is unsupported. OpenStory currently supports Next.js >=16 <17.`;
    } else if (!nextAdapter) {
      nextError =
        "This is a Next App Router project, but @gobrand/openstory-next is not installed.";
    } else {
      nextExecutable = adapterExecutable(nextAdapter);
      if (!nextExecutable || !(await isFile(nextExecutable))) {
        nextError =
          "The installed @gobrand/openstory-next package has no openstory-next executable.";
        nextExecutable = null;
      }
    }
  } else if (nextAdapter || (hasAppRouter && !nextPackage)) {
    nextError = !nextPackage
      ? "An App Router directory or Next adapter was found, but Next.js is not installed."
      : "@gobrand/openstory-next is installed, but no app/ or src/app/ directory was found.";
  }

  const validVite = Boolean(viteConfig && vitePackage && viteAdapter);
  const validNext = nextExecutable !== null;
  if (validNext && validVite) {
    return {
      ok: false,
      error:
        "This project has both Next and Vite OpenStory adapters configured. Remove the adapter that does not own the application runtime.",
    };
  }
  if (validNext && nextExecutable) {
    return { ok: true, adapter: "next", executable: nextExecutable };
  }
  if (nextError) return { ok: false, error: nextError };
  if (validVite) return { ok: true, adapter: "vite" };
  if (viteConfig || viteAdapter) {
    return {
      ok: false,
      error:
        "A Vite setup was found, but it needs Vite, @gobrand/openstory-vite, and a vite.config file.",
    };
  }
  return {
    ok: false,
    error:
      "No supported OpenStory preview adapter was found. Install @gobrand/openstory-next for a Next App Router project or @gobrand/openstory-vite for Vite.",
  };
}
