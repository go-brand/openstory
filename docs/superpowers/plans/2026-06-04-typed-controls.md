# Typed Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a string-literal-union prop (e.g. `variant: "primary" | "secondary" | "ghost"`) as a select/radio control listing exactly the allowed values, by reading the component's TypeScript types.

**Architecture:** A vendored TypeScript-compiler extractor in the vite-plugin reads each component's props type at build time and emits per-prop control kinds. Results merge over the existing value-inferred controls (types win, values fall back). `ManifestControl` gains `select`/`radio` kinds + `options`, and the right-panel renders them. No new dependency (`typescript` is already a vite-plugin dep), no bridge changes.

**Tech Stack:** TypeScript compiler API (`ts.Program` / `ts.TypeChecker`), Vitest, React (manager UI).

**Spec:** `docs/superpowers/specs/2026-06-04-typed-controls-design.md`

---

## File Structure

- Create: `packages/vite-plugin/src/extract-prop-types.ts` — the TS-compiler extractor. One job: source file + export name → `Record<prop, PropTypeInfo>`.
- Create: `packages/vite-plugin/src/extract-prop-types.test.ts` — unit tests against fixture components.
- Create: `packages/vite-plugin/src/__fixtures__/types/tsconfig.json` — minimal tsconfig so the extractor's `ts.Program` resolves the fixtures.
- Create: `packages/vite-plugin/src/__fixtures__/types/variants.ts` — shared union type aliases (alias + imported-union coverage).
- Create: `packages/vite-plugin/src/__fixtures__/types/button.tsx` — sample component exercising union/boolean/number/string/optional props.
- Modify: `packages/config/src/define.ts` — widen `ManifestControl`; add `mergeControls`.
- Modify: `packages/config/src/index.ts` — export `mergeControls`.
- Modify: `packages/config/src/define.test.ts` — tests for `mergeControls`.
- Modify: `apps/desktop/electron/types.ts` — widen the duplicate `ManifestControl`.
- Modify: `packages/vite-plugin/src/plugin.ts` — call the extractor in `buildManifest`, pass type controls to `mergeControls`.
- Modify: `apps/desktop/src/components/right-panel.tsx` — add `select`/`radio` branches to `InspectPanel`.

---

## Task 1: Widen `ManifestControl` (both definitions)

**Files:**
- Modify: `packages/config/src/define.ts` (the `ManifestControl` type ~line 21)
- Modify: `apps/desktop/electron/types.ts` (the `ManifestControl` type ~line 28)

- [ ] **Step 1: Widen the config definition**

In `packages/config/src/define.ts`, replace:

```ts
export type ManifestControl = {
  name: string;
  kind: "text" | "boolean" | "number";
};
```

with:

```ts
export type ManifestControl = {
  name: string;
  kind: "text" | "boolean" | "number" | "select" | "radio";
  /** Allowed values; present only for `select` / `radio`. */
  options?: string[];
};
```

- [ ] **Step 2: Widen the electron duplicate identically**

In `apps/desktop/electron/types.ts`, replace:

```ts
export type ManifestControl = {
  name: string;
  kind: "text" | "boolean" | "number";
};
```

with:

```ts
export type ManifestControl = {
  name: string;
  kind: "text" | "boolean" | "number" | "select" | "radio";
  /** Allowed values; present only for `select` / `radio`. */
  options?: string[];
};
```

- [ ] **Step 3: Typecheck both packages**

Run: `pnpm --filter @gobrand/openstory-config --filter openstory-desktop typecheck`
Expected: PASS (widening a union is backward-compatible; `deriveControls` still returns a subset).

- [ ] **Step 4: Commit**

```bash
git add packages/config/src/define.ts apps/desktop/electron/types.ts
git commit -m "feat(controls): widen ManifestControl with select/radio + options"
```

---

## Task 2: `mergeControls` (types win, values fall back)

**Files:**
- Modify: `packages/config/src/define.ts` (add `mergeControls` beside `deriveControls`)
- Modify: `packages/config/src/index.ts` (export it)
- Test: `packages/config/src/define.test.ts`

`mergeControls` takes the fixtures (for value fallback + prop ordering) and a
record of type-derived controls keyed by prop name. The vite-plugin builds that
record from the extractor (Task 4). Keeping the input as `ManifestControl`
(config's own vocabulary) means config has **no** dependency on the vite-plugin.

- [ ] **Step 1: Write the failing test**

Add to `packages/config/src/define.test.ts`:

```ts
import { mergeControls } from "./define.js";
import type { Fixture, ManifestControl } from "./define.js";

describe("mergeControls", () => {
  const fixtures: Fixture[] = [
    { id: "a", label: "A", props: { variant: "primary", label: "Hi", count: 1 } },
    { id: "b", label: "B", props: { variant: "secondary", label: "Yo", count: 2 } },
  ];

  it("prefers type-derived controls over value-inferred", () => {
    const types: Record<string, ManifestControl> = {
      variant: { name: "variant", kind: "radio", options: ["primary", "secondary"] },
    };
    const out = mergeControls(fixtures, types);
    expect(out).toContainEqual({
      name: "variant",
      kind: "radio",
      options: ["primary", "secondary"],
    });
    // label/count have no type info -> value fallback (text/number).
    expect(out).toContainEqual({ name: "label", kind: "text" });
    expect(out).toContainEqual({ name: "count", kind: "number" });
  });

  it("preserves first-seen prop order across fixtures", () => {
    const out = mergeControls(fixtures, {});
    expect(out.map((c) => c.name)).toEqual(["variant", "label", "count"]);
  });

  it("with no type info, equals deriveControls output", () => {
    const out = mergeControls(fixtures, {});
    expect(out).toEqual([
      { name: "variant", kind: "text" },
      { name: "label", kind: "text" },
      { name: "count", kind: "number" },
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gobrand/openstory-config test -- define.test`
Expected: FAIL with `mergeControls is not a function` (or import error).

- [ ] **Step 3: Implement `mergeControls`**

In `packages/config/src/define.ts`, after `deriveControls`, add:

```ts
/**
 * Merge type-derived controls over value-inferred ones. Types are
 * authoritative (they know an enum from free text); props with no type info
 * fall back to `deriveControls`. Prop order is first-seen across fixtures,
 * matching `deriveControls`. With an empty `typeControls`, output is identical
 * to `deriveControls(fixtures)` — preserving zero-config behavior.
 */
export function mergeControls(
  fixtures: Fixture[],
  typeControls: Record<string, ManifestControl> = {},
): ManifestControl[] {
  const valueDerived = new Map(deriveControls(fixtures).map((c) => [c.name, c]));

  const order: string[] = [];
  const seen = new Set<string>();
  for (const fixture of fixtures) {
    const props = (fixture.props ?? {}) as Record<string, unknown>;
    for (const name of Object.keys(props)) {
      if (!seen.has(name)) {
        seen.add(name);
        order.push(name);
      }
    }
  }

  const out: ManifestControl[] = [];
  for (const name of order) {
    const fromType = typeControls[name];
    if (fromType) {
      out.push(fromType);
      continue;
    }
    const fromValue = valueDerived.get(name);
    if (fromValue) out.push(fromValue);
  }
  return out;
}
```

- [ ] **Step 4: Export it**

In `packages/config/src/index.ts`, add `mergeControls,` to the `./define.js` export block (next to `deriveControls`):

```ts
  defineOpenStoryConfig,
  defineStories,
  deriveControls,
  mergeControls,
```

- [ ] **Step 5: Run tests to verify pass**

Run: `pnpm --filter @gobrand/openstory-config test`
Expected: PASS (all config tests, including the three new `mergeControls` cases).

- [ ] **Step 6: Commit**

```bash
git add packages/config/src/define.ts packages/config/src/index.ts packages/config/src/define.test.ts
git commit -m "feat(controls): add mergeControls (type-derived over value-inferred)"
```

---

## Task 3: `extractPropTypes` — the TS-compiler extractor

**Files:**
- Create: `packages/vite-plugin/src/extract-prop-types.ts`
- Create: `packages/vite-plugin/src/__fixtures__/types/tsconfig.json`
- Create: `packages/vite-plugin/src/__fixtures__/types/variants.ts`
- Create: `packages/vite-plugin/src/__fixtures__/types/button.tsx`
- Test: `packages/vite-plugin/src/extract-prop-types.test.ts`

- [ ] **Step 1: Create the fixture tsconfig**

Create `packages/vite-plugin/src/__fixtures__/types/tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "noEmit": true,
    "skipLibCheck": true
  },
  "include": ["**/*.ts", "**/*.tsx"]
}
```

- [ ] **Step 2: Create the shared union types (alias + cross-file import coverage)**

Create `packages/vite-plugin/src/__fixtures__/types/variants.ts`:

```ts
// Aliased + imported union — the case react-docgen (Babel) loses but the TS
// type checker resolves. >5 members so it must map to `select`, not `radio`.
export type Variant = "primary" | "secondary" | "ghost" | "danger" | "link" | "subtle";
```

- [ ] **Step 3: Create the sample component**

Create `packages/vite-plugin/src/__fixtures__/types/button.tsx`:

```tsx
import type { Variant } from "./variants";

// Plain function component (no React import needed — returns null). The
// extractor reads the first call-signature parameter as the props type.
export function Button(_props: {
  variant: Variant; // imported union, 6 members -> select
  size: "sm" | "md" | "lg"; // inline union, 3 members -> radio
  tone?: "a" | "b"; // optional union -> strip undefined -> radio
  disabled: boolean; // -> boolean
  count: number; // -> number
  label: string; // -> text
  onClick: () => void; // function -> omitted (value fallback)
}) {
  return null;
}
```

- [ ] **Step 4: Write the failing test**

Create `packages/vite-plugin/src/extract-prop-types.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractPropTypes } from "./extract-prop-types.js";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "__fixtures__/types");
const buttonPath = resolve(root, "button.tsx");

describe("extractPropTypes", () => {
  const info = extractPropTypes(buttonPath, "Button", root);

  it("maps an imported >5 string union to select with options", () => {
    expect(info.variant).toEqual({
      kind: "select",
      options: ["primary", "secondary", "ghost", "danger", "link", "subtle"],
    });
  });

  it("maps an inline <=5 string union to radio with options", () => {
    expect(info.size).toEqual({ kind: "radio", options: ["sm", "md", "lg"] });
  });

  it("strips undefined from an optional union", () => {
    expect(info.tone).toEqual({ kind: "radio", options: ["a", "b"] });
  });

  it("maps primitive props to boolean/number/text", () => {
    expect(info.disabled).toEqual({ kind: "boolean" });
    expect(info.count).toEqual({ kind: "number" });
    expect(info.label).toEqual({ kind: "text" });
  });

  it("omits non-primitive props (function) for value fallback", () => {
    expect(info.onClick).toBeUndefined();
  });

  it("returns {} when the source file is unknown", () => {
    expect(extractPropTypes(resolve(root, "nope.tsx"), "Nope", root)).toEqual({});
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `pnpm --filter @gobrand/openstory-vite-plugin test -- extract-prop-types`
Expected: FAIL with `Cannot find module './extract-prop-types.js'`.

- [ ] **Step 6: Implement the extractor**

Create `packages/vite-plugin/src/extract-prop-types.ts`:

```ts
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
    const parts = t.types.filter(
      (m) => !(m.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)),
    );
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
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @gobrand/openstory-vite-plugin test -- extract-prop-types`
Expected: PASS (all 6 cases).

- [ ] **Step 8: Typecheck the package**

Run: `pnpm --filter @gobrand/openstory-vite-plugin typecheck`
Expected: PASS. (If the fixture `button.tsx` trips project typecheck, ensure the plugin tsconfig excludes `**/__fixtures__/**`; add that to the `exclude` array if needed.)

- [ ] **Step 9: Commit**

```bash
git add packages/vite-plugin/src/extract-prop-types.ts packages/vite-plugin/src/extract-prop-types.test.ts packages/vite-plugin/src/__fixtures__
git commit -m "feat(controls): vendored TS-compiler prop-type extractor"
```

---

## Task 4: Wire the extractor into `buildManifest`

**Files:**
- Modify: `packages/vite-plugin/src/plugin.ts` (imports + `buildManifest`, ~lines 1-10 and 79-101)
- Test: `packages/vite-plugin/src/plugin.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/vite-plugin/src/plugin.test.ts` (adjust the import of `buildManifest` to match the file's existing imports):

```ts
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

it("buildManifest derives a select/radio control from prop types", () => {
  const root = resolve(
    fileURLToPath(new URL(".", import.meta.url)),
    "__fixtures__/types",
  );
  const config = {
    components: [
      {
        id: "button",
        name: "Button",
        component: (() => null) as any,
        sourcePath: "button.tsx",
        fixtures: [{ id: "p", label: "P", props: { variant: "primary", label: "Hi" } }],
      },
    ],
  };
  const manifest = buildManifest(config as any, root);
  const controls = manifest.components[0].controls;
  expect(controls).toContainEqual({
    name: "variant",
    kind: "select",
    options: ["primary", "secondary", "ghost", "danger", "link", "subtle"],
  });
  // `label` is a plain string prop -> text.
  expect(controls).toContainEqual({ name: "label", kind: "text" });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @gobrand/openstory-vite-plugin test -- plugin.test`
Expected: FAIL — `variant` comes back as `{ name: "variant", kind: "text" }` (value-inferred), not `select`.

- [ ] **Step 3: Import the extractor + types**

In `packages/vite-plugin/src/plugin.ts`, add to the imports:

```ts
import { extractPropTypes } from "./extract-prop-types.js";
```

And in the existing `@gobrand/openstory-config` import block, replace `deriveControls` with `mergeControls` and add the `ManifestControl` type:

```ts
  mergeControls,
  type ManifestControl,
```

(Remove the now-unused `deriveControls` import.)

- [ ] **Step 4: Use the extractor in `buildManifest`**

In `packages/vite-plugin/src/plugin.ts`, inside `buildManifest`, replace the component-mapping body so it extracts types and merges. The full updated `map` callback:

```ts
    components: (config.components ?? []).map((p) => {
      const render = resolveRender(p, presets);
      const sourcePath = p.sourcePath && projectRoot ? resolve(projectRoot, p.sourcePath) : null;

      // Type-derived controls (authoritative). Needs the resolved source path
      // and the project root for the ts.Program. Falls back to {} on any miss.
      const typeInfo =
        sourcePath && projectRoot
          ? extractPropTypes(sourcePath, p.name ?? p.id, projectRoot)
          : {};
      const typeControls: Record<string, ManifestControl> = Object.fromEntries(
        Object.entries(typeInfo).map(([name, info]) => [name, { name, ...info }]),
      );

      return {
        id: p.id,
        name: p.name ?? p.id,
        group: p.group ?? "",
        section: deriveSection(sourcePath),
        background: render.background,
        stories: p.fixtures.map((f) => ({
          id: f.id,
          label: f.label,
          props: f.props,
        })),
        controls: mergeControls(p.fixtures, typeControls),
        sourcePath,
      };
    }),
```

- [ ] **Step 5: Run the tests to verify pass**

Run: `pnpm --filter @gobrand/openstory-vite-plugin test`
Expected: PASS (new `buildManifest` case + existing plugin/discover/derive-section tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @gobrand/openstory-vite-plugin typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/vite-plugin/src/plugin.ts packages/vite-plugin/src/plugin.test.ts
git commit -m "feat(controls): extract prop types in buildManifest, merge over values"
```

---

## Task 5: Render select/radio in the controls panel

**Files:**
- Modify: `apps/desktop/src/components/right-panel.tsx` (`InspectPanel`, the control `.map` ~lines 101-131)

There is no `InspectPanel` render-test harness today, so this task is verified by
typecheck + a manual check. The control-value flow (`onSetControl` →
`preview:setProps` → `propOverrides` → bridge) is unchanged.

- [ ] **Step 1: Add the select + radio branches**

In `apps/desktop/src/components/right-panel.tsx`, inside `InspectPanel`'s
`component.controls.map((c) => { ... })`, the value line stays:

```tsx
              const value = state.selection.propOverrides[c.name] ?? story.props[c.name];
```

Extend the kind ladder. Replace the existing `c.kind === "boolean" ? (...) : c.kind === "number" ? (...) : (text)` ternary with one that handles select/radio first:

```tsx
                  {c.kind === "select" ? (
                    <select
                      value={typeof value === "string" ? value : ""}
                      onChange={(e) => onSetControl(c.name, e.target.value)}
                      className="h-8 rounded-lg border border-border bg-card px-2.5 text-[12px] text-foreground transition-colors focus-visible:border-brand/60 focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
                    >
                      {(c.options ?? []).map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : c.kind === "radio" ? (
                    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                      {(c.options ?? []).map((opt) => (
                        <label key={opt} className="flex items-center gap-1.5 text-[12px]">
                          <input
                            type="radio"
                            name={c.name}
                            value={opt}
                            checked={value === opt}
                            onChange={() => onSetControl(c.name, opt)}
                            className="size-3.5 accent-[var(--color-brand)]"
                          />
                          {opt}
                        </label>
                      ))}
                    </div>
                  ) : c.kind === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={Boolean(value)}
                      onChange={(e) => onSetControl(c.name, e.target.checked)}
                      className="size-4 accent-[var(--color-brand)]"
                    />
                  ) : c.kind === "number" ? (
                    <input
                      type="number"
                      value={typeof value === "number" ? value : ""}
                      onChange={(e) => {
                        const n = e.target.valueAsNumber;
                        if (!Number.isNaN(n)) onSetControl(c.name, n);
                      }}
                      className="h-8 rounded-lg border border-border bg-card px-2.5 text-[12px] text-foreground transition-colors focus-visible:border-brand/60 focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
                    />
                  ) : (
                    <input
                      type="text"
                      value={typeof value === "string" ? value : ""}
                      onChange={(e) => onSetControl(c.name, e.target.value)}
                      className="h-8 rounded-lg border border-border bg-card px-2.5 text-[12px] text-foreground transition-colors focus-visible:border-brand/60 focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:outline-none"
                    />
                  )}
```

- [ ] **Step 2: Typecheck the desktop app**

Run: `pnpm --filter openstory-desktop typecheck`
Expected: PASS. (`c.options` is typed via the widened `ManifestControl`.)

- [ ] **Step 3: Manual verification**

Run: `pnpm --filter openstory-desktop dev`, load a repo with a component whose
prop is a string-literal union (e.g. `variant`). Confirm:
- `variant` renders as a **select** (>5 options) or **radio** (≤5).
- Changing it re-renders the preview live.
- A plain string prop (e.g. `label`/`children`) still renders as a **text** input.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/components/right-panel.tsx
git commit -m "feat(controls): render select/radio controls in the inspect panel"
```

---

## Self-Review

**Spec coverage:**
- Vendored TS extractor, no new dep → Task 3. ✓
- string-literal union → select/radio, ≤5 radio threshold → Task 3 `classify` + tests. ✓
- Keep boolean/number/text, value fallback → Task 2 `mergeControls` + Task 3 `classify`. ✓
- `ManifestControl` widening (both definitions) → Task 1. ✓
- Build-time extraction in `buildManifest`, program caching → Task 3 (`getProgram`) + Task 4. ✓
- Merge precedence / zero-config preserved → Task 2 tests. ✓
- UI select/radio, value flow unchanged → Task 5. ✓
- Edge cases (optional union, forwardRef/FC, export-name mismatch, missing file) → Task 3 `getPropsType` + `pickComponentSymbol` + tests. ✓
- Deferred (object/array, color/date, numeric/enum) → not implemented, by design. ✓

**Type consistency:** `PropTypeInfo` (Task 3) has the same kinds as the widened `ManifestControl` (Task 1); `{ name, ...info }` (Task 4) produces a valid `ManifestControl`. `mergeControls(fixtures, Record<string, ManifestControl>)` signature matches its call site in Task 4. `extractPropTypes(sourcePath, exportName, projectRoot)` signature matches the call in Task 4 and the tests in Task 3.

**Placeholders:** none — every code step is complete.
