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
