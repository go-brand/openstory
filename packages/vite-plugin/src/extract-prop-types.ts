import ts from "typescript";
import { statSync } from "node:fs";
import { dirname } from "node:path";

/** Type-derived control kind for a single prop. `name` is added by the caller. */
export type PropTypeInfo =
  | { kind: "select" | "radio"; options: string[] }
  | { kind: "boolean" }
  | { kind: "number" }
  | { kind: "text" };

// Storybook's threshold: <= 5 options render as radio, more as select.
const RADIO_MAX = 5;

// One ts.Program per project root, reused across components and across
// buildManifest calls. Rebuilt when the requested source file's mtime is newer
// than the cached program — catches edits to a component's own props type.
// (Edits to a separately-imported type file need a manual reload; documented.)
type Cached = { program: ts.Program; builtAt: number };
const cache = new Map<string, Cached>();

function loadProgram(projectRoot: string): ts.Program | null {
  const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) return null;
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) return null;
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(configPath));
  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
}

function getProgram(projectRoot: string, sourcePath: string): ts.Program | null {
  const hit = cache.get(projectRoot);
  let mtime = 0;
  try {
    mtime = statSync(sourcePath).mtimeMs;
  } catch {
    // File missing — fall through; getSourceFile will return undefined.
  }
  if (hit && mtime <= hit.builtAt) return hit.program;
  const program = loadProgram(projectRoot);
  if (!program) return null;
  cache.set(projectRoot, { program, builtAt: Date.now() });
  return program;
}

function pickComponentSymbol(
  checker: ts.TypeChecker,
  exports: ts.Symbol[],
  exportName: string,
): ts.Symbol | undefined {
  const byName = exports.find((e) => e.getName() === exportName);
  if (byName) return byName;
  const def = exports.find((e) => e.getName() === "default");
  if (def) return def;
  // Fallback: the first export that is callable (a component) — covers a
  // displayName/export-name mismatch.
  return exports.find((e) => {
    const resolved = e.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(e) : e;
    const decl = resolved.valueDeclaration ?? resolved.declarations?.[0];
    if (!decl) return false;
    return checker.getTypeOfSymbolAtLocation(resolved, decl).getCallSignatures().length > 0;
  });
}

function getPropsType(
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  exportName: string,
): ts.Type | undefined {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) return undefined;
  const sym = pickComponentSymbol(checker, checker.getExportsOfModule(moduleSymbol), exportName);
  if (!sym) return undefined;
  const resolved = sym.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(sym) : sym;
  const decl = resolved.valueDeclaration ?? resolved.declarations?.[0];
  if (!decl) return undefined;
  // First call signature's first parameter is the props object. Works for
  // function components, `FC<P>`, and a `forwardRef` exotic (all callable).
  const sig = checker.getTypeOfSymbolAtLocation(resolved, decl).getCallSignatures()[0];
  const param = sig?.getParameters()[0];
  if (!param) return undefined;
  const pdecl = param.valueDeclaration ?? param.declarations?.[0];
  if (!pdecl) return undefined;
  return checker.getTypeOfSymbolAtLocation(param, pdecl);
}

function classify(t: ts.Type): PropTypeInfo | null {
  if (t.isUnion()) {
    const parts = t.types.filter((m) => !(m.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)));
    // `boolean` is internally `true | false` — detect before the literal check.
    if (parts.length > 0 && parts.every((m) => m.flags & ts.TypeFlags.BooleanLiteral)) {
      return { kind: "boolean" };
    }
    if (parts.length > 0 && parts.every((m) => m.isStringLiteral())) {
      const options = parts.map((m) => (m as ts.StringLiteralType).value);
      return { kind: options.length <= RADIO_MAX ? "radio" : "select", options };
    }
    return null; // mixed/non-literal union -> value fallback
  }
  if (t.flags & ts.TypeFlags.BooleanLike) return { kind: "boolean" };
  if (t.flags & ts.TypeFlags.NumberLike) return { kind: "number" };
  if (t.flags & ts.TypeFlags.StringLike) return { kind: "text" };
  return null;
}

/**
 * Extract type-derived control info per prop from a component's source file.
 * Never throws — any failure yields `{}` so callers fall back to value
 * inference. `exportName` is the component's declared/display name; the
 * extractor also tries the default and first-callable export.
 */
export function extractPropTypes(
  sourcePath: string,
  exportName: string,
  projectRoot: string,
): Record<string, PropTypeInfo> {
  try {
    const program = getProgram(projectRoot, sourcePath);
    if (!program) return {};
    const sourceFile = program.getSourceFile(sourcePath);
    if (!sourceFile) return {};
    const checker = program.getTypeChecker();
    const propsType = getPropsType(checker, sourceFile, exportName);
    if (!propsType) return {};

    const out: Record<string, PropTypeInfo> = {};
    for (const prop of checker.getPropertiesOfType(propsType)) {
      const decl = prop.valueDeclaration ?? prop.declarations?.[0];
      if (!decl) continue;
      const propType = checker.getTypeOfSymbolAtLocation(prop, decl);
      const info = classify(propType);
      if (info) out[prop.getName()] = info;
    }
    return out;
  } catch {
    return {};
  }
}
