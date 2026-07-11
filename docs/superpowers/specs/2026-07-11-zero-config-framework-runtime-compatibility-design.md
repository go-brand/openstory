# Zero-config framework and runtime compatibility

**Date:** 2026-07-11

## Goal

Adding OpenStory to a Vite project should require only `openStory()`:

```ts
export default defineConfig({
  plugins: [react(), openStory(), tanstackStart(), cloudflare()],
});
```

Consumers must not need an `openstory` mode branch, manual dependency-optimizer
settings, or special handling for supported framework and runtime plugins.
Normal development and production builds must remain unchanged.

## Terminology

Cloudflare is not a framework. It is a platform/runtime, and
`@cloudflare/vite-plugin` is a runtime adapter. Documentation and diagnostics
will refer to **framework and runtime plugins** or, when describing the shared
technical trait, **plugins that own the development request pipeline**.

## Approaches considered

### 1. Supported compatibility registry (selected)

In `openstory` mode, identify known incompatible Vite plugin families by their
resolved plugin names and prevent those plugins from participating in the
OpenStory server. OpenStory also clears application dependency-scan and warmup
entries that can crawl framework-only virtual modules.

This gives consumers the intended one-line setup while keeping the behavior
explicit, testable, and narrow. New integrations can be added deliberately as
compatibility is verified.

### 2. Middleware interception only

Always put `/__pl__/` ahead of all other middleware and leave every framework
and runtime plugin active. This protects the route but does not prevent plugin
startup work, extra Vite environments, application warmup, or dependency scans
from loading framework-only virtual modules. It fixes only one of the two known
failure classes.

### 3. Disable every plugin with server middleware

Treat any plugin with `configureServer` as incompatible. This is unsafe:
React refresh, Tailwind, testing tools, and many ordinary Vite integrations use
server hooks without owning the application request pipeline. Vite exposes no
semantic capability flag that distinguishes them.

## Design

### Activation

The compatibility behavior activates only when Vite's mode is `openstory`.
Outside that mode, `openStory()` must not alter other plugins, dependency
optimization, warmup, environments, or middleware.

The OpenStory plugin remains `enforce: "pre"` and its config hook runs with
pre-ordering so compatibility is established before supported adapters run
their config hooks. The documented plugin list keeps `openStory()` before
framework/runtime adapters, as in the example above.

### Compatibility registry

A focused module owns named compatibility rules. Each rule contains:

- a stable integration identifier and user-facing label;
- plugin-name predicates covering the complete plugin family returned by the
  adapter factory;
- the OpenStory-mode action, initially disabling that plugin family's Vite
  hooks;
- fixture names used by unit and integration tests.

Initial supported families:

- TanStack Start (`tanstack-react-start:*`, `tanstack-start-core:*`, and the
  associated Start plugin names returned by `tanstackStart()`);
- Cloudflare (`vite-plugin-cloudflare` and `vite-plugin-cloudflare:*`).

Matching is based on instantiated Vite plugin names, not `package.json`
dependencies or filesystem heuristics. A dependency can be installed without
being active, while plugin names describe the configuration Vite will actually
run.

OpenStory must suppress the whole supported plugin family rather than only its
middleware hook. Their config and environment hooks create the framework-owned
pipeline and virtual-module graph that OpenStory is intentionally avoiding.

### Vite config normalization

In `openstory` mode, OpenStory mutates the in-flight Vite config before it is
resolved:

- set root dependency-optimization `entries` to an empty array;
- clear client dependency-optimization entries when explicitly configured;
- clear `server.warmup.clientFiles` and `server.warmup.ssrFiles`;
- preserve explicit dependency `include`, `exclude`, aliases, React dedupe,
  CSS plugins, and all unrelated Vite settings.

Direct mutation is required for the array fields because Vite's returned config
merge can concatenate arrays. It also ensures application-level scan entries do
not survive the OpenStory override.

### Unsupported plugins and escape hatch

OpenStory will not guess that an unknown plugin is incompatible merely because
it registers middleware. Unknown plugins stay enabled.

`openStory()` gains an advanced `compatibility` option with `disable` and
`keep` arrays of exact plugin names. `disable` suppresses an unrecognized
plugin; `keep` opts a built-in match back in and wins if the same name appears
in both arrays. The default path remains argument-free. This option is an
escape hatch, not a replacement for adding verified integrations to the
built-in registry.

When startup or the harness fails, diagnostics should list detected pipeline
owners and point to the compatibility option. OpenStory must never silently
disable an unknown plugin.

## Tests

### Unit tests

- compatibility is inactive outside `openstory` mode;
- TanStack Start plugin names are recognized while unrelated TanStack plugins
  are not;
- Cloudflare plugin names are recognized while unrelated Cloudflare plugins are
  not;
- supported plugin hooks are suppressed before they execute;
- optimizer entries and warmup files are cleared without losing include,
  exclude, aliases, or unrelated settings;
- custom compatibility additions and exclusions are deterministic.

### Integration tests

Boot real Vite servers for representative configurations and request
`/__pl__/` plus `/__pl__/manifest.json`:

- plain React and Vite;
- React plus TanStack Start;
- React plus Cloudflare;
- React plus TanStack Start and Cloudflare together.

Each server must start in `openstory` mode without framework virtual-module
optimizer failures, return the OpenStory harness, and discover a fixture story.
At least one control test must show the same adapters remain active in normal
development mode.

## Documentation

Replace the mode-gated setup with the single `openStory()` example. Explain in
one short note that OpenStory detects supported framework and runtime adapters
in its own mode and isolates the preview harness automatically. Keep an
advanced troubleshooting section for unsupported pipeline-owning plugins and
the compatibility escape hatch.

The package README and root README must use the same terminology and example.

## Done criteria

- the TanStack Start plus Cloudflare consumer configuration needs only
  `openStory()`;
- the OpenStory harness and manifest work in the real representative fixture;
- normal Vite modes retain their original adapter behavior;
- focused tests, package tests, typecheck, lint, and build pass;
- public docs no longer instruct users to branch on `mode` or manually set
  `optimizeDeps.entries`.
