export type NextConfigValue = Record<string, unknown>;

export type ShadowNextConfigOptions = {
  workspaceRoot: string;
  distDir: string;
};

type ConsumerNextConfig =
  | NextConfigValue
  | Promise<NextConfigValue>
  | ((phase: string, context: unknown) => NextConfigValue | Promise<NextConfigValue>)
  | null
  | undefined;

export async function resolveShadowNextConfig(
  consumerExport: ConsumerNextConfig,
  phase: string,
  context: unknown,
  options: ShadowNextConfigOptions,
): Promise<NextConfigValue> {
  const value =
    typeof consumerExport === "function"
      ? await consumerExport(phase, context)
      : await (consumerExport ?? {});
  const consumerTurbopack =
    typeof value.turbopack === "object" && value.turbopack !== null
      ? (value.turbopack as Record<string, unknown>)
      : {};

  return {
    ...value,
    distDir: options.distDir,
    turbopack: {
      ...consumerTurbopack,
      root: options.workspaceRoot,
    },
  };
}

function moduleSpecifier(path: string): string {
  return path.replaceAll("\\", "/");
}

export function buildNextConfigSource(options: {
  consumerConfigPath: string | null;
  workspaceRoot: string;
  distDir: string;
}): string {
  const consumer = options.consumerConfigPath
    ? `import consumerConfig from ${JSON.stringify(moduleSpecifier(options.consumerConfigPath))};`
    : "const consumerConfig = {};";

  return `${consumer}
import { resolveShadowNextConfig } from "@gobrand/openstory-next/next-config";

export default function openStoryNextConfig(phase, context) {
  return resolveShadowNextConfig(consumerConfig, phase, context, ${JSON.stringify({
    workspaceRoot: moduleSpecifier(options.workspaceRoot),
    distDir: options.distDir,
  })});
}
`;
}
