# @gobrand/openstory-next

Native OpenStory adapter for Next.js 16 App Router projects using Turbopack.

## Install

```bash
pnpm add -D @gobrand/openstory-config @gobrand/openstory-next
```

Open the project in the OpenStory manager, or run `openstory-next` from the
project root. No `next.config` wrapper is required.

The adapter generates a disposable App Router application under
`.openstory/cache/next`, starts the project's installed Next.js and Turbopack on
a loopback port, and serves `/__pl__/`, `/__pl__/manifest.json`, and
`/__pl__/mcp`. Add `.openstory/` to the project's ignore file.

## Support

The v1 surface is Next.js `>=16 <17`, React 19, App Router, Turbopack development
mode, and client-compatible stories. Client stories can use Next navigation,
images, links, aliases, providers, CSS, Tailwind, and PostCSS.

Pages Router, webpack mode, React Server Component stories, Server Actions,
Node-only story graphs, and production harness export are not supported. Direct
`server-only` and `"use server"` story boundaries fail before startup with an
actionable error.
