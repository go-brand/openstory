export { assertRealPathWithin, resolveNextCacheRoot } from "./cache.js";
export {
  inspectNextProject,
  NextProjectError,
  type NextProjectErrorCode,
  type NextProjectInspection,
  type PackageResolver,
  type ResolvedPackage,
} from "./project.js";
export {
  generateRegistries,
  toModuleSpecifier,
  type GeneratedRegistries,
  type GenerateRegistriesOptions,
} from "./registry.js";
export {
  buildNextConfigSource,
  resolveShadowNextConfig,
  type NextConfigValue,
  type ShadowNextConfigOptions,
} from "./next-config.js";
export {
  detectStylePaths,
  generateShadowApp,
  type GeneratedNextApp,
  type GenerateShadowAppOptions,
} from "./shadow-app.js";
export {
  startNextPreview,
  type McpRequestHandler,
  type NextFactory,
  type NextPreviewServer,
  type NextServerLike,
} from "./server.js";
export {
  createProtocolReporter,
  type NextProtocolEvent,
  type ProtocolReporter,
} from "./protocol.js";
export { createNextMcpHandler } from "./mcp.js";
export {
  isRelevantManifestEvent,
  watchManifestMembership,
  type ManifestWatcher,
} from "./watcher.js";
