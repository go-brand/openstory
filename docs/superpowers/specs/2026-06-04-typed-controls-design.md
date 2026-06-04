# Typed controls — Storybook parity

**Date:** 2026-06-04
**Status:** Approved design, pre-implementation
**North star:** match Storybook's typed-control behavior first, surpass later.

## Problem

Controls today are inferred from fixture **values** (`deriveControls` in
`packages/config/src/define.ts`): a value's runtime type picks the control kind
(`string → text`, `boolean → boolean`, `number → number`). This cannot tell an
**enum** from **free text** — `variant: "primary"` and `children: "Primary"`
are both strings, so both render as text inputs. A user can type any string into
`variant` even though its TypeScript type only permits
`"primary" | "secondary" | "ghost" | …`.

Goal: a prop typed as a string-literal union renders as a **select** (or radio)
listing exactly the allowed values, while genuinely free-text props stay text.
The only reliable signal that distinguishes them is the **TypeScript type**, so
extraction must read types, not values.

## Approach decision

Replicate Storybook's pipeline (parse source types → union-of-literals → enum →
select/radio) but implement extraction with a **vendored TypeScript-compiler
extractor** rather than depending on `react-docgen` / `react-docgen-typescript`.

Rationale:
- `typescript` is **already a dependency** of `packages/vite-plugin`. The
  TS `TypeChecker` resolves aliased and imported union types correctly — the
  exact capability we want — with **zero new packages** and no supply-chain
  surface (a stated project constraint).
- Storybook's default, `react-docgen` (Babel), reports imported/aliased enums as
  `any`; `react-docgen-typescript` handles them but is a third-party dep with a
  slower release cadence and needs `shouldExtractLiteralValuesFromEnum: true`.
- Our scope (string-literal unions → options) is a small slice of either
  library — ~200 lines we own and can test directly.

## v1 scope

In scope:
- Extract prop types from a component's source file via the TS compiler.
- string-literal **union → `select`**, with Storybook's threshold: **≤ 5
  options → `radio`**, otherwise `select`.
- Keep value-inferred `boolean` / `number` / `text` (type-driven when available,
  value-derived as fallback).

Deferred (still "same as Storybook", additive later):
- object/array (JSON) editor.
- color/date controls inferred by prop-name matchers.
- numeric-literal unions, TS `enum` declarations, `as const` tuples.

## Architecture & data flow

```
build time (packages/vite-plugin, Node)               UI (apps/desktop)
─────────────────────────────────────                ─────────────────
component { sourcePath, name }
        │
        ▼
extractPropTypes(sourcePath, name, program)  ← NEW, vendored (uses `typescript`)
        │   ts.Program (cached) → locate export → props type
        │   → checker.getPropertiesOfType() → per-prop SBType
        ▼
mergeControls(typeControls, deriveControls(fixtures))   ← type wins, value fallback
        ▼
ManifestControl[]  →  manifest  →  IPC  →  InspectPanel renders <select>/<radio>
```

Extraction runs build-time inside `buildManifest` (`packages/vite-plugin/src/plugin.ts`),
which already executes server-side with filesystem access. The manager UI is
unchanged except for rendering the new control kinds.

## New unit: `extractPropTypes`

Location: `packages/vite-plugin/src/extract-prop-types.ts` (new).

Responsibility: given a component source file and export name, return the
type-derived control kind per prop. One job, one file, independently testable.

Interface (illustrative):

```ts
export type PropTypeInfo =
  | { kind: "select" | "radio"; options: string[] }
  | { kind: "boolean" }
  | { kind: "number" }
  | { kind: "text" };

export function extractPropTypes(
  sourcePath: string,
  exportName: string,           // component's declared/displayName; "default" for default export
  program: ts.Program,          // cached, shared across components in a build
): Record<string, PropTypeInfo>;
```

Algorithm:
1. `program.getSourceFile(sourcePath)`; bail (return `{}`) if absent.
2. Resolve the component symbol: named export matching `exportName`, else the
   default export. Handle `function`, `const X = (props) => …`, `React.FC<P>`,
   and `forwardRef` (unwrap to the props type). If unresolved, return `{}`.
3. Get the props type: first call-signature parameter type, or the type argument
   of `FC<P>` / `forwardRef<_, P>`.
4. `checker.getPropertiesOfType(propsType)`; for each property symbol get its
   type via `checker.getTypeOfSymbolAtLocation`.
5. Classify (mirrors Storybook `convert` + `inferControls`):
   - Union whose non-`undefined`/`null` members are **all string literals** →
     collect literal values; `options.length <= 5 ? "radio" : "select"`.
   - `boolean` → `boolean`; `number` → `number`; `string` → `text`.
   - Anything else → omit (value-inference fallback may still supply a control).

Edge cases handled explicitly: optional props (`v?: …` — strip `undefined`),
`null` in the union, single-member unions, props with no usable type. Generics
beyond the props type argument are out of scope for v1 (return text/omit).

## Caching

The `ts.Program` is the costly part. Build **one program per manifest build**,
reuse it across all components, and rebuild only when a relevant source file
changes (mtime check, consistent with HMR-triggered `buildManifest` calls).
A stale or failed program must degrade gracefully to value-inference, never throw.

## Control mapping (mirror `inferControls.ts`)

| Prop type (extracted)        | Control kind            |
|------------------------------|-------------------------|
| string-literal union, ≤5     | `radio` + `options`     |
| string-literal union, >5     | `select` + `options`    |
| boolean                      | `boolean`               |
| number                       | `number`                |
| string                       | `text`                  |
| (object/array, color/date)   | deferred                |

## Type changes

`ManifestControl` is defined twice and both must change identically:
- `packages/config/src/define.ts`
- `apps/desktop/electron/types.ts`

```ts
export type ManifestControl = {
  name: string;
  kind: "text" | "boolean" | "number" | "select" | "radio";
  options?: string[];   // present only for select/radio
};
```

## Merge precedence: `mergeControls`

Location: `packages/config/src/define.ts` (beside `deriveControls`), or a small
new module if it keeps `define.ts` focused.

- Start from type-derived controls (authoritative).
- For props with no type info, fall back to the value-derived control.
- A prop only ever yields one control. Order: union of prop names in
  first-seen order across fixtures (matches current `deriveControls` ordering),
  type info layered on top.
- No `sourcePath` / no program / extraction failure → result equals today's
  `deriveControls(fixtures)`. Zero-config behavior is preserved exactly.

## UI changes

`apps/desktop/src/components/right-panel.tsx`, `InspectPanel`:
- Add a `select` branch: `<select>` with one `<option>` per `control.options`,
  current value from `propOverrides[name] ?? story.props[name]`, change →
  `onSetControl(name, value)`.
- Add a `radio` branch: a radio group over `control.options`.
- Existing boolean/number/text branches unchanged.

Value flow is unchanged: `onSetControl` → `preview:setProps` → `propOverrides`
→ bridge `pl:render` → iframe re-render. No bridge/protocol changes.

## Testing

- `extract-prop-types.test.ts` against sample `.tsx` sources: inline union,
  aliased union (`type Variant = …`), imported union (cross-file), optional
  union (`v?:`), boolean, number, plain string, no-type/JS → asserts kinds +
  options + the ≤5 radio / >5 select boundary.
- `mergeControls` test: type wins; value fallback when no type info; no
  `sourcePath` reproduces `deriveControls` output exactly.
- Control-mapping test: union size → radio vs select.
- UI: extend existing desktop tests minimally if a render harness exists;
  otherwise rely on the unit coverage above (no `InspectPanel` harness today).

## Non-goals

- No new runtime dependency.
- No bridge/IPC protocol change.
- No author-declared `argTypes` override API (revisit when surpassing Storybook).
- No object/array/color/date controls in v1.

## Open risks

- Component-shape resolution (forwardRef, HOC-wrapped, re-exported) is the
  fiddliest part; v1 covers function components, arrow consts, `FC<P>`, and a
  single `forwardRef` unwrap. Anything else degrades to value-inference.
- Monorepo include scope: types declared in a workspace package outside the
  program's roots may not resolve. Build the program from the consumer project's
  tsconfig so its declared types are in range; document the limitation.
